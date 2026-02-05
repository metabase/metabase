(ns metabase.lib-metric.js
  "JavaScript-facing API for lib-metric functions."
  (:require
   [cljs.proxy :as proxy]
   [goog.object :as gobject]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.metadata.js :as lib-metric.metadata.js]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

;; Ensure all lib-metric code is loaded for any defmethod registrations
(comment lib-metric/keep-me
         lib-metric.metadata.js/keep-me)

(defn- object-get [obj k]
  (when (and obj (js-in k obj))
    (gobject/get obj k)))

(defn- build-table->db-id
  "Build a map of table-id -> database-id from the tables in metadata."
  [metadata]
  (let [tables (object-get metadata "tables")]
    (when tables
      (into {}
            (keep (fn [k]
                    ;; Skip card__* virtual tables
                    (when-not (re-find #"^card__" k)
                      (when-let [table-id (parse-long k)]
                        (let [table (object-get tables k)
                              db-id (or (object-get table "db_id")
                                        (object-get table "db-id"))]
                          (when db-id
                            [table-id db-id]))))))
            (js-keys tables)))))

(defn ^:export metadataProvider
  "Create a MetricMetadataProvider from JS/Redux metadata.

   This provider enables building metric queries that span multiple databases.
   Unlike the standard Lib.metadataProvider which is scoped to a single database,
   this provider has no single database context and routes requests based on
   table-id.

   Arguments:
   - `metadata` - JS metadata object (same format as passed to Lib.metadataProvider)

   Returns a MetadataProvider that:
   - Returns nil for database() since there's no single database context
   - Routes metric requests to metrics in the metadata
   - Routes measure requests to measures in the metadata (if provided)
   - Routes table/column requests to database-specific providers

   Usage in TypeScript:
   ```typescript
   import { metadataProvider } from 'metabase-lib/metric';
   const provider = metadataProvider(metadata);
   ```"
  [metadata]
  (let [;; Extract metrics - they're stored under 'metrics' key
        metrics-data (object-get metadata "metrics")
        ;; Extract measures - they're stored under 'measures' key
        measures-data (object-get metadata "measures")
        ;; Build table-id -> db-id mapping from tables
        table->db-id (build-table->db-id metadata)
        ;; Settings are under 'settings' key
        settings (object-get metadata "settings")]
    (lib-metric.metadata.js/metadata-provider
     metrics-data
     measures-data
     metadata
     table->db-id
     settings)))

(defn ^:export metricMetadata
  "Get metadata for the Metric with `metric-id`.
   Returns nil if not found."
  [metadata-provider metric-id]
  (first (lib.metadata.protocols/metadatas
          metadata-provider
          {:lib/type :metadata/metric, :id #{metric-id}})))

(defn ^:export measureMetadata
  "Get metadata for the Measure with `measure-id`.
   Returns nil if not found."
  [metadata-provider measure-id]
  (first (lib.metadata.protocols/metadatas
          metadata-provider
          {:lib/type :metadata/measure, :id #{measure-id}})))

(defn ^:export fromMetricMetadata
  "Create a MetricDefinition from metric metadata.
   Returns opaque CLJS data (no conversion needed for TypeScript's opaque type).
   The metricMetadata should already be a CLJS data structure from the provider."
  [provider metric-metadata]
  (lib-metric.definition/from-metric-metadata provider metric-metadata))

(defn ^:export fromMeasureMetadata
  "Create a MetricDefinition from measure metadata.
   Returns opaque CLJS data (no conversion needed for TypeScript's opaque type).
   The measureMetadata should already be a CLJS data structure from the provider."
  [provider measure-metadata]
  (lib-metric.definition/from-measure-metadata provider measure-metadata))

(defn ^:export sourceMetricId
  "Get the source metric ID from a definition, or null if measure-based."
  [definition]
  (lib-metric.definition/source-metric-id definition))

(defn ^:export sourceMeasureId
  "Get the source measure ID from a definition, or null if metric-based."
  [definition]
  (lib-metric.definition/source-measure-id definition))

(defn ^:export filters
  "Get the filter clauses from a metric definition.
   Returns a JS array of opaque CLJS values."
  [definition]
  (proxy/proxy (lib-metric.definition/filters definition)))

(defn ^:export projections
  "Get the projection clauses from a metric definition.
   Returns a JS array of opaque CLJS values."
  [definition]
  (proxy/proxy (lib-metric.definition/projections definition)))
