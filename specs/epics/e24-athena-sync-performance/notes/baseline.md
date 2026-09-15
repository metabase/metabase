# e24s01 Baseline — Athena sync at scale (2026-09-15)

Run: `bash modules/drivers/athena/scripts/bench-sync.sh --full` against user's
scratch AWS catalog (3 schemas incl. `athena_2000tables`, `default`,
`s3-data-source`; thin JDBC driver 3.7.0, OpenJDK 21).

## Measured

| Metric | Legacy (serial .getColumns) | Fast (information_schema.columns) |
|---|---|---|
| Tables | 2004 | 2004 |
| Rows / result sets | 2004 result sets | 202,032 rows (~101 cols/table) |
| Table listing | 15,472 ms | — |
| Total | **11,110,852 ms (3 h 05 m)** | **370,595 ms (6 m 11 s)** |
| Per-table avg | **5,543 ms/table** | — |
| Max used heap (sampled) | 646 MB | 612 MB |

End-to-end: fast path is **~30x faster** at 2,004 tables.

## Extrapolation to 5,000 tables x 100 cols (scope success criterion)

- Legacy: 5,543 ms/table x 5,000 ≈ **7.7 hours** (matches/complements the
  20–40 min static estimate being optimistic; per-call latency here is far
  above the assumed 200–500 ms).
- Fast: 1.83 ms/row x ~500,000 rows ≈ **~15 min** (linear upper bound; fixed
  query overhead means real time likely lower).

## Streaming vs buffering — INCONCLUSIVE from this run

Both paths peaked at similar heap (646/612 MB) although the legacy path
touches far less resident data (one ~100-row result set at a time). The
sampler measures *used* heap (total − free), i.e. allocation churn not
retention — so 612 MB on the fast path is not evidence of buffering.
Decisive cheap check (optional, pre-integration): run the fast mode under a
capped heap — `cd modules/drivers/athena && clojure -J-Xmx512m -M:bench fast`
— completes = streams; OOM = buffers.

## Caveats

- Bench legacy path uses raw JDBC spec without
  `MetadataRetrievalMethod=ProxyAPI` (Metabase sets it when a catalog is
  configured); absolute legacy latency may differ from Metabase's real path.
  Direction (fast ≫ legacy) unaffected.
- Single run, no warm-cache repetition; first-run JIT/downloads included.

## Verdict: **GO** for e24s03

Speed case is overwhelming at scale (3 h → 6 min measured; ~7.7 h → ~15 min
extrapolated). Memory question stays open as a cheap follow-up check above
and as a P1 concern in e24s03 integration (bounded-heap guard), not a blocker.
