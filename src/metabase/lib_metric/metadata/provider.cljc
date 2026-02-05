(ns metabase.lib-metric.metadata.provider
  "MetadataProvider for metric-based queries with no single database context.

   This provider enables building metric queries that can span multiple databases.
   It has no single database context - instead, it routes metadata requests to
   database-specific providers based on `table-id`.

   The provider delegates to underlying database-specific providers for table/column
   metadata, while managing metric metadata centrally."
  (:require
   #?@(:clj [[potemkin :as p]])
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util.malli :as mu]))

(#?(:clj p/defprotocol+ :cljs defprotocol) MetricMetadataProvider
  "Protocol extension for metric-specific operations on a MetadataProvider."
  (database-provider-for-table [this table-id]
    "Get the database-specific MetadataProvider for a given table-id.
     Returns nil if the table cannot be found."))

(defn- route-table-metadata
  "Route table metadata request to the appropriate database provider."
  [table->db-fn db-provider-fn {id-set :id, :as metadata-spec}]
  (if-not id-set
    ;; Without specific table IDs, we can't route - return empty
    []
    ;; Group table IDs by their database and fetch from each
    (let [tables-by-db (group-by table->db-fn id-set)]
      (into []
            (mapcat (fn [[db-id table-ids]]
                      (when-let [provider (db-provider-fn db-id)]
                        (lib.metadata.protocols/metadatas
                         provider
                         (assoc metadata-spec :id (set table-ids))))))
            tables-by-db))))

(defn- route-column-metadata
  "Route column metadata request to the appropriate database provider."
  [table->db-fn db-provider-fn {:keys [table-id], :as metadata-spec}]
  (when table-id
    (when-let [db-id (table->db-fn table-id)]
      (when-let [provider (db-provider-fn db-id)]
        (lib.metadata.protocols/metadatas provider metadata-spec)))))

(defn- route-segment-or-measure-metadata
  "Route segment or measure metadata request to the appropriate database provider."
  [table->db-fn db-provider-fn {:keys [table-id], :as metadata-spec}]
  (when table-id
    (when-let [db-id (table->db-fn table-id)]
      (when-let [provider (db-provider-fn db-id)]
        (lib.metadata.protocols/metadatas provider metadata-spec)))))

(defn- route-card-metadata
  "Route card metadata request. Cards can span databases, so we need to handle this specially."
  [table->db-fn db-provider-fn {id-set :id, :as metadata-spec}]
  ;; Cards are trickier - they have database_id, not table_id
  ;; For now, if we have specific card IDs, try to fetch from each known database
  ;; This is a limitation - we'd need a card->database mapping to do this efficiently
  ;; Return empty for now - callers should use a database-specific provider for cards
  [])

;; The main provider type that routes requests to database-specific providers
(deftype MetricContextMetadataProvider
         [metric-fetcher-fn     ;; (fn [metadata-spec] ...) returns metrics
          measure-fetcher-fn    ;; (fn [metadata-spec] ...) returns measures (optional, can be nil)
          table->db-fn          ;; (fn [table-id] ...) returns database-id
          db-provider-fn        ;; (fn [db-id] ...) returns MetadataProvider for that database
          setting-fn            ;; (fn [setting-key] ...) returns setting value
          metric-cache          ;; atom for caching metric metadata
          ]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    ;; No single database context for metric provider
    nil)

  (metadatas [_this {metadata-type :lib/type, :as metadata-spec}]
    (case metadata-type
      :metadata/metric
      (metric-fetcher-fn metadata-spec)

      :metadata/table
      (route-table-metadata table->db-fn db-provider-fn metadata-spec)

      :metadata/column
      (or (route-column-metadata table->db-fn db-provider-fn metadata-spec) [])

      :metadata/measure
      (if measure-fetcher-fn
        (measure-fetcher-fn metadata-spec)
        (or (route-segment-or-measure-metadata table->db-fn db-provider-fn metadata-spec) []))

      :metadata/segment
      (or (route-segment-or-measure-metadata table->db-fn db-provider-fn metadata-spec) [])

      :metadata/card
      (route-card-metadata table->db-fn db-provider-fn metadata-spec)

      ;; For other types (native-query-snippet, transform), return empty
      []))

  (setting [_this setting-key]
    (setting-fn setting-key))

  lib.metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type metadata-ids]
    (when (= metadata-type :metadata/metric)
      (let [cache @metric-cache]
        (into []
              (keep #(get cache %))
              metadata-ids))))

  (store-metadata! [_this object]
    (when (= (:lib/type object) :metadata/metric)
      (swap! metric-cache assoc (:id object) object))
    true)

  (cached-value [_this k not-found]
    (get @metric-cache [::cached-value k] not-found))

  (cache-value! [_this k v]
    (swap! metric-cache assoc [::cached-value k] v)
    nil)

  (has-cache? [_this]
    true)

  (clear-cache! [_this]
    (reset! metric-cache {})
    nil)

  MetricMetadataProvider
  (database-provider-for-table [_this table-id]
    (when-let [db-id (table->db-fn table-id)]
      (db-provider-fn db-id)))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? MetricContextMetadataProvider another)
         (= metric-fetcher-fn (.-metric-fetcher-fn ^MetricContextMetadataProvider another))
         (= measure-fetcher-fn (.-measure-fetcher-fn ^MetricContextMetadataProvider another))
         (= table->db-fn (.-table->db-fn ^MetricContextMetadataProvider another))
         (= db-provider-fn (.-db-provider-fn ^MetricContextMetadataProvider another))
         (= setting-fn (.-setting-fn ^MetricContextMetadataProvider another)))))

(mu/defn metric-context-metadata-provider
  "Create a MetricMetadataProvider for queries that span multiple databases.

   Arguments:
   - `metric-fetcher-fn` - `(fn [metadata-spec] ...)` returns metrics matching the spec
   - `measure-fetcher-fn` (optional) - `(fn [metadata-spec] ...)` returns measures matching the spec
   - `table->db-fn` - `(fn [table-id] ...)` returns database-id for a table
   - `db-provider-fn` - `(fn [db-id] ...)` returns MetadataProvider for that database
   - `setting-fn` - `(fn [setting-key] ...)` returns setting value

   The returned provider:
   - Returns nil for `(database provider)` since there's no single database context
   - Routes metric requests to the metric-fetcher-fn
   - Routes measure requests to measure-fetcher-fn if provided, otherwise to database provider
   - Routes table/column/segment requests to the appropriate database provider
   - Caches metric metadata internally"
  ([metric-fetcher-fn table->db-fn db-provider-fn setting-fn]
   (metric-context-metadata-provider metric-fetcher-fn nil table->db-fn db-provider-fn setting-fn))
  ([metric-fetcher-fn measure-fetcher-fn table->db-fn db-provider-fn setting-fn]
   (->MetricContextMetadataProvider
    metric-fetcher-fn
    measure-fetcher-fn
    table->db-fn
    db-provider-fn
    setting-fn
    (atom {}))))

(def keep-me
  "Var used to ensure this namespace is loaded."
  ::keep-me)
