mod cache;
mod models;
mod proxy;
mod scraper_doujinth;
mod scraper_miku;

use axum::{
    extract::{Path, Query},
    http::{header, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use serde_json::json;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

#[derive(Deserialize)]
struct PageQuery {
    page: Option<i32>,
}

#[derive(Deserialize)]
struct SearchQuery {
    q: Option<String>,
    page: Option<i32>,
}

// ================= MIDDLEWARE =================

async fn no_cache_middleware(req: axum::extract::Request, next: Next) -> Response {
    let path = req.uri().path().to_string();
    let mut response = next.run(req).await;

    // Do not cache API or SPA HTML/JS/CSS, but allow proxy images to cache
    if !path.starts_with("/api/proxy-image") {
        let headers = response.headers_mut();
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-cache, no-store, must-revalidate, max-age=0"),
        );
        headers.insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
        headers.insert(header::EXPIRES, HeaderValue::from_static("0"));
    }

    response
}

// ================= HEALTH CHECK =================

async fn api_health() -> impl IntoResponse {
    Json(json!({
        "status": "healthy",
        "service": "Dual Manga Scraper & Reader (Rust Axum Engine)",
        "version": "2.0.0",
        "sources": [
            {"id": "miku", "name": "Miku-Doujin", "url": "https://miku-doujin.com/"},
            {"id": "doujinth", "name": "Doujin-TH", "url": "https://doujin-th.com/"}
        ]
    }))
}

// ================= MIKU HANDLERS =================

async fn miku_latest(Query(pq): Query<PageQuery>) -> Result<Json<models::CatalogResponse>, StatusCode> {
    let page = pq.page.unwrap_or(1).max(1);
    let cache_key = format!("miku:latest:{}", page);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::CatalogResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_miku::get_miku_latest(page)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn miku_featured(Query(pq): Query<PageQuery>) -> Result<Json<models::CatalogResponse>, StatusCode> {
    let page = pq.page.unwrap_or(1).max(1);
    let cache_key = format!("miku:featured:{}", page);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::CatalogResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_miku::get_miku_featured(page)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn miku_random() -> Result<Json<models::RandomResponse>, StatusCode> {
    scraper_miku::get_miku_random()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn miku_search(Query(sq): Query<SearchQuery>) -> Result<Json<models::CatalogResponse>, StatusCode> {
    let q = sq.q.unwrap_or_default();
    if q.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let page = sq.page.unwrap_or(1).max(1);
    let cache_key = format!("miku:search:{}:{}", q, page);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::CatalogResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_miku::search_miku(&q, page)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn miku_tag(
    Path(tag_name): Path<String>,
    Query(pq): Query<PageQuery>,
) -> Result<Json<models::CatalogResponse>, StatusCode> {
    let page = pq.page.unwrap_or(1).max(1);
    let cache_key = format!("miku:tag:{}:{}", tag_name, page);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::CatalogResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_miku::get_miku_by_tag(&tag_name, page)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn miku_detail(Path(slug): Path<String>) -> Result<Json<models::DetailResponse>, StatusCode> {
    let cache_key = format!("miku:detail:{}", slug);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::DetailResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_miku::get_miku_detail(&slug)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn miku_chapter(Path(chapter_id): Path<String>) -> Result<Json<models::ChapterImagesResponse>, StatusCode> {
    let cache_key = format!("miku:chapter:{}", chapter_id);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::ChapterImagesResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_miku::get_miku_chapter_images(&chapter_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

// ================= DOUJIN-TH HANDLERS =================

async fn doujinth_latest(Query(pq): Query<PageQuery>) -> Result<Json<models::CatalogResponse>, StatusCode> {
    let page = pq.page.unwrap_or(1).max(1);
    let cache_key = format!("doujinth:latest:{}", page);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::CatalogResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_doujinth::get_doujinth_latest(page)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn doujinth_featured(Query(pq): Query<PageQuery>) -> Result<Json<models::CatalogResponse>, StatusCode> {
    let page = pq.page.unwrap_or(1).max(1);
    let cache_key = format!("doujinth:featured:{}", page);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::CatalogResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_doujinth::get_doujinth_featured(page)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn doujinth_random() -> Result<Json<models::RandomResponse>, StatusCode> {
    scraper_doujinth::get_doujinth_random()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn doujinth_search(Query(sq): Query<SearchQuery>) -> Result<Json<models::CatalogResponse>, StatusCode> {
    let q = sq.q.unwrap_or_default();
    if q.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let page = sq.page.unwrap_or(1).max(1);
    let cache_key = format!("doujinth:search:{}:{}", q, page);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::CatalogResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_doujinth::search_doujinth(&q, page)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn doujinth_tag(
    Path(tag_name): Path<String>,
    Query(pq): Query<PageQuery>,
) -> Result<Json<models::CatalogResponse>, StatusCode> {
    let page = pq.page.unwrap_or(1).max(1);
    let cache_key = format!("doujinth:tag:{}:{}", tag_name, page);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::CatalogResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_doujinth::search_doujinth(&tag_name, page)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn doujinth_detail(Path(topic_id): Path<String>) -> Result<Json<models::DetailResponse>, StatusCode> {
    let cache_key = format!("doujinth:detail:{}", topic_id);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::DetailResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_doujinth::get_doujinth_detail(&topic_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

async fn doujinth_chapter(Path(topic_id): Path<String>) -> Result<Json<models::ChapterImagesResponse>, StatusCode> {
    let cache_key = format!("doujinth:chapter:{}", topic_id);
    if let Some(cached_str) = cache::get_cached(&cache_key).await {
        if let Ok(res) = serde_json::from_str::<models::ChapterImagesResponse>(&cached_str) {
            return Ok(Json(res));
        }
    }

    let res = scraper_doujinth::get_doujinth_chapter_images(&topic_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Ok(json_str) = serde_json::to_string(&res) {
        cache::set_cached(&cache_key, json_str).await;
    }

    Ok(Json(res))
}

// ================= MAIN FUNCTION =================

#[tokio::main]
async fn main() {
    println!("🦀 Initializing MangaVerse Rust (Axum) High-Performance Server...");

    // Static assets service
    let serve_dir = ServeDir::new("static")
        .not_found_service(ServeFile::new("static/index.html"));

    let api_routes = Router::new()
        .route("/health", get(api_health))
        .route("/proxy-image", get(proxy::proxy_image_handler))
        // Miku
        .route("/miku/latest", get(miku_latest))
        .route("/miku/featured", get(miku_featured))
        .route("/miku/random", get(miku_random))
        .route("/miku/search", get(miku_search))
        .route("/miku/tag/:tag_name", get(miku_tag))
        .route("/miku/detail/:slug", get(miku_detail))
        .route("/miku/chapter/:chapter_id", get(miku_chapter))
        // Doujin-TH
        .route("/doujinth/latest", get(doujinth_latest))
        .route("/doujinth/featured", get(doujinth_featured))
        .route("/doujinth/random", get(doujinth_random))
        .route("/doujinth/search", get(doujinth_search))
        .route("/doujinth/tag/:tag_name", get(doujinth_tag))
        .route("/doujinth/detail/:topic_id", get(doujinth_detail))
        .route("/doujinth/chapter/:topic_id", get(doujinth_chapter));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(serve_dir)
        .layer(middleware::from_fn(no_cache_middleware))
        .layer(CorsLayer::permissive());

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8000".to_string())
        .parse()
        .unwrap_or(8000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("🚀 Server ready! Listening on http://localhost:{}", port);
    println!("📦 Static web directory: static/");
    println!("⚡ Native Concurrency & Sub-millisecond Execution Active.");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
