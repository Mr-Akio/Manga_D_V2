use crate::models::{
    CatalogResponse, ChapterImage, ChapterImagesResponse, ChapterItem, DetailResponse, MangaItem,
    RandomResponse,
};
use rand::seq::SliceRandom;
use rand::Rng;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, REFERER, USER_AGENT};
use scraper::{Html, Selector};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const USER_AGENT_STR: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
const DOUJINTH_REFERER: &str = "https://doujin-th.com/";

fn build_client() -> reqwest::Client {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("th-TH,th;q=0.9,en-US;q=0.8"));
    headers.insert(REFERER, HeaderValue::from_static(DOUJINTH_REFERER));

    reqwest::Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap()
}

pub async fn fetch_html(url: &str) -> Result<String, String> {
    let client = build_client();
    match client.get(url).send().await {
        Ok(res) if res.status().is_success() => {
            let text = res.text().await.map_err(|e| e.to_string())?;
            Ok(text)
        }
        err => {
            eprintln!("[DoujinTHScraper] Direct fetch failed for {}: {:?}. Trying Jina Relay...", url, err);
            let jina_url = format!("https://r.jina.ai/{}", url);
            let jina_client = reqwest::Client::builder()
                .timeout(Duration::from_secs(25))
                .build()
                .map_err(|e| e.to_string())?;

            let mut j_headers = HeaderMap::new();
            j_headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));
            j_headers.insert("X-Return-Format", HeaderValue::from_static("html"));

            let res = jina_client
                .get(&jina_url)
                .headers(j_headers)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let text = res.text().await.map_err(|e| e.to_string())?;
            Ok(text)
        }
    }
}

