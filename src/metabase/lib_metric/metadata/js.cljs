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

(defn metadata-provider
  "Create a MetricMetadataProvider from JS/Redux data.

   Arguments:
   - `metrics-data` - JS object with metric definitions
   - `metadata` - Full JS metadata object (passed to js-metadata/metadata-provider for each db)
   - `table->db-id` - Clojure map of table-id -> database-id
   - `settings` - JS object with Metabase settings

   The returned provider:
   - Returns nil for database() since there's no single database context
   - Routes metric requests to the pre-loaded metrics data
   - Routes table/column requests to database-specific providers"
  [metrics-data metadata table->db-id settings]
  (let [parsed-metrics (parse-metrics metrics-data)
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
     (fn [table-id] (get table->db-id table-id))
     db-provider-fn
     setting-fn)))
