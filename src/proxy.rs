use axum::{
    body::Body,
    extract::Query,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::TryStreamExt;
use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;

static PROXY_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    PROXY_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(10))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(32)
            .tcp_keepalive(Some(Duration::from_secs(60)))
            .build()
            .expect("Failed to initialize proxy reqwest client")
    })
}

#[derive(Deserialize)]
pub struct ProxyQuery {
    pub url: String,
    pub source: Option<String>,
}

pub async fn proxy_image_handler(Query(params): Query<ProxyQuery>) -> Result<Response, StatusCode> {
    if params.url.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let referer = if params
        .source
        .as_ref()
        .map(|s| s.eq_ignore_ascii_case("miku"))
        .unwrap_or(false)
        || params.url.contains("miku-doujin.com")
    {
        "https://miku-doujin.com/"
    } else {
        "https://doujin-th.com/"
    };

    let client = get_client();

    let mut req_headers = HeaderMap::new();
    req_headers.insert(
        header::USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"),
    );
    req_headers.insert(header::REFERER, HeaderValue::from_str(referer).unwrap());
    req_headers.insert(
        header::ACCEPT,
        HeaderValue::from_static("image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"),
    );
    req_headers.insert(
        header::HeaderName::from_static("sec-ch-ua"),
        HeaderValue::from_static("\"Not A(Brand\";v=\"8\", \"Chromium\";v=\"132\", \"Google Chrome\";v=\"132\""),
    );
    req_headers.insert(
        header::HeaderName::from_static("sec-ch-ua-mobile"),
        HeaderValue::from_static("?0"),
    );
    req_headers.insert(
        header::HeaderName::from_static("sec-ch-ua-platform"),
        HeaderValue::from_static("\"Windows\""),
    );
    req_headers.insert(
        header::HeaderName::from_static("sec-fetch-dest"),
        HeaderValue::from_static("image"),
    );
    req_headers.insert(
        header::HeaderName::from_static("sec-fetch-mode"),
        HeaderValue::from_static("no-cors"),
    );
    req_headers.insert(
        header::HeaderName::from_static("sec-fetch-site"),
        HeaderValue::from_static("cross-site"),
    );

    // Attempt 1
    let fetch_result = client.get(&params.url).headers(req_headers.clone()).send().await;
    let res = match fetch_result {
        Ok(r) if r.status().is_success() => r,
        _ => {
            // Short backoff before retry (handles transient connection reset under burst concurrency)
            tokio::time::sleep(Duration::from_millis(150)).await;
            match client.get(&params.url).headers(req_headers).send().await {
                Ok(r) if r.status().is_success() => r,
                Ok(r) => return Err(StatusCode::from_u16(r.status().as_u16()).unwrap_or(StatusCode::NOT_FOUND)),
                Err(_) => return Err(StatusCode::BAD_GATEWAY),
            }
        }
    };

    build_streaming_response(res).await
}

async fn build_streaming_response(res: reqwest::Response) -> Result<Response, StatusCode> {
    let content_type = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/webp")
        .to_string();

    let stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
    let body = Body::from_stream(stream);

    let mut response = body.into_response();
    let headers = response.headers_mut();

    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&content_type).unwrap_or(HeaderValue::from_static("image/webp")),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=2592000, immutable"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );

    Ok(response)
}
