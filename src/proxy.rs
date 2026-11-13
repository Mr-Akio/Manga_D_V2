use axum::{
    body::Body,
    extract::Query,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::TryStreamExt;
use serde::Deserialize;
use std::time::Duration;

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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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

    let res = client
        .get(&params.url)
        .headers(req_headers.clone())
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let status = res.status();
    if !status.is_success() {
        // Fallback retry with alternate referer
        let alt_referer = if referer == "https://doujin-th.com/" {
            "https://miku-doujin.com/"
        } else {
            "https://doujin-th.com/"
        };
        req_headers.insert(header::REFERER, HeaderValue::from_str(alt_referer).unwrap());

        let retry_res = client
            .get(&params.url)
            .headers(req_headers)
            .send()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?;

        if !retry_res.status().is_success() {
            return Err(StatusCode::NOT_FOUND);
        }

        return build_streaming_response(retry_res).await;
    }

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
        HeaderValue::from_static("public, max-age=604800, immutable"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );

    Ok(response)
}

