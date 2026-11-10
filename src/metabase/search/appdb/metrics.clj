(ns metabase.search.appdb.metrics
  "Prometheus instrumentation for the appdb search engine."
  (:require
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.core :as analytics]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.db :as search.db]
   [metabase.search.engine :as search.engine]
   [metabase.util.i18n :as i18n]))

(set! *warn-on-reflection* true)

(defn- collect-freshness! []
  ;; Drop stale labels even if reading the new active identity fails.
  (analytics.interface/clear! :metabase-search/last-successful-reindex-timestamp-seconds)
  (let [coordinate {:engine    :appdb
                    :lang-code (i18n/site-locale-string)
                    :version   (search.index/index-version)}
        completed  (when (some #{:search.engine/appdb} (search.engine/active-engines))
                     (search.db/active-index-completion coordinate))]
    (when completed
      (analytics.interface/set-gauge! :metabase-search/last-successful-reindex-timestamp-seconds
                                      {:engine "appdb", :locale (:lang-code coordinate), :version (:version coordinate)}
                                      (/ (.toEpochMilli ^java.time.Instant (t/instant completed)) 1000.0)))))

(defmethod analytics/pull-collector ::freshness [_]
  {:f collect-freshness!, :min-interval-s 60})

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
