(ns metabase.lib-metric.metadata.jvm
  "JVM implementation of MetricMetadataProvider.

   This provider enables building metric queries that span multiple databases.
   It fetches metrics from the Card table (type='metric') without database scoping,
   and routes table/column metadata requests to database-specific providers."
  (:require
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.db :as lib-metric.db]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.dimension.jvm :as lib-metric.dimension.jvm]
   [metabase.lib-metric.metadata.provider :as provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as memoize]))

(set! *warn-on-reflection* true)

(defn- table->database-id
  "Memoized lookup of database-id for a table-id."
  []
  (memoize/lru
   (fn [table-id]
     (lib-metric.db/table-database-id table-id))
   :lru/threshold 1000))

(defn- fetch-metrics
  "Fetch metrics matching spec, not scoped to any database.
   Returns metrics as metadata objects with :lib/type :metadata/metric."
  [metadata-spec]
  (try
    (lib-metric.db/metrics metadata-spec)
    (catch Throwable e
      (throw (ex-info "Error fetching metrics with spec"
                      {:metadata-spec metadata-spec}
                      e)))))

;;; ------------------------------------------------- Dimension Fetching -------------------------------------------------

(defn- extract-dimensions-from-entity
  "Extract dimensions from a metric or measure, annotating with source info.
   Each dimension is enriched with its corresponding dimension-mapping if available.
   Dimensions are normalized after DB read to fix JSON round-trip artifacts
   (e.g. string enum values for :has-field-values, :status, :sources)."
  [entity source-type]
  (let [dims         (:dimensions entity)
        mappings     (:dimension-mappings entity)
        mappings-by-dim-id (m/index-by :dimension-id mappings)]
    (for [dim dims]
      (-> dim
          lib-metric.dimension/normalize-persisted-dimension
          (assoc :lib/type :metadata/dimension
                 :source-type source-type
                 :source-id (:id entity))
          (cond->
           (get mappings-by-dim-id (:id dim))
            (assoc :dimension-mapping (get mappings-by-dim-id (:id dim))))))))

(defn- fetch-measures-for-dimensions
  "Fetch measures matching spec for dimension extraction."
  [metadata-spec]
  (try
    (lib-metric.db/measures metadata-spec)
    (catch Throwable e
      (throw (ex-info "Error fetching measures for dimensions"
                      {:metadata-spec metadata-spec}
                      e)))))

(defn- fetch-dimensions
  "Fetch dimensions by aggregating from metrics and measures.
   Dimensions are extracted from their parent entities and annotated with source info."
  [{id-set :id, :keys [metric-id measure-id table-ids]}]
  (let [;; Fetch from metrics if not a measure-specific query
        metric-dims (when-not measure-id
                      (let [metric-spec (cond-> {:lib/type :metadata/metric}
                                          metric-id (assoc :id #{metric-id})
                                          table-ids (assoc :table-ids table-ids))
                            metrics (fetch-metrics metric-spec)]
                        (mapcat #(extract-dimensions-from-entity % :metric) metrics)))
        ;; Fetch from measures if not a metric-specific query
        measure-dims (when-not metric-id
                       (let [measure-spec (cond-> {:lib/type :metadata/measure}
                                            measure-id (assoc :id #{measure-id})
                                            table-ids  (assoc :table-ids table-ids))
                             measures (fetch-measures-for-dimensions measure-spec)]
                         (mapcat #(extract-dimensions-from-entity % :measure) measures)))
        all-dims (concat metric-dims measure-dims)]
    (cond->> all-dims
      id-set (filter #(contains? id-set (:id %)))
      true   vec)))

(mu/defn metadata-provider :- ::lib.metadata.protocols/metadata-provider
  "Create a MetricMetadataProvider for the JVM.

   This provider:
   - Has no single database context (database returns nil)
   - Fetches metrics from the Card table across all databases
   - Fetches measures from the Measure table across all databases
   - Fetches dimensions extracted from metrics and measures
   - Routes table/column metadata to database-specific providers
   - Uses global Metabase settings

   Example usage:
   ```clojure
   (def mp (metadata-provider))

   ;; Returns nil - no single database
   (lib.metadata.protocols/database mp)

   ;; Fetches metrics across all databases
   (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric})

   ;; Fetches dimensions from metrics/measures
   (lib.metadata.protocols/metadatas mp {:lib/type :metadata/dimension :metric-id 1})

   ;; Routes to correct database provider for table 1
   (lib.metadata.protocols/metadatas mp {:lib/type :metadata/column :table-ids #{1}})
   ```"
  []
  (let [table->db (table->database-id)
        db-provider-fn (memoize/lru
                        lib-be/application-database-metadata-provider
                        :lru/threshold 50)]
    (provider/metric-context-metadata-provider
     fetch-metrics
     fetch-measures-for-dimensions  ; measure-fetcher-fn - direct fetching by ID
     fetch-dimensions               ; dimension-fetcher-fn
     table->db
     db-provider-fn
     setting/get
     lib-metric.dimension.jvm/enrich-columns-with-has-field-values)))
