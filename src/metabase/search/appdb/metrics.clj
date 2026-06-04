(ns metabase.search.appdb.metrics
  "Prometheus instrumentation for the appdb search engine."
  (:require
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.core :as analytics]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [toucan2.core :as t2]))

(defn- active-index-row-counts-by-model
  "The number of rows currently in *this instance's* active appdb search index table, grouped by model.
  Returns a map of model-name (string) -> row count for every known search model (0 when the model has no
  rows), or nil when this instance has no active index table (e.g. the index has not been built yet).

  Per-instance, so it surfaces divergence between instances' active indexes."
  []
  (when-let [table (search.index/active-table)]
    (when (search.index/exists? table)
      (let [counts (into {} (map (juxt :model :count))
                         (t2/query {:select   [:model [:%count.* :count]]
                                    :from     [table]
                                    :group-by [:model]}))]
        ;; zero-fill known models so a model dropping out shows up as 0 rather than a vanished series
        (into {} (map (fn [model] [model (get counts model 0)]))
              (into (set (map name search.config/all-models)) (keys counts)))))))

(defmethod analytics/pull-collector ::index-size [_]
  {:min-interval-s 300
   :f (fn []
        (when (search.engine/supported-engine? :search.engine/appdb)
          (doseq [[model n] (active-index-row-counts-by-model)]
            (analytics.interface/set-gauge! :metabase-search/appdb-index-size {:model model} n))))})
