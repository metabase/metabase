# Transform test metrics

[Open the local Prometheus dashboard](http://localhost:9090/graph?g0.expr=sum+by+%28driver%2C+status%29+%28rate%28metabase_transform_test_runs_total%5B5m%5D%29%29&g0.tab=0&g0.range_input=15m&g1.expr=100+%2A+sum+by+%28driver%29+%28rate%28metabase_transform_test_runs_total%7Bstatus%3D%22failed%22%7D%5B5m%5D%29%29+%2F+sum+by+%28driver%29+%28rate%28metabase_transform_test_runs_total%5B5m%5D%29%29&g1.tab=0&g1.range_input=15m&g2.expr=100+%2A+sum+by+%28driver%29+%28rate%28metabase_transform_test_runs_total%7Bstatus%3D%22error%22%7D%5B5m%5D%29%29+%2F+sum+by+%28driver%29+%28rate%28metabase_transform_test_runs_total%5B5m%5D%29%29&g2.tab=0&g2.range_input=15m&g3.expr=label_replace%28histogram_quantile%280.50%2C+sum+by+%28driver%2C+le%29+%28rate%28metabase_transform_test_run_duration_ms_bucket%5B5m%5D%29%29%29%2C+%22quantile%22%2C+%22p50%22%2C+%22%22%2C+%22%22%29+or+label_replace%28histogram_quantile%280.95%2C+sum+by+%28driver%2C+le%29+%28rate%28metabase_transform_test_run_duration_ms_bucket%5B5m%5D%29%29%29%2C+%22quantile%22%2C+%22p95%22%2C+%22%22%2C+%22%22%29&g3.tab=0&g3.range_input=15m&g4.expr=sum+by+%28driver%29+%28rate%28metabase_transform_test_runs_started_total%5B5m%5D%29%29&g4.tab=0&g4.range_input=15m&g5.expr=sum+by+%28operation%2C+error_code%29+%28increase%28metabase_transform_test_refusals_total%5B15m%5D%29%29&g5.tab=0&g5.range_input=15m&g6.expr=sum%28increase%28metabase_transform_test_runs_orphaned_total%5B15m%5D%29%29&g6.tab=0&g6.range_input=15m&g7.expr=histogram_quantile%280.95%2C+sum+by+%28driver%2C+phase%2C+le%29+%28rate%28metabase_transform_test_phase_duration_ms_bucket%5B5m%5D%29%29%29&g7.tab=0&g7.range_input=15m) (Prometheus at localhost:9090).

## Semantics

- `runs_total{driver,status}` counts finished warehouse executions. `passed` means every expectation passed;
  `failed` means assertions failed without execution errors; `error` means an expectation could not execute or
  connection/setup/transform/cleanup threw. An error takes precedence over an assertion failure.
  API and persisted result semantics are unchanged: a returned result with expectation errors still has `status=failed`.
- `expectations_total{driver,type,status}` counts evaluated expectations, including those produced before a cleanup failure.
- `run_duration_ms` includes connection acquisition through cleanup, including thrown errors. It excludes validation and
  app-db run-record creation/finalization. Metrics describe warehouse execution, not persistence success.
- `runs_started_total{driver}` counts executions after validation and run-record creation, before connection acquisition.
  `runs_total{driver,status}` counts completions. These are independent cumulative counters, not an exact active-run
  count: process crashes, resets, or missed emissions can leave gaps. Compare start and completion rates instead.
  Each scrape appends samples; increments do not change previously scraped values.
- `refusals_total{operation,error_code}` counts typed validation failures for `create`, `update`, or `run`.
  It replaces `runs_refused_total`. Execution failures do not increment it. Driver is omitted because validation may
  fail before resolving one. Direct runner/validation calls default to operation `run`.
- `runs_orphaned_total` counts rows transitioned to timeout by the heartbeat reaper, on the instance that reaps them.
  It is separate from completed execution counts: a dead owner cannot report completion or duration. A late completion
  may still report execution metrics while its persisted timeout remains unchanged.
- `phase_duration_ms{driver,phase}` measures `connection`, `setup`, `transform`, `expectations`, and `cleanup` even when
  they throw. Connection measures acquisition until callback entry (or acquisition failure); release time is included
  only in total duration. Skipped phases have no observation.

All metrics are best effort. Reporter failures must not affect test execution. Labels exclude test IDs, database IDs,
SQL, and exception messages. Histograms have finer subsecond buckets and extend through ten minutes.

Reloading Clojure definitions does not replace collectors already installed in the running exporter. Restart the
backend or the metrics exporter to apply new collectors and buckets. This resets in-memory counters; Prometheus
retains historical samples. Avoid interpreting percentiles across the bucket-change boundary.

## Queries

Use separate panels for counts/rates, percentages, and milliseconds. Percentages are undefined when no runs occur;
missing series need an observation before they appear. No-data does not mean zero. Percentiles are bucket estimates.

### Run throughput

```promql
sum by (driver, status) (rate(metabase_transform_test_runs_total[5m]))
```

### Assertion failures (%)

```promql
100 * sum by (driver) (rate(metabase_transform_test_runs_total{status="failed"}[5m])) / sum by (driver) (rate(metabase_transform_test_runs_total[5m]))
```

### Execution errors (%)

```promql
100 * sum by (driver) (rate(metabase_transform_test_runs_total{status="error"}[5m])) / sum by (driver) (rate(metabase_transform_test_runs_total[5m]))
```

### Duration p50/p95 (ms)

```promql
label_replace(histogram_quantile(0.50, sum by (driver, le) (rate(metabase_transform_test_run_duration_ms_bucket[5m]))), "quantile", "p50", "", "") or label_replace(histogram_quantile(0.95, sum by (driver, le) (rate(metabase_transform_test_run_duration_ms_bucket[5m]))), "quantile", "p95", "", "")
```

### Started executions per second

```promql
sum by (driver) (rate(metabase_transform_test_runs_started_total[5m]))
```

### Validation refusals

```promql
sum by (operation, error_code) (increase(metabase_transform_test_refusals_total[15m]))
```

### Orphaned runs

```promql
sum(increase(metabase_transform_test_runs_orphaned_total[15m]))
```

### Phase duration p95 (ms)

```promql
histogram_quantile(0.95, sum by (driver, phase, le) (rate(metabase_transform_test_phase_duration_ms_bucket[5m])))
```