pub fn extract_grid_items(html_str: &str, badge_override: Option<&str>) -> Vec<MangaItem> {
    let document = Html::parse_document(html_str);

    // 1. Map style background images: #post_doujin_X { background-image: url('...'); }
    let mut style_imgs: HashMap<String, (String, Option<String>)> = HashMap::new();
    let re_block = Regex::new(r"#post_doujin_(\d+)\s*\{[^}]*background-image:\s*([^;]+);").unwrap();
    let re_url = Regex::new(r#"url\(['"]?([^'")]+)['"]?\)"#).unwrap();

    let style_sel = Selector::parse("style").unwrap();
    for style_elem in document.select(&style_sel) {
        let text = style_elem.text().collect::<Vec<_>>().join("");
        if text.contains("post_doujin") {
            for cap in re_block.captures_iter(&text) {
                let pid = cap.get(1).map_or("", |m| m.as_str()).to_string();
                let bg_val = cap.get(2).map_or("", |m| m.as_str());

                let urls: Vec<String> = re_url
                    .captures_iter(bg_val)
                    .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
                    .collect();

                if !urls.is_empty() {
                    let clean_url = urls.iter().find(|u| u.contains("/clean/")).cloned();
                    let thai_url = urls.iter().find(|u| u.contains("/thai/")).cloned();

                    let base_thumb = clean_url.unwrap_or_else(|| urls.last().unwrap().clone());
                    let overlay_thumb = if let Some(ref t) = thai_url {
                        if t != &base_thumb {
                            Some(t.clone())
                        } else {
                            None
                        }
                    } else {
                        None
                    };

                    style_imgs.insert(pid, (base_thumb, overlay_thumb));
                }
            }
        }
    }

    // 2. Select card elements
    let mut cards_selector = Selector::parse(".hentai-item, .layer_grid a[href*='topic=']").unwrap();
    let mut cards: Vec<_> = document.select(&cards_selector).collect();
    if cards.is_empty() {
        cards_selector = Selector::parse("a[href*='topic=']").unwrap();
        cards = document.select(&cards_selector).collect();
    }

    let re_topic = Regex::new(r"topic=(\d+)").unwrap();
    let re_pid = Regex::new(r"post_doujin_(\d+)").unwrap();
    let name_sel = Selector::parse(".well, .topic_new_name").unwrap();
    let img_sel = Selector::parse("img").unwrap();

    let mut items = Vec::new();
    let mut seen_topics = HashSet::new();

    for a in cards {
        let href = a.value().attr("href").unwrap_or("").to_string();
        let topic_id = if let Some(cap) = re_topic.captures(&href) {
            cap.get(1).map_or("", |m| m.as_str()).to_string()
        } else {
            continue;
        };

        if topic_id.is_empty() || seen_topics.contains(&topic_id) {
            continue;
        }
        seen_topics.insert(topic_id.clone());

        let mut title = a.value().attr("title").unwrap_or("").trim().to_string();
        if title.is_empty() {
            if let Some(nd) = a.select(&name_sel).next() {
                title = nd.text().collect::<Vec<_>>().join(" ").trim().to_string();
            } else {
                title = a.text().collect::<Vec<_>>().join(" ").trim().to_string();
            }
        }

        // Image from style map or img tag
        let mut thumb = String::new();
        let mut thumb_overlay = None;

        let a_html = a.html();
        if let Some(pid_cap) = re_pid.captures(&a_html) {
            let pid = pid_cap.get(1).map_or("", |m| m.as_str());
            if let Some((base, overlay)) = style_imgs.get(pid) {
                thumb = base.clone();
                thumb_overlay = overlay.clone();
            }
        }

        if thumb.is_empty() {
            if let Some(img) = a.select(&img_sel).next() {
                thumb = img
                    .value()
                    .attr("src")
                    .or_else(|| img.value().attr("data-src"))
                    .unwrap_or("")
                    .to_string();
            }
        }

        let (clean_title, subtitle) = if let Some(idx) = title.find(" - [") {
            let (c, s) = title.split_at(idx);
            (c.trim().to_string(), Some(s.trim_start_matches(" -").trim().to_string()))
        } else {
            (title.clone(), None)
        };

        let full_url = if href.starts_with("http") {
            href
        } else {
            format!("https://doujin-th.com{}", href)
        };

        items.push(MangaItem {
            id: topic_id,
            title: if clean_title.is_empty() { title } else { clean_title },
            subtitle,
            url: full_url,
            thumbnail: thumb,
            thumbnail_overlay: thumb_overlay,
            latest_chapter: badge_override.unwrap_or("ตอนเดียวจบ").to_string(),
            updated_at: Some("อัปเดตล่าสุด".to_string()),
            source: "doujinth".to_string(),
        });
    }

    items
}

pub async fn get_doujinth_latest(page: i32) -> Result<CatalogResponse, String> {
    let offset = (page - 1) * 24;
    let url = format!("https://doujin-th.com/forum/index.php/board,1.{}.html", offset);
    let html = fetch_html(&url).await?;
    let items = extract_grid_items(&html, None);
    let has_next = items.len() >= 20;

    Ok(CatalogResponse {
        page,
        has_next,
        items,
        tag: None,
        query: None,
    })
}

pub async fn get_doujinth_featured(page: i32) -> Result<CatalogResponse, String> {
    if page == 1 {
        let url = "https://doujin-th.com/top-doujin/";
        let html = fetch_html(url).await?;
        let items = extract_grid_items(&html, Some("เรื่องเด่นยอดนิยม"));
        Ok(CatalogResponse {
            page,
            has_next: true,
            items,
            tag: None,
            query: None,
        })
    } else {
        let offset = (page - 1) * 24;
        let url = format!("https://doujin-th.com/forum/index.php/board,1.{}.html", offset);
        let html = fetch_html(&url).await?;
        let items = extract_grid_items(&html, Some("เรื่องเด่นแนะนำ"));
        let has_next = items.len() >= 20;

        Ok(CatalogResponse {
            page,
            has_next,
            items,
            tag: None,
            query: None,
        })
    }
}

pub async fn get_doujinth_random() -> Result<RandomResponse, String> {
    let rand_page: i32 = {
        let mut rng = rand::thread_rng();
        rng.gen_range(1..=50)
    };
    let offset = (rand_page - 1) * 24;
    let url = format!("https://doujin-th.com/forum/index.php/board,1.{}.html", offset);
    let html = fetch_html(&url).await?;
    let mut items = extract_grid_items(&html, Some("มังงะแบบสุ่ม"));
    {
        let mut rng = rand::thread_rng();
        items.shuffle(&mut rng);
    }

    Ok(RandomResponse { items })
}

pub async fn search_doujinth(keyword: &str, page: i32) -> Result<CatalogResponse, String> {
    let encoded_q = urlencoding::encode(keyword);
    let url = if page > 1 {
        format!("https://doujin-th.com/search?q={}&page={}", encoded_q, page)
    } else {
        format!("https://doujin-th.com/search?q={}", encoded_q)
    };

    let html = fetch_html(&url).await?;
    let items = extract_grid_items(&html, Some(&format!("ค้นหา #{}", keyword)));
    let has_next = items.len() >= 20;

    Ok(CatalogResponse {
        page,
        has_next,
        items,
        tag: Some(keyword.to_string()),
        query: Some(keyword.to_string()),
    })
}

pub async fn get_doujinth_detail(topic_id: &str) -> Result<DetailResponse, String> {
    let url = format!("https://doujin-th.com/forum/index.php?topic={}.0", topic_id);
    let html = fetch_html(&url).await?;
    let document = Html::parse_document(&html);

    // Title
    let mut title = String::new();
    let subj_sel = Selector::parse(".subject, #top_subject, h1, h2, h3").unwrap();
    if let Some(s) = document.select(&subj_sel).next() {
        title = s.text().collect::<Vec<_>>().join(" ").trim().to_string();
    }
    if title.is_empty() {
        let title_sel = Selector::parse("title").unwrap();
        if let Some(t) = document.select(&title_sel).next() {
            title = t
                .text()
                .collect::<Vec<_>>()
                .join("")
                .replace("| Doujin-TH.com", "")
                .trim()
                .to_string();
        }
    }

    // Tags
    let mut genres = Vec::new();
    let tag_sel = Selector::parse("a[href*='search?q='], a[href*='tag='], .tag, .badge").unwrap();
    for a in document.select(&tag_sel) {
        let t = a.text().collect::<Vec<_>>().join(" ").trim().to_string();
        if !t.is_empty() && !genres.contains(&t) {
            genres.push(t);
        }
    }

    // Cover
    let mut cover = String::new();
    let mut cover_overlay = None;
    let re_clean = Regex::new(r#""(https://s\d+\.hentaithai\.net/clean/[^"]+?\.webp)""#).unwrap();
    let re_thai = Regex::new(r#""(https://s\d+\.hentaithai\.net/thai/[^"]+?\.webp)""#).unwrap();

    let clean_m = re_clean.captures(&html);
    let thai_m = re_thai.captures(&html);

    if let Some(cm) = clean_m {
        cover = cm.get(1).map_or("", |m| m.as_str()).to_string();
        if let Some(tm) = thai_m {
            cover_overlay = Some(tm.get(1).map_or("", |m| m.as_str()).to_string());
        }
    } else if let Some(tm) = thai_m {
        cover = tm.get(1).map_or("", |m| m.as_str()).to_string();
    }

    let chapters = vec![ChapterItem {
        id: topic_id.to_string(),
        chapter_num: "1".to_string(),
        title: "อ่านทั้งหมด (Full Chapter)".to_string(),
        url: url.clone(),
    }];

    Ok(DetailResponse {
        id: topic_id.to_string(),
        title,
        url,
        thumbnail: cover,
        thumbnail_overlay: cover_overlay,
        genres,
        chapters,
        source: "doujinth".to_string(),
    })
}

pub async fn get_doujinth_chapter_images(topic_id: &str) -> Result<ChapterImagesResponse, String> {
    let chapter_url = format!("https://doujin-th.com/forum/index.php?topic={}.0", topic_id);
    let html = fetch_html(&chapter_url).await?;

    let mut pages = Vec::new();

    // 1. Parse var L = { "clean": "thai", ... }
    let re_l = Regex::new(r"var\s+L\s*=\s*(\{[\s\S]*?\n\s*\})").unwrap();
    let re_pair = Regex::new(
        r#""(https://[^"]+?/clean/[^"]+?\.webp)"\s*:\s*"(https://[^"]+?/thai/[^"]+?\.webp)""#,
    )
    .unwrap();

    if let Some(cap) = re_l.captures(&html) {
        let l_block = cap.get(1).map_or("", |m| m.as_str());
        for p in re_pair.captures_iter(l_block) {
            let clean = p.get(1).map_or("", |m| m.as_str()).to_string();
            let thai = p.get(2).map_or("", |m| m.as_str()).to_string();
            pages.push(ChapterImage::Dual {
                src: clean,
                overlay: Some(thai),
            });
        }
    }

    // 2. Fallback: Parse .hc-lp in DOM
    if pages.is_empty() {
        let document = Html::parse_document(&html);
        let lp_sel = Selector::parse(".hc-lp").unwrap();
        let img_sel = Selector::parse("img").unwrap();

        for lp in document.select(&lp_sel) {
            let imgs: Vec<_> = lp.select(&img_sel).collect();
            if imgs.len() >= 2 {
                let src = imgs[0]
                    .value()
                    .attr("src")
                    .or_else(|| imgs[0].value().attr("data-src"))
                    .unwrap_or("")
                    .to_string();
                let overlay = imgs[1]
                    .value()
                    .attr("src")
                    .or_else(|| imgs[1].value().attr("data-src"))
                    .unwrap_or("")
                    .to_string();
                pages.push(ChapterImage::Dual {
                    src,
                    overlay: Some(overlay),
                });
            } else if imgs.len() == 1 {
                let src = imgs[0]
                    .value()
                    .attr("src")
                    .or_else(|| imgs[0].value().attr("data-src"))
                    .unwrap_or("")
                    .to_string();
                pages.push(ChapterImage::Single(src));
            }
        }
    }

    // 3. Fallback: all images with hentaithai.net
    if pages.is_empty() {
        let document = Html::parse_document(&html);
        let img_sel = Selector::parse(".post img, .inner img, img").unwrap();
        let mut seen = HashSet::new();

        for img in document.select(&img_sel) {
            let src = img
                .value()
                .attr("src")
                .or_else(|| img.value().attr("data-src"))
                .unwrap_or("")
                .to_string();
            if src.contains("hentaithai.net")
                && !src.contains("logo")
                && !src.contains("banner")
                && !src.contains("icon")
                && !src.contains("sticker")
                && !src.contains("change-to-bw")
                && !seen.contains(&src)
            {
                seen.insert(src.clone());
                pages.push(ChapterImage::Single(src));
            }
        }
    }

    let total = pages.len();
    Ok(ChapterImagesResponse {
        chapter_id: topic_id.to_string(),
        url: chapter_url,
        images: pages,
        total_pages: total,
        prev_chapter: None,
        next_chapter: None,
        source: "doujinth".to_string(),
    })
}
