# JVM embedder PoC — notes

May 2026. Branch: `jvm-embedder-poc`.

## What we wanted to know

Could we replace the data-complexity-score CLI's HTTP embedder call (currently `/v1/embeddings`
against an ai-service running `snowflake-arctic-embed-l-v2.0`) with `all-MiniLM-L6-v2` running
in-process inside the JVM? Goal was an empirical answer to "is this viable" — not a production
shipment, just enough end-to-end signal to decide where to put effort next.

## What we built

- `enterprise/backend/src/metabase_enterprise/data_complexity_score/jvm_embedder.clj` (~40 lines)
  — DJL + ONNX Runtime wrapper that produces 384-dim L2-normalized vectors. Lazy-loads via DJL's
  `djl://` URL on first call (model fetched from HuggingFace into `~/.djl.ai/`).
- `enterprise/backend/src/metabase_enterprise/data_complexity_score/cli.clj` — added `-E`/`--embedder NAME`
  flag. `requiring-resolve` is used so DJL doesn't enter the load graph for runs that don't opt in.
- `deps.edn` — three DJL coords at 0.36.0.

The whole opt-in surface is one CLI flag. The HTTP provider remains the default everywhere.

## Approach: DJL over raw ONNX Runtime

DJL bundles three things we'd otherwise have to write or stitch together: the HuggingFace tokenizer
(via a JNI binding to the Rust `tokenizers` crate), the ONNX Runtime engine wiring, and the
sentence-transformers post-processing (mean pooling + L2 normalization). `TextEmbeddingTranslatorFactory`
reads `1_Pooling/config.json` and the `Normalize` module out of the model archive and applies them
automatically.

Net result is ~15 lines of inference code instead of ~100 lines of BERT WordPiece + pooling logic.
The cost is one more abstraction layer between us and ONNX Runtime. For a PoC that was the right
trade; for production, the question is whether we ever need lower-level control. So far the answer
is no.

## Numbers, with caveats

All measured on this MacBook (arm64). Linux x64 production typically gives slightly lower per-op
latency for ONNX Runtime workloads, so throughput in prod is likely better, not worse.

### Disk

| Component | On-disk JAR |
|---|---:|
| `ai.djl/api 0.36.0` | 1.0 MB |
| `ai.djl.huggingface/tokenizers 0.36.0` | 17.9 MB |
| `ai.djl.onnxruntime/onnxruntime-engine 0.36.0` | 0.05 MB |
| `com.microsoft.onnxruntime/onnxruntime 1.21.1` | **130.5 MB** |
| `com.google.code.gson/gson 2.13.1` | 0.3 MB |
| `net.java.dev.jna/jna 5.17.0` | 1.9 MB |
| **Total** | **~151 MB** |

The bulk is the ONNX Runtime JAR. It bundles native libs for five platforms (linux-x64,
linux-aarch64, osx-x64, osx-aarch64, win-x64) **plus** macOS DWARF debug symbols (~140 MB on their
own — `.dSYM/Contents/Resources/DWARF/` for both x64 and arm64 macOS). The DWARF can be stripped.

After stripping DWARF and selecting one platform's natives:
- Linux x64 only: **~37 MB**
- All platforms (no DWARF): **~70 MB**

Model on top: +86 MB (FP32 ONNX) or +22 MB (INT8 quantized).

### Transitive deps

`clojure -A:ee:dev -Stree` before vs. after: **6 new artifacts**. Three direct (DJL api, tokenizers,
engine) and three transitive (gson, jna, microsoft/onnxruntime). The other deps DJL declares
(slf4j-api, commons-compress, error_prone_annotations) were already in Metabase's tree from other
routes, so the resolver rejected the duplicates. One incidental upgrade: gson 2.10.1 → 2.13.1.

### Memory (the surprise)

Fresh JVM, staged:

| Stage | RSS | Java heap |
|---|---:|---:|
| 1. Metabase booted, DJL **on classpath but not loaded** | 652 MB | 83 MB |
| 2. After `(require 'jvm-embedder)` — DJL + ONNX Runtime class init | 1088 MB | 169 MB |
| 3. After first embed — model weights loaded into native memory | 1113 MB | 170 MB |
| 4. After 500-batch (post-GC) | 1028 MB | 170 MB |

