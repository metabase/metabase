(ns metabase.explorations.core
  (:require
   [metabase.explorations.impl :as impl]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.interestingness.core :as interestingness]
   [potemkin :as p]))

(p/import-vars
 [impl
  exploration-data
  exploration-data->api
  research-candidates
  research-candidates-max-metrics
  research-metric-index
  research-metric-index-max-metrics
  research-groups
  min-interestingness]
 ;; The QP-result -> chart-config conversion is useful to anything that wants to score a temporal
 ;; series with `metabase.interestingness`, not just the explorations worker. Both take any row with
 ;; `:dataset_query`, `:database_id`, `:display` and `:name` — a Card satisfies that.
 [explorations.interestingness
  exploration-query->lib-cols]
 ;; `chart-config` itself lives in the interestingness module since the split; re-exported here so
 ;; callers can keep using `explorations/chart-config`.
 [interestingness
  chart-config])
