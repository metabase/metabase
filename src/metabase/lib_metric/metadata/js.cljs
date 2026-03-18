(ns metabase.lib-metric.metadata.js
  "JS/ClojureScript implementation of MetricMetadataProvider.

   This provider enables building metric queries that span multiple databases
   in the frontend. It takes pre-loaded metadata from Redux and routes requests
   to database-specific providers as needed."
  (:require
   [goog.object :as gobject]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.metadata.provider :as provider]
   [metabase.lib.js.metadata :as js-metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util :as u]))

(defn- object-get [obj k]
  (when (and obj (js-in k obj))
    (gobject/get obj k)))

(defn- parse-metric
  "Parse a single metric from JS object to Clojure map.
   Expects metrics from the metrics API (metabase.metrics.api), not Card-based metrics."
  [metric-obj]
  (when metric-obj
    (let [;; Check if this is a Metric class wrapper (has _plainObject) or a plain object
          raw-obj   (or (object-get metric-obj "_plainObject") metric-obj)
          parsed    (-> (js->clj raw-obj :keywordize-keys true)
                        (update-keys u/->kebab-case-en))]
      (assoc parsed :lib/type :metadata/metric))))

(defn- parse-metrics
  "Parse all metrics from JS metadata object.
   Returns a map of id -> metric."
  [metrics-data]
  (when metrics-data
    (into {}
          (keep (fn [k]
                  (when-let [id (parse-long k)]
                    (when-let [metric (parse-metric (object-get metrics-data k))]
                      [id metric]))))
          (js-keys metrics-data))))

(defn- parse-measure
  "Parse a single measure from JS object to Clojure map.
   Expects measures from the measures API, not Card-based measures."
  [measure-obj]
  (when measure-obj
    (let [;; Check if this is a Measure class wrapper (has _plainObject) or a plain object
          raw-obj (or (object-get measure-obj "_plainObject") measure-obj)
          parsed  (-> (js->clj raw-obj :keywordize-keys true)
                      (update-keys u/->kebab-case-en))]
      (assoc parsed :lib/type :metadata/measure))))

(defn- parse-measures
  "Parse all measures from JS metadata object.
   Returns a map of id -> measure."
  [measures-data]
  (when measures-data
    (into {}
          (keep (fn [k]
                  (when-let [id (parse-long k)]
                    (when-let [measure (parse-measure (object-get measures-data k))]
                      [id measure]))))
          (js-keys measures-data))))

;;; ------------------------------------------------- Dimension Parsing -------------------------------------------------

(defn- parse-dimension
  "Parse a single dimension, converting keys to kebab-case keywords and type values to keywords.
   Similar to how metabase.lib.js.metadata parses fields."
  [dim]
  (let [converted (update-keys dim (comp keyword u/->kebab-case-en))]
    (cond-> converted
      (:effective-type converted)   (update :effective-type keyword)
      (:semantic-type converted)    (update :semantic-type keyword)
      (:base-type converted)        (update :base-type keyword)
      (:has-field-values converted) (update :has-field-values keyword)
      (:sources converted)          (update :sources (fn [srcs] (mapv #(update % :type keyword) srcs)))
      (:group converted)            (update :group u/normalize-map))))

(defn- derive-sources-from-mapping
  "Derive sources from a dimension mapping's target field ID.
   Used as fallback when dimensions arrive without pre-computed sources."
  [mapping]
  (when-let [field-id (lib-metric.dimension/dimension-target->field-id (:target mapping))]
    [{:type :field, :field-id field-id}]))

(defn- extract-dimensions-from-entity
  "Extract dimensions from a parsed metric or measure, annotating with source info."
  [entity source-type]
  (let [dims     (:dimensions entity)
        mappings (:dimension-mappings entity)
        mappings-by-dim-id (into {} (map (juxt :dimension-id identity) mappings))]
    (for [dim dims
          :let [parsed-dim (parse-dimension dim)
                mapping    (get mappings-by-dim-id (:id parsed-dim))]]
      (-> parsed-dim
          (assoc :lib/type :metadata/dimension
                 :source-type source-type
                 :source-id (:id entity))
          (cond->
           mapping
            (assoc :dimension-mapping mapping)
            (and (not (seq (:sources parsed-dim))) mapping)
            (assoc :sources (derive-sources-from-mapping mapping)))))))

(defn- extract-all-dimensions
  "Extract all dimensions from parsed metrics and measures."
  [parsed-metrics parsed-measures]
  (vec (concat
        (mapcat #(extract-dimensions-from-entity % :metric) (vals parsed-metrics))
        (mapcat #(extract-dimensions-from-entity % :measure) (vals parsed-measures)))))

;;; ------------------------------------------------- Provider Construction -------------------------------------------------

(defn metadata-provider
  "Create a MetricMetadataProvider from JS/Redux data.

   Arguments:
   - `metrics-data` - JS object with metric definitions
   - `measures-data` - JS object with measure definitions (optional, can be nil)
   - `metadata` - Full JS metadata object (passed to js-metadata/metadata-provider for each db)
   - `table->db-id` - Clojure map of table-id -> database-id
   - `settings` - JS object with Metabase settings"
  [metrics-data measures-data metadata table->db-id settings]
  (let [parsed-metrics  (parse-metrics metrics-data)
        parsed-measures (parse-measures measures-data)
        all-dimensions  (extract-all-dimensions parsed-metrics parsed-measures)
        db-provider-cache (atom {})
        get-db-provider (fn [db-id]
                          (if-let [cached (get @db-provider-cache db-id)]
                            cached
                            (let [provider (js-metadata/metadata-provider db-id metadata)]
                              (swap! db-provider-cache assoc db-id provider)
                              provider)))
        setting-fn      (fn [setting-key]
                          (some-> settings (object-get (name setting-key))))
        db-provider-for-table (fn [table-id]
                                (when-let [db-id (get table->db-id table-id)]
                                  (get-db-provider db-id)))]
    (provider/metric-context-metadata-provider
     {:metric-fn           (fn [metric-id] (get parsed-metrics metric-id))
      :measure-fn          (fn [measure-id] (get parsed-measures measure-id))
      :dimension-fn        (fn [dimension-uuid]
                             (some #(when (= dimension-uuid (:id %)) %) all-dimensions))
      :dims-for-metric-fn  (fn [metric-id]
                             (filterv #(and (= :metric (:source-type %))
                                            (= metric-id (:source-id %)))
                                      all-dimensions))
      :dims-for-measure-fn (fn [measure-id]
                             (filterv #(and (= :measure (:source-type %))
                                            (= measure-id (:source-id %)))
                                      all-dimensions))
      :dims-for-table-fn   (fn [table-id]
                             (filterv #(= table-id (get-in % [:dimension-mapping :table-id]))
                                      all-dimensions))
      :cols-for-table-fn   (fn [table-id]
                             (when-let [provider (db-provider-for-table table-id)]
                               (lib.metadata.protocols/fields provider table-id)))
      :col-fn              (fn [table-id field-id]
                             (when-let [provider (db-provider-for-table table-id)]
                               (first (lib.metadata.protocols/metadatas provider {:lib/type :metadata/column
                                                                                  :table-id table-id
                                                                                  :id       #{field-id}}))))
      :table-fn            (fn [table-id]
                             (when-let [provider (db-provider-for-table table-id)]
                               (lib.metadata.protocols/table provider table-id)))
      :setting-fn          setting-fn
      :db-provider-fn      db-provider-for-table})))