**The model itself costs ~25 MB. DJL/ORT static init costs ~430 MB RSS / ~86 MB heap.** That was
the most counter-intuitive finding. Going in, I assumed the model file was the expensive part —
it's not, by an order of magnitude. The runtime is.

Why: ONNX Runtime's static initializer dlopen's its native libraries, allocates a memory arena,
probes for CUDA (fails cleanly on CPU-only machines but does try), and instantiates the
`OrtEnvironment` singleton. DJL's class loading sits on top of that. Once paid, the model and per-batch
allocations are cheap by comparison.

Practical consequence: the cost is per-JVM-per-load, not per-embedding. As long as we keep the
`requiring-resolve` opt-in pattern, a normal Metabase server that doesn't run the
data-complexity-score CLI pays nothing.

### Throughput

Single-threaded, batched in one DJL `predict` call:

| Batch size | Wall | Per name | Throughput |
|---:|---:|---:|---:|
| 1 | 1.6 ms | 1.63 ms | 615/sec |
| 10 | 8.7 ms | 0.87 ms | 1,148/sec |
| 100 | 23 ms | 0.23 ms | 4,332/sec |
| 500 | 180 ms | 0.36 ms | 2,781/sec |

Fixed cost per call ~1.5 ms, then near-linear in batch size. For data-complexity-score: a 10,000-name
catalog finishes in ~3 seconds. Comfortably under the existing latency budget.

## Security: what's in the download

7 files, 92 MB total. **None of them executable.**

- `model.onnx` — 90 MB protobuf. Computation graph + weight tensors. Not code.
- `tokenizer.json`, `vocab.txt`, three small JSON configs — declarative tokenizer rules.
- `serving.properties` — DJL config (which Java translator to use).

No PyTorch pickle (`.bin`/`.pt`/`.pth`), no Python files, no native libraries inside the model
archive. Those are the formats that historically ship code-execution payloads inside "model"
packages.

ONNX itself isn't a code-execution surface for our use: the loaded model uses only standard ops
from the empty/`ai.onnx` domain (verified via `OrtSession.getMetadata` — no custom-domain nodes
and no custom metadata keys). The executable code lives in ONNX Runtime native libs, which we'd be
shipping as a Maven dep anyway.

Integrity: DJL's manifest pins a SHA-1 hash of the model archive and verifies on download.
SHA-1 is collision-weak but adequate against accidental corruption. Transport is HTTPS. Nobody
cryptographically signs the model files (HF Hub doesn't, DJL doesn't). For production the
follow-up of bundling the model in the uberjar removes the runtime download and replaces this
trust path with whatever signs our release artifacts.

## Bug discovered en route, fixed separately

While writing the in-JVM embedder I hit a subtle contract bug in `complexity-embedders/normalize-name`.
It only lowercased + trimmed, so `monthlyActiveUsers` and `monthly_active_users` produced distinct
dedup keys, were embedded separately (against the same underlying text — `split-for-embedding`
normalized both to `"monthly active users"`), and surfaced as a 1.0-cosine *synonym pair* instead
of a *name collision*. Wrong axis, double-counted.

Fix: fold the `_`/`-`/`.`/camelCase → space transforms into `normalize-name` itself, so the canonical
form is what gets both stored and embedded. `split-for-embedding` becomes redundant and is removed;
`provider-embedder` loses its name→raw bookkeeping (the normalized form is now the embedding input).

Landed as a separate clean branch off latest master — `normalize-name-splits-camelcase` —
because it's a real fix that's useful independent of the JVM-embedder PoC.

## Production path: don't bloat the OSS uberjar

The 151 MB of DJL deps + 22-86 MB of model file is too much to bake into the main Metabase uberjar
for what's currently a Cloud-internal feature. Metabase already has the right plumbing for this:
the plugin loader at `src/metabase/plugins/impl.clj` is a general-purpose runtime classpath extender
(it's used for drivers but isn't driver-specific). A manifest-less JAR dropped in `MB_PLUGINS_DIR`
gets added to the classpath at boot via `classloader/add-url-to-classpath!`.

