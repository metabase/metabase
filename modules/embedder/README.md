# In-process embedding plugin

This module builds `metabase-embedder-plugin.jar`, an optional runtime plugin containing one pinned model:
`Snowflake/snowflake-arctic-embed-l-v2.0` (1024 dimensions).

Build it with `./bin/build-embedder-plugin.sh`, then place the jar in Metabase's plugin directory and set
`MB_EE_EMBEDDING_PROVIDER=in-process`. The plugin is discovered from the jar manifest at startup, while the DJL
runtime and model are loaded lazily on first inference.

The artifact contains pinned ARM64 and x86-64/AVX2 ONNX exports. The supported runtime combinations are glibc 2.34
or newer on Linux, on either architecture, and Apple Silicon macOS. Intel macOS is unsupported because the tokenizer
dependency does not ship an x86-64 macOS native library. The runtime is not musl-compatible, so it cannot run in
Metabase's default Alpine image; use a glibc-based image such as the repository's Ubuntu image when installing this
plugin. Other operating systems, libc implementations, and architectures fail readiness checks before model loading.

The exact embedding-space identity includes the architecture-specific export digest, so every node sharing
semantic-search or library-retrieval indexes must use the same architecture. Mixed ARM64/x86-64 clusters fail closed
rather than querying vectors produced by a different export.

Custom model sources and additional models are intentionally not supported in this first version.
