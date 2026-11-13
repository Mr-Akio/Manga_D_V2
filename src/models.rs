use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MangaItem {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    pub url: String,
    pub thumbnail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_overlay: Option<String>,
    pub latest_chapter: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CatalogResponse {
    pub page: i32,
    pub has_next: bool,
    pub items: Vec<MangaItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RandomResponse {
    pub items: Vec<MangaItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterItem {
    pub id: String,
    pub chapter_num: String,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DetailResponse {
    pub id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_overlay: Option<String>,
    pub genres: Vec<String>,
    pub chapters: Vec<ChapterItem>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChapterImage {
    Single(String),
    Dual { src: String, overlay: Option<String> },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterImagesResponse {
    pub chapter_id: String,
    pub url: String,
    pub images: Vec<ChapterImage>,
    pub total_pages: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prev_chapter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_chapter: Option<String>,
    pub source: String,
}

