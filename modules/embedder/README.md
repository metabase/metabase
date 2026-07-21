# metabase/embedder

In-process text embedder running inside the Metabase JVM via DJL + ONNX Runtime. Backs the
`in-process` semantic-search embedding provider, so embedding-powered features work without an
external embedding service. It serves multiple models per JVM, keyed by model name. The plugin bundles
both consumer defaults:

- `Snowflake/snowflake-arctic-embed-l-v2.0` (INT8, 1024-dim, CLS-pooled, L2-normalized) for semantic
  search and library retrieval.
- `sentence-transformers/all-MiniLM-L6-v2` (INT8, 384-dim, mean-pooled, L2-normalized) for the
  complexity-score synonym axis.

This module is **not** part of the core uberjar. It ships as a separate plugin jar that the plugin
loader adds to the classpath at boot; nothing is loaded (and none of the DJL/ONNX Runtime native
initialization cost is paid) until the first embedding is requested. That cost is per-JVM; each loaded
model then adds only its own weights.

## Using it

```sh
MB_EE_EMBEDDING_PROVIDER=in-process
```

The existing `MB_EE_EMBEDDING_MODEL=Snowflake/snowflake-arctic-embed-l-v2.0` and 1024-dimension
defaults work unchanged. The library entity index inherits those global settings when its overrides are
unset.

Production: drop `metabase-embedder-plugin.jar` into the plugins directory (`MB_PLUGINS_DIR`,
default `./plugins`) and restart. Switching provider/model creates a fresh pgvector index table
and triggers a full reindex — the previous index is left intact.

Dev: add the `:embedder` alias (e.g. `clojure -M:dev:ee:ee-dev:embedder`). Without a bundled model
on the classpath, run the model fetch step once (`clojure -X:build:build/embedder-plugin` also does
this). `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true` remains a MiniLM-only fallback for development; Arctic
is always loaded from the build-pinned bundle or an explicit `MB_EMBEDDER_MODEL_SOURCES` entry.

### Different models per consumer

Each embedding consumer picks its model by name through its own settings; the embedder loads and
serves them side by side:

- Semantic search: `MB_EE_EMBEDDING_PROVIDER` / `MB_EE_EMBEDDING_MODEL` / `..._DIMENSIONS`.
- Library entity index: `MB_EE_LIBRARY_EMBEDDING_PROVIDER` / `MB_EE_LIBRARY_EMBEDDING_MODEL` /
  `..._DIMENSIONS` — each falls back to the corresponding global `MB_EE_EMBEDDING_*` value when
  unset, except that model and dimensions must be overridden together, and overriding the provider
  requires them too (inheriting the other half would poison the index or ask a provider for a model
  it doesn't serve).
- Complexity-score synonym axis: `MB_DATA_COMPLEXITY_SCORING_SYNONYM_EMBEDDING_*`.

A requested model resolves, in priority order: an `MB_EMBEDDER_MODEL_SOURCES` entry, a bundle in
the jar named `metabase-embedder/<model-name>-<arch>.zip`, or (MiniLM only, dev only) the HuggingFace
download behind `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true`. The pinned repo paths
`Snowflake/snowflake-arctic-embed-l-v2.0` and `sentence-transformers/all-MiniLM-L6-v2` are aliases for
their bare bundle names; other HF-qualified names are distinct models (repos are namespace-scoped) and
need their own source entry.

### Custom model sources

`MB_EMBEDDER_MODEL_SOURCES` is an EDN map of model name → source:

```sh
MB_EMBEDDER_MODEL_SOURCES='{"my-model" {:path "/models/my-model"}
                            "other"    {:url "s3://bucket/other.zip"
                                        :model-file-name "weights"
                                        :include-token-types? false}}'
```

- `:path` — directory containing an extracted model (`model.onnx`, `tokenizer.json`, config files).
- `:url` — any DJL-supported model URL (`file:`, `https:`, `s3:`, `djl://` zoo).
- `:model-file-name` — weights file name minus `.onnx` when it isn't `model.onnx`.
- `:include-token-types?` — whether the ONNX graph accepts a third `token_type_ids` input. The bundled
  MiniLM export does; bundled Arctic and the DJL MiniLM zoo export do not.
- `:pooling` — DJL pooling mode; pinned-model defaults are inherited by overrides (`cls` for Arctic,
  `mean` otherwise), but a custom source can replace it.

The consumer's declared model name/dimensions must describe what the source actually loads — the
pgvector index is labeled and sized from the settings.

## Building the plugin jar

```sh
./bin/build-embedder-plugin.sh
# → modules/embedder/target/metabase-embedder-plugin.jar
```

The build fetches the pinned model files from HuggingFace (sha256-verified, cached under
`target/model-download/`), assembles per-model, per-arch INT8 bundles into
`resources/metabase-embedder/`, and packs an uberjar containing the module source, the bundles, and
only the deps the core uberjar doesn't already provide. `SKIP_EMBEDDER_MODEL=true` skips the fetch and
builds a model-less jar — it clears `resources/metabase-embedder/` first, so a skipped build never packs
bundles left behind by an earlier one. Bundling another model is one entry in
`bin/build/src/build/embedder_model.clj`'s `bundled-models`. There is deliberately no
`metabase-plugin.yaml`: manifest-less jars are classpath-added at boot without loading anything.

## Release

CI already builds the jar: the `test-embedder` job in `.github/workflows/build-scripts.yml` runs
`bin/build-embedder-plugin.sh` on embedder changes, checks the artifact is non-empty, and runs the
integration tests against the bundles it produced. What's missing is *publishing* — a release workflow
that ships the jar (S3 / GitHub release) for Cloud images and self-hosted download. The fetch step needs
network access to huggingface.co or a warm `target/model-download/` cache.

Known gaps:

- The plugin's dependency footprint could shrink by excluding unused ONNX Runtime native platforms,
  via `:exclude` patterns on `ai/onnxruntime/native/<platform>/**`.
- `ai.djl.huggingface/tokenizers` ships no osx-x64 native, so the embedder can't run on Intel Macs;
  integration tests self-skip there.
