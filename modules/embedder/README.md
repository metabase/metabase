# metabase/embedder

In-process text embedder: `sentence-transformers/all-MiniLM-L6-v2` (384-dim, mean-pooled,
L2-normalized) running inside the Metabase JVM via DJL + ONNX Runtime. Backs the `in-process`
semantic-search embedding provider, so semantic search works without an external embedding service.

This module is **not** part of the core uberjar. It ships as a separate plugin jar that the plugin
loader adds to the classpath at boot; nothing is loaded (and none of the ~430 MB DJL/ONNX Runtime
native init is paid) until the first embedding is requested.

## Using it

```
MB_EE_EMBEDDING_PROVIDER=in-process
MB_EE_EMBEDDING_MODEL=all-MiniLM-L6-v2
MB_EE_EMBEDDING_MODEL_DIMENSIONS=384
```

Production: drop `metabase-embedder-plugin.jar` into the plugins directory (`MB_PLUGINS_DIR`,
default `./plugins`) and restart. Switching provider/model creates a fresh pgvector index table
and triggers a full reindex — the previous index is left intact.

Dev: add the `:embedder` alias (e.g. `clojure -M:dev:ee:ee-dev:embedder`). Without a bundled model
on the classpath, either run the model fetch step once (`clojure -X:build:build/embedder-plugin`
also does this) or set `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true` to let DJL fetch from HuggingFace
into `~/.djl.ai/`.

### Overriding the model

The bundled INT8 MiniLM is the default, not a requirement:

- `MB_EMBEDDER_MODEL_PATH` — directory containing an extracted model (`model.onnx`,
  `tokenizer.json`, config files).
- `MB_EMBEDDER_MODEL_URL` — any DJL-supported model URL (`file:`, `https:`, `s3:`, `djl://` zoo).
- `MB_EMBEDDER_MODEL_NAME` — weights file name (minus `.onnx`) when it isn't `model.onnx`.

When overriding, set `MB_EE_EMBEDDING_MODEL` / `MB_EE_EMBEDDING_MODEL_DIMENSIONS` to match so the
pgvector index is labeled and sized for what is actually loaded.

## Building the plugin jar

```
./bin/build-embedder-plugin.sh
# → modules/embedder/target/metabase-embedder-plugin.jar
```

The build fetches the pinned model files from HuggingFace (sha256-verified, cached under
`target/model-download/`; skip with `SKIP_EMBEDDER_MODEL=true`), assembles per-arch INT8 bundles
into `resources/metabase-embedder/`, and packs an uberjar containing the module source, the
bundles, and only the deps the core uberjar doesn't already provide. There is deliberately no
`metabase-plugin.yaml`: manifest-less jars are classpath-added at boot without loading anything.

## Release

Not wired into CI yet. Intended shape: a release workflow runs `bin/build-embedder-plugin.sh` and
publishes the jar (S3 / GitHub release) for Cloud images and self-hosted download. The fetch step
needs network access to huggingface.co or a warm `target/model-download/` cache.

Follow-up hooks:

- Platform-trimming the ONNX Runtime jar (linux-x64-only cuts the plugin from ~175 MB to ~60 MB;
  measured in the BOT-1531 spike) via `:exclude` patterns on `ai/onnxruntime/native/<platform>/**`.
- `ai.djl.huggingface/tokenizers` ships no osx-x64 native, so the embedder can't run on Intel Macs;
  integration tests self-skip there.
