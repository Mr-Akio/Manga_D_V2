use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

static CACHE_STORE: OnceLock<RwLock<HashMap<String, (Instant, String)>>> = OnceLock::new();

fn get_cache() -> &'static RwLock<HashMap<String, (Instant, String)>> {
    CACHE_STORE.get_or_init(|| RwLock::new(HashMap::new()))
}

pub async fn get_cached(key: &str) -> Option<String> {
    let cache = get_cache().read().await;
    if let Some((inserted_at, val)) = cache.get(key) {
        // Cache valid for 5 minutes (300 seconds)
        if inserted_at.elapsed() < Duration::from_secs(300) {
            return Some(val.clone());
        }
    }
    None
}

pub async fn set_cached(key: &str, val: String) {
    let mut cache = get_cache().write().await;
    // Periodic prune if cache exceeds 500 entries
    if cache.len() > 500 {
        cache.retain(|_, (t, _)| t.elapsed() < Duration::from_secs(300));
    }
    cache.insert(key.to_string(), (Instant::now(), val));
}
