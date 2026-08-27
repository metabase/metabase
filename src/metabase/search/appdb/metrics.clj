(ns metabase.search.appdb.metrics
  "Prometheus instrumentation for the appdb search engine."
  (:require
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.core :as analytics]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.engine :as search.engine]))

(defn- active-index-size
  []
  (when-let [table (search.index/active-table)]
    (when (search.index/exists? table)
      (specialization/index-size-estimate table))))

;; Keep the :metabase-search/appdb-index-size product gauge up to date (per-instance). Skips the work entirely
;; unless appdb is a supported engine here, so this is safe to leave registered regardless of which search
;; engine is in use. The estimate is cheap (no full scan), so it's refreshed roughly once a minute.
(defmethod analytics/pull-collector ::index-size [_]
  {:min-interval-s 60
   :f (fn []
        (when (search.engine/supported-engine? :search.engine/appdb)
          (when-let [n (active-index-size)]
            (analytics.interface/set-gauge! :metabase-search/appdb-index-size n))))})
