(ns metabase.lib-metric.metadata.jvm
  "JVM implementation of [[metabase.lib-metric.metadata.provider/MetricMetadataProvider]].

   Fetches metrics from the Card table (type='metric') without database scoping,
   measures from the Measure table, and dimensions extracted from both.
   Table/column metadata is fetched via database-specific providers."
  (:require
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.dimension.jvm :as lib-metric.dimension.jvm]
   [metabase.lib-metric.metadata.provider :as provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as memoize]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table->database-id
  "Memoized lookup of database-id for a table-id."
  []
  (memoize/lru
   (fn [table-id]
     (t2/select-one-fn :db_id :model/Table table-id))
   :lru/threshold 1000))

;;; ------------------------------------------------- Metric Fetching -------------------------------------------------

(defn- fetch-metric
  "Fetch a single metric by ID. Metrics are Cards with type='metric'."
  [metric-id]
  (t2/select-one :metadata/metric {:where [:and [:= :type [:inline "metric"]] [:= :id metric-id]]}))

;;; ------------------------------------------------- Measure Fetching -------------------------------------------------

(defn- fetch-measure
  "Fetch a single measure by ID."
  [measure-id]
  (t2/select-one :metadata/measure :measure/id measure-id))

;;; ------------------------------------------------- Dimension Fetching -------------------------------------------------

(defn- extract-dimensions-from-entity
  "Extract dimensions from a metric or measure, annotating with source info.
   Each dimension is enriched with its corresponding dimension-mapping if available.
   Dimensions are normalized after DB read to fix JSON round-trip artifacts
   (e.g. string enum values for :has-field-values, :status, :sources)."
  [entity source-type]
  (let [dims               (:dimensions entity)
        mappings           (:dimension-mappings entity)
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

(defn- fetch-dimensions-for-metric
  "Fetch all dimensions for a metric by extracting from the metric entity."
  [metric-id]
  (when-let [metric (fetch-metric metric-id)]
    (vec (extract-dimensions-from-entity metric :metric))))

(defn- fetch-dimensions-for-measure
  "Fetch all dimensions for a measure by extracting from the measure entity."
  [measure-id]
  (when-let [measure (fetch-measure measure-id)]
    (vec (extract-dimensions-from-entity measure :measure))))

(defn- fetch-dimensions-for-table
  "Fetch all dimensions mapped to a table, from both metrics and measures."
  [table-id]
  (let [metrics  (t2/select :metadata/metric {:where [:and
                                                      [:= :type [:inline "metric"]]
                                                      [:= :table_id table-id]
                                                      [:= :source_card_id nil]
                                                      [:= :archived false]]})
        measures (t2/select :metadata/measure {:where [:and
                                                       [:= :measure/table_id table-id]
                                                       [:= :measure/archived false]]})]
    (vec (concat (mapcat #(extract-dimensions-from-entity % :metric) metrics)
                 (mapcat #(extract-dimensions-from-entity % :measure) measures)))))

;;; ------------------------------------------------- Table/Column Fetching -------------------------------------------------

(defn- make-db-provider-for-table
  "Create a function that returns a standard MetadataProvider for a given table-id."
  [table->db db-provider-fn]
  (fn [table-id]
    (when-let [db-id (table->db table-id)]
      (db-provider-fn db-id))))

(defn- fetch-table
  "Fetch table metadata by ID via the appropriate database provider."
  [db-provider-for-table-fn table-id]
  (when-let [provider (db-provider-for-table-fn table-id)]
    (lib.metadata.protocols/table provider table-id)))

(defn- fetch-columns-for-table
  "Fetch columns for a table via the appropriate database provider, with optional enrichment."
  [db-provider-for-table-fn table-id]
  (when-let [provider (db-provider-for-table-fn table-id)]
    (let [cols (lib.metadata.protocols/fields provider table-id)]
      (lib-metric.dimension.jvm/enrich-columns-with-has-field-values cols))))

;;; ------------------------------------------------- Provider Construction -------------------------------------------------

(mu/defn metadata-provider :- ::provider/metric-metadata-provider
  "Create a [[provider/MetricMetadataProvider]] for the JVM.

   This provider:
   - Fetches metrics from the Card table across all databases
   - Fetches measures from the Measure table across all databases
   - Fetches dimensions extracted from metrics and measures
   - Routes table/column metadata to database-specific providers
   - Uses global Metabase settings

   Example usage:
   ```clojure
   (def mp (metadata-provider))

   ;; Fetch a metric by ID
   (provider/metric mp 42)

   ;; Fetch dimensions for a metric
   (provider/dimensions-for-metric mp 42)

   ;; Fetch columns for a table
   (provider/columns-for-table mp 1)

   ;; Get a standard MetadataProvider for lib/* calls
   (provider/database-provider-for-table mp 1)
   ```"
  []
  (let [table->db              (table->database-id)
        db-provider-fn         (memoize/lru lib-be/application-database-metadata-provider :lru/threshold 50)
        db-provider-for-table  (make-db-provider-for-table table->db db-provider-fn)
        ;; Memoize entity fetchers — these are called multiple times for the same ID
        ;; during AST build, projection, and display-info.
        memo-metric            (memoize/lru fetch-metric :lru/threshold 200)
        memo-measure           (memoize/lru fetch-measure :lru/threshold 200)
        memo-dims-for-metric   (memoize/lru fetch-dimensions-for-metric :lru/threshold 200)
        memo-dims-for-measure  (memoize/lru fetch-dimensions-for-measure :lru/threshold 200)
        ;; Lazy index: loads all dimensions on first single-UUID lookup, then O(1).
        all-dims-by-uuid       (delay
                                 (let [metrics  (t2/select :metadata/metric
                                                           {:where [:and
                                                                    [:= :type [:inline "metric"]]
                                                                    [:= :archived false]]})
                                       measures (t2/select :metadata/measure
                                                           {:where [:= :measure/archived false]})]
                                   (m/index-by :id
                                               (concat
                                                (mapcat #(extract-dimensions-from-entity % :metric) metrics)
                                                (mapcat #(extract-dimensions-from-entity % :measure) measures)))))]
    (provider/metric-context-metadata-provider
     {:metric-fn           memo-metric
      :measure-fn          memo-measure
      :dimension-fn        (fn [dimension-uuid] (get @all-dims-by-uuid dimension-uuid))
      :dims-for-metric-fn  memo-dims-for-metric
      :dims-for-measure-fn memo-dims-for-measure
      :dims-for-table-fn   fetch-dimensions-for-table
      :cols-for-table-fn   (partial fetch-columns-for-table db-provider-for-table)
      :col-fn              (fn [table-id field-id]
                             (when-let [provider (db-provider-for-table table-id)]
                               (first (lib.metadata.protocols/metadatas provider {:lib/type :metadata/column
                                                                                  :table-id table-id
                                                                                  :id       #{field-id}}))))
      :table-fn            (partial fetch-table db-provider-for-table)
      :setting-fn          setting/get
      :db-provider-fn      db-provider-for-table})))
