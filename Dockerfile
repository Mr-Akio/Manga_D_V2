# =========================================================
# Multi-Stage Dockerfile for High-Performance Rust Web App
# Aligned with Debian Bookworm glibc 2.36 to avoid GLIBC mismatch
# =========================================================

# Stage 1: Build binary
FROM rust:bookworm AS builder
WORKDIR /app

# Cache dependency layer
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy real source files
COPY src ./src
RUN touch src/main.rs && cargo build --release

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/manga_reader_server /app/manga_reader_server
COPY static ./static

ENV PORT=8000
EXPOSE 8000

CMD ["/app/manga_reader_server"]

