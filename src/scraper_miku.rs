use crate::models::{CatalogResponse, ChapterImage, ChapterImagesResponse, ChapterItem, DetailResponse, MangaItem, RandomResponse};
use rand::seq::SliceRandom;
use rand::Rng;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, REFERER, USER_AGENT};
use scraper::{Html, Selector};
use std::collections::HashSet;
use std::time::Duration;

const USER_AGENT_STR: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
const MIKU_REFERER: &str = "https://miku-doujin.com/";

fn build_client() -> reqwest::Client {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("th-TH,th;q=0.9,en-US;q=0.8"));
    headers.insert(REFERER, HeaderValue::from_static(MIKU_REFERER));

    reqwest::Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap()
}

pub async fn fetch_html(
    url: &str,
    post_form: Option<&[(&str, &str)]>,
    extra_headers: Option<HeaderMap>,
) -> Result<String, String> {
    let client = build_client();
    let mut req = if let Some(form) = post_form {
        client.post(url).form(form)
    } else {
        client.get(url)
    };

    if let Some(headers) = extra_headers {
        req = req.headers(headers);
    }

    match req.send().await {
        Ok(res) if res.status().is_success() => {
            let text = res.text().await.map_err(|e| e.to_string())?;
            Ok(text)
        }
        err => {
            eprintln!("[MikuScraper] Direct fetch failed for {}: {:?}. Trying Jina Relay...", url, err);
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

fn parse_miku_grid(html_str: &str, badge_override: Option<&str>) -> Vec<MangaItem> {
    let document = Html::parse_document(html_str);
    let col_sel = Selector::parse(".inz-col").unwrap();
    let a_sel = Selector::parse("a.inz-a, a").unwrap();
    let img_sel = Selector::parse("img").unwrap();
    let title_sel = Selector::parse(".inz-title, .title").unwrap();
    let time_sel = Selector::parse(".inz-time, small, .text-muted").unwrap();

    let mut items = Vec::new();

    for col in document.select(&col_sel) {
        let a_tag = match col.select(&a_sel).next() {
            Some(a) => a,
            None => continue,
        };

        let href = a_tag.value().attr("href").unwrap_or("").to_string();
        let slug = href
            .trim_matches('/')
            .split('/')
            .last()
            .unwrap_or("")
            .to_string();

        let mut thumb = String::new();
        let mut img_alt = String::new();
        if let Some(img) = col.select(&img_sel).next() {
            thumb = img
                .value()
                .attr("data-src")
                .or_else(|| img.value().attr("data-lazy-src"))
                .or_else(|| img.value().attr("src"))
                .unwrap_or("")
                .to_string();
            img_alt = img.value().attr("alt").unwrap_or("").to_string();
        }

        let mut title = if let Some(t_el) = col.select(&title_sel).next() {
            t_el.text().collect::<Vec<_>>().join(" ").trim().to_string()
        } else {
            a_tag.value().attr("title").unwrap_or("").to_string()
        };

        if title.is_empty() {
            title = img_alt;
        }

        let time_text = if let Some(t_el) = col.select(&time_sel).next() {
            t_el.text().collect::<Vec<_>>().join(" ").trim().to_string()
        } else {
            String::new()
        };

        items.append(&mut vec![MangaItem {
            id: slug,
            title,
            subtitle: None,
            url: href,
            thumbnail: thumb,
            thumbnail_overlay: None,
            latest_chapter: badge_override.unwrap_or("ตอนล่าสุด").to_string(),
            updated_at: if time_text.is_empty() { None } else { Some(time_text) },
            source: "miku".to_string(),
        }]);
    }

    items
}

pub async fn get_miku_latest(page: i32) -> Result<CatalogResponse, String> {
    let url = if page > 1 {
        format!("https://miku-doujin.com/?page={}", page)
    } else {
        "https://miku-doujin.com/".to_string()
    };

    let html = fetch_html(&url, None, None).await?;
    let items = parse_miku_grid(&html, None);
    let has_next = items.len() >= 20;

    Ok(CatalogResponse {
        page,
        has_next,
        items,
        tag: None,
        query: None,
    })
}

pub async fn get_miku_featured(page: i32) -> Result<CatalogResponse, String> {
    let encoded_genre = urlencoding::encode("ภาพสี");
    let url = if page > 1 {
        format!("https://miku-doujin.com/genre/{}/?page={}", encoded_genre, page)
    } else {
        format!("https://miku-doujin.com/genre/{}/", encoded_genre)
    };

    let html = fetch_html(&url, None, None).await?;
    let items = parse_miku_grid(&html, Some("เรื่องเด่น"));
    let has_next = items.len() >= 12;

    Ok(CatalogResponse {
        page,
        has_next,
        items,
        tag: None,
        query: None,
    })
}

pub async fn get_miku_random() -> Result<RandomResponse, String> {
    let rand_page: i32 = {
        let mut rng = rand::thread_rng();
        rng.gen_range(1..=15)
    };
    let mut cat = get_miku_latest(rand_page).await?;
    {
        let mut rng = rand::thread_rng();
        cat.items.shuffle(&mut rng);
    }
    for it in &mut cat.items {
        it.latest_chapter = "มังงะแบบสุ่ม".to_string();
    }

    Ok(RandomResponse { items: cat.items })
}

pub async fn get_miku_by_tag(tag: &str, page: i32) -> Result<CatalogResponse, String> {
    let mapped_tag = match tag {
        "สาวแกล" => "สาวเกล",
        "แม่บ้าน" | "สาวใหญ่" => "สาวใหญ่/แม่บ้าน",
        other => other,
    };

    let encoded_tag = urlencoding::encode(mapped_tag);
    let url = if page > 1 {
        format!("https://miku-doujin.com/genre/{}/?page={}", encoded_tag, page)
    } else {
        format!("https://miku-doujin.com/genre/{}/", encoded_tag)
    };

    let html = fetch_html(&url, None, None).await?;
    let items = parse_miku_grid(&html, Some(&format!("หมวด #{}", tag)));

    if items.is_empty() {
        return search_miku(tag, page).await;
    }

    let has_next = items.len() >= 12;
    Ok(CatalogResponse {
        page,
        has_next,
        items,
        tag: Some(tag.to_string()),
        query: None,
    })
}

pub async fn search_miku(keyword: &str, page: i32) -> Result<CatalogResponse, String> {
    let url = "https://miku-doujin.com/controller/search/general/";
    let mut headers = HeaderMap::new();
    headers.insert("X-Requested-With", HeaderValue::from_static("XMLHttpRequest"));
    headers.insert(REFERER, HeaderValue::from_static("https://miku-doujin.com/search/"));

    let form_data = [("keysearch", keyword)];
    let html = fetch_html(url, Some(&form_data), Some(headers)).await?;
    let items = parse_miku_grid(&html, None);

    Ok(CatalogResponse {
        page,
        has_next: false,
        items,
        tag: None,
        query: Some(keyword.to_string()),
    })
}

pub async fn get_miku_detail(slug: &str) -> Result<DetailResponse, String> {
    let url = format!("https://miku-doujin.com/{}/", slug);
    let html = fetch_html(&url, None, None).await?;
    let document = Html::parse_document(&html);

    // Title
    let mut title = String::new();
    let header_sel = Selector::parse("h1, .entry-title, .card-header").unwrap();
    if let Some(h) = document.select(&header_sel).next() {
        title = h.text().collect::<Vec<_>>().join(" ").trim().to_string();
    }
    if title.is_empty() || title.len() < 3 {
        let title_sel = Selector::parse("title").unwrap();
        if let Some(t) = document.select(&title_sel).next() {
            title = t
                .text()
                .collect::<Vec<_>>()
                .join("")
                .replace("อ่านโดจิน :", "")
                .replace("| Doujin แปลไทย", "")
                .trim()
                .to_string();
        }
    }

    // Cover
    let mut cover = String::new();
    let thumb_sel = Selector::parse(
        "img[src*='uploads/thumbnail'], img[data-src*='uploads/thumbnail'], .card-body img",
    )
    .unwrap();
    if let Some(img) = document.select(&thumb_sel).next() {
        cover = img
            .value()
            .attr("data-src")
            .or_else(|| img.value().attr("src"))
            .unwrap_or("")
            .to_string();
    }

    // Genres
    let mut genres = Vec::new();
    let genre_sel = Selector::parse(
        "a[href*='/genre/'], a[href*='/artist/'], a[href*='/story/'], a[href*='/language/']",
    )
    .unwrap();
    for badge in document.select(&genre_sel) {
        let g = badge.text().collect::<Vec<_>>().join(" ").trim().to_string();
        if !g.is_empty() && !genres.contains(&g) {
            genres.push(g);
        }
    }

    // Chapters
    let mut chapters = Vec::new();
    let ep_sel_str = format!("a[href*='/{}/ep-']", slug);
    if let Ok(ep_sel) = Selector::parse(&ep_sel_str) {
        let re_ep = Regex::new(r"ep-(\d+)").unwrap();
        let mut seen = HashSet::new();

        for a in document.select(&ep_sel) {
            let href = a.value().attr("href").unwrap_or("").to_string();
            if href.is_empty() || seen.contains(&href) {
                continue;
            }
            seen.insert(href.clone());

            let ep_num = if let Some(cap) = re_ep.captures(&href) {
                cap.get(1).map_or("1", |m| m.as_str()).to_string()
            } else {
                "1".to_string()
            };

            let mut ep_title = a.text().collect::<Vec<_>>().join(" ").trim().to_string();
            if ep_title.is_empty() {
                ep_title = format!("ตอนที่ {}", ep_num);
            }

            chapters.push(ChapterItem {
                id: format!("{}_ep-{}", slug, ep_num),
                chapter_num: ep_num,
                title: ep_title,
                url: href,
            });
        }
        chapters.sort_by_key(|c| c.chapter_num.parse::<i32>().unwrap_or(0));
    }

    if chapters.is_empty() {
        chapters.push(ChapterItem {
            id: format!("{}_ep-1", slug),
            chapter_num: "1".to_string(),
            title: "ตอนที่ 1 (จบในตอน)".to_string(),
            url: format!("https://miku-doujin.com/{}/ep-1/", slug),
        });
    }

    Ok(DetailResponse {
        id: slug.to_string(),
        title,
        url,
        thumbnail: cover,
        thumbnail_overlay: None,
        genres,
        chapters,
        source: "miku".to_string(),
    })
}

pub async fn get_miku_chapter_images(chapter_id: &str) -> Result<ChapterImagesResponse, String> {
    let parts: Vec<&str> = chapter_id.split('_').collect();
    let slug = parts[0];
    let ep_part = if parts.len() > 1 { parts[1] } else { "ep-1" };
    let chapter_url = format!("https://miku-doujin.com/{}/{}/", slug, ep_part);

    let html = fetch_html(&chapter_url, None, None).await?;
    let document = Html::parse_document(&html);

    let mut images = Vec::new();
    let mut seen = HashSet::new();

    // 1. Primary selector: #manga-content img (main webtoon vertical scroll container)
    // Note: miku-doujin.com has both #manga-content and #v-pills-tabContent containing the exact same images.
    // Querying .manga-content without specifying the container or deduplicating causes all images to duplicate 2x!
    let main_sel = Selector::parse("#manga-content img").unwrap();
    for img in document.select(&main_sel) {
        let src = img
            .value()
            .attr("data-src")
            .or_else(|| img.value().attr("src"))
            .unwrap_or("")
            .to_string();
        if src.contains("uploads/") && !src.contains("thumb") && !seen.contains(&src) {
            seen.insert(src.clone());
            images.push(ChapterImage::Single(src));
        }
    }

    // 2. Fallback: if #manga-content is missing, search .manga-content img with strict deduplication
    if images.is_empty() {
        let content_sel = Selector::parse(".manga-content img").unwrap();
        for img in document.select(&content_sel) {
            let src = img
                .value()
                .attr("data-src")
                .or_else(|| img.value().attr("src"))
                .unwrap_or("")
                .to_string();
            if src.contains("uploads/") && !src.contains("thumb") && !seen.contains(&src) {
                seen.insert(src.clone());
                images.push(ChapterImage::Single(src));
            }
        }
    }

    // 3. Fallback: all images on page
    if images.is_empty() {
        let img_sel = Selector::parse("img").unwrap();
        for img in document.select(&img_sel) {
            let src = img
                .value()
                .attr("data-src")
                .or_else(|| img.value().attr("src"))
                .unwrap_or("")
                .to_string();
            if src.contains("uploads/") && !src.contains("thumb") && !seen.contains(&src) {
                seen.insert(src.clone());
                images.push(ChapterImage::Single(src));
            }
        }
    }

    let mut prev_chapter = None;
    let mut next_chapter = None;
    let ep_link_sel = Selector::parse("a[href*='/ep-']").unwrap();
    for a in document.select(&ep_link_sel) {
        let text = a.text().collect::<Vec<_>>().join(" ");
        let href = a.value().attr("href").unwrap_or("").to_string();
        if text.contains("ก่อนหน้า") {
            prev_chapter = Some(href);
        } else if text.contains("ถัดไป") {
            next_chapter = Some(href);
        }
    }

    let total = images.len();
    Ok(ChapterImagesResponse {
        chapter_id: chapter_id.to_string(),
        url: chapter_url,
        images,
        total_pages: total,
        prev_chapter,
        next_chapter,
        source: "miku".to_string(),
    })
}