The clean shape:
1. Move `jvm-embedder.clj` into `modules/extras/embedder/` (or similar) as its own plugin module.
2. The plugin's `deps.edn` carries the DJL coords; the main `deps.edn` drops them.
3. Bundle the model as a classpath resource in the plugin JAR; load with `.optModelPath` (or DJL's
   `jar://` URL form) instead of the `djl://` HF-download URL.
4. Cloud deployments ship the plugin JAR in their Docker image's plugins directory. OSS users
   don't get the file. The existing `requiring-resolve` bridge in `cli.clj` just works — if the
   namespace isn't on the classpath, `--embedder jvm` reports the missing dep cleanly.

The PoC as it stands today is fine for demo and eval. Plugin-ization is the productionization step.

## What I'd want to know before committing further

1. **Numerical parity vs the current HTTP service.** We measured that cosine similarities look
   like a real sentence-transformers model (`order_total` ≈ `total_order_amount` at 0.90, MAU
   variants at 1.00, unrelated at 0.06), but we didn't compare against vectors produced by the
   live `snowflake-arctic-embed-l-v2.0` service on the same inputs. Different model, different
   embedding space — the synonym thresholds may need re-calibrating for MiniLM. Worth running the
   2026-04-21 synonym-analysis fixtures through both and comparing.

2. **The macOS Intel platform gap.** The tokenizer JAR ships natives for linux-aarch64,
   linux-x86_64, osx-aarch64, and win-x86_64, but **not osx-x64**. ONNX Runtime itself does cover
   osx-x64. For prod (linux containers) this is irrelevant; for any developer/customer running on
   an Intel Mac, the embedder wouldn't work. Solvable, but flag-worthy.

3. **Eager vs lazy load for the embedder cron.** If the data-complexity-score cron runs in the
   main JVM and we want to keep its 430 MB DJL tax separate from the main Metabase server's
   memory budget, we'd want the cron to spawn a child process or sit behind a lazy-load gate.
   The current `requiring-resolve` design supports the latter; the cron just needs to be wired up
   to lazy-load the same way the CLI is.

4. **Quantized model.** The INT8 variant on the HF repo (`model_qint8_*.onnx`) is ~22 MB instead
   of ~90 MB FP32 and produces slightly different (still highly correlated) embeddings. For prod
   bundling it's probably the right pick, but we should measure the cosine drift on real data
   before committing.

## Stuff I'd do differently next time

- I started by writing `jvm-embedder.clj` to delegate to `fn-embedder` (which only sees normalized
  names), then immediately had to undo that because `split-for-embedding` needed the *raw* name to
  preserve camelCase. The right move was to fix the underlying contract first (fold splitting into
  `normalize-name`) instead of working around it in the new code. I got there eventually but the
  initial path was crooked.
- Measuring memory with `Runtime.totalMemory() - Runtime.freeMemory()` is misleading for off-heap
  workloads. Always reach for RSS via `ps -o rss=` (or `/proc/self/status` on Linux) when the
  workload is JNI-heavy. The first round of memory numbers I quoted was nonsense because the model
  weights live entirely off-heap and the Java heap delta was effectively zero.
- I should have stripped DWARF and counted per-platform native sizes from the start instead of
  reporting the "all platforms, all symbols" total — that 151 MB number is technically correct but
  misleadingly large for any single deployment target.

## Files

- Implementation: `enterprise/backend/src/metabase_enterprise/data_complexity_score/jvm_embedder.clj`,
  `enterprise/backend/src/metabase_enterprise/data_complexity_score/cli.clj`, `deps.edn`
- Refactor that should land separately: `normalize-name-splits-camelcase` branch
- Plan: `~/.claude/plans/i-want-to-implement-binary-whale.md` (local to my session)

## TL;DR

It works, the numbers are reasonable, the model itself is small, and the security story is OK.
The big cost is DJL/ORT class init (~430 MB RSS), not the model — keep it behind opt-in loading
and that cost is only paid where actually needed. For production, ship via the plugin system so
the OSS uberjar stays lean.
