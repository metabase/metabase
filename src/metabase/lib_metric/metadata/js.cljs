(ns metabase.lib-metric.metadata.js
  "JS/ClojureScript implementation of MetricMetadataProvider.

   This provider enables building metric queries that span multiple databases
   in the frontend. It takes pre-loaded metadata from Redux and routes requests
   to database-specific providers as needed."
  (:require
   [goog.object :as gobject]
   [metabase.lib-metric.metadata.provider :as provider]
   [metabase.lib.js.metadata :as js-metadata]
   [metabase.util :as u]))

(comment provider/keep-me)

(def keep-me
  "Var used to ensure this namespace is loaded."
  ::keep-me)

(defn- object-get [obj k]
  (when (and obj (js-in k obj))
    (gobject/get obj k)))

(defn- parse-metric
  "Parse a single metric from JS object to Clojure map."
  [metric-obj]
  (when metric-obj
    (let [parsed (-> (js->clj metric-obj :keywordize-keys true)
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

(defn- filter-metrics
  "Filter parsed metrics according to metadata-spec."
  [metrics {id-set :id, name-set :name, :keys [table-id card-id], :as _metadata-spec}]
  (let [active-only? (not (or id-set name-set))]
    (into []
          (comp
           (if id-set
             (filter #(contains? id-set (:id %)))
             identity)
           (if name-set
             (filter #(contains? name-set (:name %)))
             identity)
           (if table-id
             (filter #(and (= (:table-id %) table-id)
                           (nil? (:source-card-id %))))
             identity)
           (if card-id
             (filter #(= (:source-card-id %) card-id))
             identity)
           (if active-only?
             (filter #(not (:archived %)))
             identity)
           ;; Ensure only metrics (type = :metric)
           (filter #(= (:type %) :metric)))
          (vals metrics))))

(defn- parse-measure
  "Parse a single measure from JS object to Clojure map."
  [measure-obj]
  (when measure-obj
    (let [parsed (-> (js->clj measure-obj :keywordize-keys true)
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

(defn- filter-measures
  "Filter parsed measures according to metadata-spec."
  [measures {id-set :id, name-set :name, :keys [table-id], :as _metadata-spec}]
  (let [active-only? (not (or id-set name-set))]
    (into []
          (comp
           (if id-set
             (filter #(contains? id-set (:id %)))
             identity)
           (if name-set
             (filter #(contains? name-set (:name %)))
             identity)
           (if table-id
             (filter #(= (:table-id %) table-id))
             identity)
           (if active-only?
             (filter #(not (:archived %)))
             identity))
          (vals measures))))

;;; ------------------------------------------------- Dimension Fetching -------------------------------------------------

(defn- extract-dimensions-from-entity
  "Extract dimensions from a parsed metric or measure, annotating with source info."
  [entity source-type]
  (let [dims     (:dimensions entity)
        mappings (:dimension-mappings entity)
        mappings-by-dim-id (into {} (map (juxt :dimension-id identity) mappings))]
    (for [dim dims]
      (-> dim
          (assoc :lib/type :metadata/dimension
                 :source-type source-type
                 :source-id (:id entity))
          (cond->
           (get mappings-by-dim-id (:id dim))
            (assoc :dimension-mapping (get mappings-by-dim-id (:id dim))))))))

(defn- extract-all-dimensions
  "Extract all dimensions from parsed metrics and measures."
  [parsed-metrics parsed-measures]
  (concat
   (mapcat #(extract-dimensions-from-entity % :metric) (vals parsed-metrics))
   (mapcat #(extract-dimensions-from-entity % :measure) (vals parsed-measures))))

(defn- filter-dimensions
  "Filter dimensions according to metadata-spec."
  [dimensions {id-set :id, :keys [metric-id measure-id table-id]}]
  (cond->> dimensions
    id-set      (filter #(contains? id-set (:id %)))
    metric-id   (filter #(and (= :metric (:source-type %))
                              (= metric-id (:source-id %))))
    measure-id  (filter #(and (= :measure (:source-type %))
                              (= measure-id (:source-id %))))
    table-id    (filter #(= table-id (get-in % [:dimension-mapping :table-id])))
    true        vec))

(defn metadata-provider
  "Create a MetricMetadataProvider from JS/Redux data.

   Arguments:
   - `metrics-data` - JS object with metric definitions
   - `measures-data` - JS object with measure definitions (optional, can be nil)
   - `metadata` - Full JS metadata object (passed to js-metadata/metadata-provider for each db)
   - `table->db-id` - Clojure map of table-id -> database-id
   - `settings` - JS object with Metabase settings

   The returned provider:
   - Returns nil for database() since there's no single database context
   - Routes metric requests to the pre-loaded metrics data
   - Routes measure requests to the pre-loaded measures data if provided
   - Routes dimension requests to dimensions extracted from metrics/measures
   - Routes table/column requests to database-specific providers"
  [metrics-data measures-data metadata table->db-id settings]
  (let [parsed-metrics (parse-metrics metrics-data)
        parsed-measures (parse-measures measures-data)
        all-dimensions (extract-all-dimensions parsed-metrics parsed-measures)
        db-provider-cache (atom {})
        db-provider-fn (fn [db-id]
                         (if-let [cached (get @db-provider-cache db-id)]
                           cached
                           ;; js-metadata/metadata-provider takes db-id and the full metadata object
                           (let [provider (js-metadata/metadata-provider db-id metadata)]
                             (swap! db-provider-cache assoc db-id provider)
                             provider)))
        setting-fn (fn [setting-key]
                     (some-> settings (object-get (name setting-key))))]
    (provider/metric-context-metadata-provider
     (fn [spec] (filter-metrics parsed-metrics spec))
     (when parsed-measures
       (fn [spec] (filter-measures parsed-measures spec)))
     (fn [spec] (filter-dimensions all-dimensions spec))
     (fn [table-id] (get table->db-id table-id))
     db-provider-fn
     setting-fn)))
