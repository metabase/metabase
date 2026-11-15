# In-process embedding plugin

This module builds `metabase-embedder-plugin.jar`, an optional runtime plugin containing two pinned models:

- `Snowflake/snowflake-arctic-embed-xs` (384 dimensions) — semantic search and Library retrieval
- `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) — the data complexity score's synonym axis

Both models are deliberately small (~23 MB per architecture) so CI can build the artifact and run real inference
against it on every change without caching multi-GB downloads. They exercise the full packaging, tokenizer, and DJL
runtime machinery. A release build bundling a larger retrieval model (such as `snowflake-arctic-embed-l-v2.0`) will
be added when the plugin is published for customers or offline use such as evals.

Build it with `./bin/build-embedder-plugin.sh`, then place the jar in Metabase's plugin directory. The plugin is
discovered from the jar manifest at startup; each model's DJL runtime is loaded lazily on first inference, and only
the models a consumer actually asks for are ever loaded.

Consumers select the provider through their own settings. Semantic search and Library retrieval must also override
the model and dimensions because their defaults describe the larger Arctic Embed model used by the AI service:

```text
MB_EE_EMBEDDING_PROVIDER=in-process
MB_EE_EMBEDDING_MODEL=Snowflake/snowflake-arctic-embed-xs
MB_EE_EMBEDDING_MODEL_DIMENSIONS=384
```

The data complexity score's default model and dimensions already match the bundled MiniLM model, so it only needs:

```text
MB_DATA_COMPLEXITY_SCORING_SYNONYM_EMBEDDING_PROVIDER=in-process
```

A model the plugin does not bundle, or configured dimensions that do not match it, fails readiness rather than
falling back to another model.

The artifact contains pinned ARM64 and x86-64/AVX2 ONNX exports. The supported runtime combinations are glibc 2.34
or newer on Linux, on either architecture, and Apple Silicon macOS. Intel macOS is unsupported because the tokenizer
dependency does not ship an x86-64 macOS native library. The runtime is not musl-compatible, so it cannot run in
Metabase's default Alpine image; use a glibc-based image such as the repository's Ubuntu image when installing this
plugin. Other operating systems, libc implementations, and architectures fail readiness checks before model loading.

The exact embedding-space identity includes the architecture-specific export digest, so every node sharing
semantic-search or library-retrieval indexes must use the same architecture. Mixed ARM64/x86-64 clusters fail closed
rather than querying vectors produced by a different export.

Custom model sources are intentionally not supported in this first version: the bundled catalog is the only place a
model can come from.
