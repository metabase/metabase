---
title: observability-with-prometheus
---

# Observability with Prometheus

You can export Prometheus stats from your Metabase. 

## Running Prometheus locally

Assuming you have a [Metabase JAR](https://www.metabase.com/start/oss/). 

```
MB_PROMETHEUS_SERVER_PORT=9191 java -jar downloaded.jar
```

```
(truncated logs)
2022-09-01 17:47:38,808 INFO metabase.util :: Database setup took 3.4 s
2022-09-01 17:47:38,826 INFO metabase.core :: Setting up prometheus metrics
2022-09-01 17:47:38,827 INFO metabase.prometheus :: Starting prometheus metrics collector
2022-09-01 17:47:38,839 INFO metabase.prometheus :: Starting prometheus metrics web-server on port 9,191
(truncated logs)
```

## Sample output

```
'# HELP jvm_threads_current Current thread count of a JVM
'# TYPE jvm_threads_current gauge
jvm_threads_current 81.0
'# HELP jvm_threads_daemon Daemon thread count of a JVM
'# TYPE jvm_threads_daemon gauge
jvm_threads_daemon 36.0
'# HELP jvm_threads_peak Peak thread count of a JVM
'# TYPE jvm_threads_peak gauge
jvm_threads_peak 81.0
'# HELP jvm_threads_started_total Started thread count of a JVM
'# TYPE jvm_threads_started_total counter
jvm_threads_started_total 104.0
'# HELP jvm_threads_deadlocked Cycles of JVM-threads that are in deadlock waiting to acquire object monitors or ownable synchronizers
'# TYPE jvm_threads_deadlocked gauge
jvm_threads_deadlocked 0.0

```


### Prometheus configuration file example

```
global:
  scrape_interval:     15s # By default, scrape targets every 15 seconds.

  # Attach these labels to any time series or alerts when communicating with
  # external systems (federation, remote storage, Alertmanager).
  external_labels:
    monitor: 'codelab-monitor'

# A scrape configuration containing exactly one endpoint to scrape:
# Here it's Prometheus itself.
scrape_configs:
  # The job name is added as a label `job=<job_name>` to any timeseries scraped from this config.
  - job_name: 'prometheus'

    # Override the global default and scrape targets from this job every 5 seconds.
    scrape_interval: 5s
    # use whatever port here that you set for MB_PROMETHEUS_SERVER_PORT
    static_configs:
      - targets: ['localhost:9191']
```


## Exported data

Here are the common metric types from the registry:

- `c3p0_max_pool_size`
- `c3p0_min_pool_size`
- `c3p0_num_busy_connections`
- `c3p0_num_connections`
- `c3p0_num_idle_connections`
- `jetty_async_dispatches_total`
- `jetty_async_requests_total`
- `jetty_async_requests_waiting`
- `jetty_async_requests_waiting_max`
- `jetty_dispatched_active`
- `jetty_dispatched_active_max`
- `jetty_dispatched_time_max`
- `jetty_dispatched_time_seconds_total`
- `jetty_dispatched_total`
- `jetty_expires_total`
- `jetty_request_time_max_seconds`
- `jetty_request_time_seconds_total`
- `jetty_requests_active`
- `jetty_requests_active_max`
- `jetty_requests_total`
- `jetty_responses_bytes_total`
- `jetty_responses_total`
- `jetty_stats_seconds`
- `jvm_gc_collection_seconds_count`
- `jvm_gc_collection_seconds_sum`
- `jvm_memory_bytes_committed`
- `jvm_memory_bytes_init`
- `jvm_memory_bytes_max`
- `jvm_memory_bytes_used`
- `jvm_memory_objects_pending_finalization`
- `jvm_memory_pool_bytes_committed`
- `jvm_memory_pool_bytes_init`
- `jvm_memory_pool_bytes_max`
- `jvm_memory_pool_bytes_used`
- `jvm_memory_pool_collection_committed_bytes`
- `jvm_memory_pool_collection_init_bytes`
- `jvm_memory_pool_collection_max_bytes`
- `jvm_memory_pool_collection_used_bytes`
- `jvm_threads_current`
- `jvm_threads_daemon`
- `jvm_threads_deadlocked`
- `jvm_threads_deadlocked_monitor`
- `jvm_threads_peak`
- `jvm_threads_started_total`
- `jvm_threads_state`
- `process_cpu_seconds_total`
- `process_max_fds`
- `process_open_fds`
- `process_start_time_seconds`
