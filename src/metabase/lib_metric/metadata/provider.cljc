(ns metabase.lib-metric.metadata.provider
  "MetadataProvider protocol and implementation for lib-metric.

   lib-metric has its own metadata provider protocol rather than using
   `lib.metadata.protocols/MetadataProvider`. This gives lib-metric a focused API
   that directly expresses what it needs (metrics, measures, dimensions) without
   forcing everything through a generic `metadatas` dispatch.

   For operations that require `lib/query`, `lib/visible-columns`, etc., the
   `database-provider-for-table` method returns a standard `MetadataProvider`
   scoped to a specific database."
  (:require
   #?@(:clj [[potemkin :as p]])
   [metabase.util.malli.registry :as mr]))

(#?(:clj p/defprotocol+ :cljs defprotocol) MetricMetadataProvider
  "Protocol for fetching metadata needed by lib-metric.

   Unlike `lib.metadata.protocols/MetadataProvider`, this protocol has specific
   methods for each type of metadata lib-metric needs, rather than a single
   generic `metadatas` method."
  (metric [this metric-id]
    "Fetch a single metric by ID. Returns nil if not found.")
  (measure [this measure-id]
    "Fetch a single measure by ID. Returns nil if not found.")
  (dimension [this dimension-uuid]
    "Fetch a single dimension by UUID. Returns nil if not found.")
  (dimensions-for-metric [this metric-id]
    "Fetch all dimensions for a metric. Returns a sequence.")
  (dimensions-for-measure [this measure-id]
    "Fetch all dimensions for a measure. Returns a sequence.")
  (dimensions-for-table [this table-id]
    "Fetch all dimensions mapped to a table (from both metrics and measures). Returns a sequence.")
  (columns-for-table [this table-id]
    "Fetch columns for a table. Returns a sequence.")
  (column [this table-id field-id]
    "Fetch a single column by table-id and field-id. Returns nil if not found.")
  (metric-table [this table-id]
    "Fetch table metadata by ID. Returns nil if not found.")
  (metric-setting [this setting-key]
    "Fetch a Metabase setting value by key.")
  (database-provider-for-table [this table-id]
    "Get a standard `lib.metadata.protocols/MetadataProvider` for the database
     that owns the given table. Used when lib-metric needs to call `lib/query`,
     `lib/visible-columns`, etc. Returns nil if the table cannot be found."))

(defn metric-metadata-provider?
  "Whether `x` satisfies the [[MetricMetadataProvider]] protocol."
  [x]
  (satisfies? MetricMetadataProvider x))

(mr/def ::metric-metadata-provider
  "Schema for something that satisfies the [[MetricMetadataProvider]] protocol."
  [:fn
   {:error/message "Valid MetricMetadataProvider"}
   #'metric-metadata-provider?])

;; Implementation that delegates to fetcher functions.
;; This is the primary implementation — both JVM and JS create instances via
;; the constructor below, passing in platform-specific fetcher fns.
(deftype MetricContextMetadataProvider
         [metric-fn          ;; (fn [metric-id] ...) returns a single metric or nil
          measure-fn         ;; (fn [measure-id] ...) returns a single measure or nil
          dimension-fn       ;; (fn [dimension-uuid] ...) returns a single dimension or nil
          dims-for-metric-fn ;; (fn [metric-id] ...) returns seq of dimensions
          dims-for-measure-fn ;; (fn [measure-id] ...) returns seq of dimensions
          dims-for-table-fn  ;; (fn [table-id] ...) returns seq of dimensions
          cols-for-table-fn  ;; (fn [table-id] ...) returns seq of columns
          col-fn             ;; (fn [table-id field-id] ...) returns a single column or nil
          table-fn           ;; (fn [table-id] ...) returns table metadata or nil
          setting-fn         ;; (fn [setting-key] ...) returns setting value
          db-provider-fn     ;; (fn [table-id] ...) returns MetadataProvider or nil
          ]
  MetricMetadataProvider
  (metric [_this metric-id]
    (metric-fn metric-id))

  (measure [_this measure-id]
    (measure-fn measure-id))

  (dimension [_this dimension-uuid]
    (dimension-fn dimension-uuid))

  (dimensions-for-metric [_this metric-id]
    (dims-for-metric-fn metric-id))

  (dimensions-for-measure [_this measure-id]
    (dims-for-measure-fn measure-id))

  (dimensions-for-table [_this table-id]
    (dims-for-table-fn table-id))

  (columns-for-table [_this table-id]
    (cols-for-table-fn table-id))

  (column [_this table-id field-id]
    (col-fn table-id field-id))

  (metric-table [_this table-id]
    (table-fn table-id))

  (metric-setting [_this setting-key]
    (setting-fn setting-key))

  (database-provider-for-table [_this table-id]
    (db-provider-fn table-id)))

(defn metric-context-metadata-provider
  "Create a [[MetricMetadataProvider]] backed by the given fetcher functions.

   Takes a map with the following keys (all functions):
   - `:metric-fn`           - `(fn [metric-id])` returns a single metric or nil
   - `:measure-fn`          - `(fn [measure-id])` returns a single measure or nil
   - `:dimension-fn`        - `(fn [dimension-uuid])` returns a single dimension or nil
   - `:dims-for-metric-fn`  - `(fn [metric-id])` returns seq of dimensions
   - `:dims-for-measure-fn` - `(fn [measure-id])` returns seq of dimensions
   - `:dims-for-table-fn`   - `(fn [table-id])` returns seq of dimensions
   - `:cols-for-table-fn`   - `(fn [table-id])` returns seq of columns
   - `:col-fn`              - `(fn [table-id field-id])` returns a single column or nil
   - `:table-fn`            - `(fn [table-id])` returns table metadata or nil
   - `:setting-fn`          - `(fn [setting-key])` returns setting value
   - `:db-provider-fn`      - `(fn [table-id])` returns a standard MetadataProvider or nil"
  [{:keys [metric-fn measure-fn dimension-fn
           dims-for-metric-fn dims-for-measure-fn dims-for-table-fn
           cols-for-table-fn col-fn table-fn setting-fn db-provider-fn]}]
  (->MetricContextMetadataProvider
   metric-fn measure-fn dimension-fn
   dims-for-metric-fn dims-for-measure-fn dims-for-table-fn
   cols-for-table-fn col-fn table-fn setting-fn db-provider-fn))
