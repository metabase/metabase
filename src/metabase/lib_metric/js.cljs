(ns metabase.lib-metric.js
  "JavaScript-facing API for lib-metric functions."
  (:require
   [cljs.proxy :as proxy]
   [goog.object :as gobject]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.metadata.js :as lib-metric.metadata.js]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util :as u]))

(def ^:private camel->kebab-proxy
  "Proxy builder that converts camelCase JS keys to kebab-case Clojure keywords."
  (proxy/builder (comp keyword u/->kebab-case-en)))

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

;; =============================================================================
;; NotImplemented stubs with mock data
;; =============================================================================

(defn ^:export fromJsMetricDefinition
  "Convert a JS metric definition to a MetricDefinition.
   STUB: Returns mock data."
  [_js-definition]
  {:lib/type :metric/definition
   :source {:type :mock}})

(defn ^:export toJsMetricDefinition
  "Convert a MetricDefinition to a JS metric definition.
   STUB: Returns mock data."
  [_definition]
  #js {:sourceType "mock"
       :filters #js []
       :projections #js []})

(defn ^:export filterableDimensions
  "Get dimensions that can be used for filtering.
   STUB: Returns empty array."
  [_definition]
  (proxy/proxy []))

(defn ^:export filter
  "Add a filter clause to a metric definition.
   STUB: Returns the definition unchanged."
  [definition _filter-clause]
  definition)

(defn ^:export stringFilterClause
  "Create a string filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/string
   :operator :=
   :mock? true})

(defn ^:export stringFilterParts
  "Extract string filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export numberFilterClause
  "Create a number filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/number
   :operator :=
   :mock? true})

(defn ^:export numberFilterParts
  "Extract number filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export coordinateFilterClause
  "Create a coordinate filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/coordinate
   :operator :inside
   :mock? true})

(defn ^:export coordinateFilterParts
  "Extract coordinate filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export booleanFilterClause
  "Create a boolean filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/boolean
   :operator :=
   :mock? true})

(defn ^:export booleanFilterParts
  "Extract boolean filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export specificDateFilterClause
  "Create a specific date filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/specific-date
   :operator :=
   :mock? true})

(defn ^:export specificDateFilterParts
  "Extract specific date filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export relativeDateFilterClause
  "Create a relative date filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/relative-date
   :unit :day
   :mock? true})

(defn ^:export relativeDateFilterParts
  "Extract relative date filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export excludeDateFilterClause
  "Create an exclude date filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/exclude-date
   :operator :!=
   :mock? true})

(defn ^:export excludeDateFilterParts
  "Extract exclude date filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export timeFilterClause
  "Create a time filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/time
   :operator :=
   :mock? true})

(defn ^:export timeFilterParts
  "Extract time filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export defaultFilterClause
  "Create a default filter clause from parts.
   STUB: Returns mock clause."
  [_parts]
  {:lib/type :filter/default
   :operator :is-null
   :mock? true})

(defn ^:export defaultFilterParts
  "Extract default filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export projectionableDimensions
  "Get dimensions that can be used for projections.
   STUB: Returns empty array."
  [_definition]
  (proxy/proxy []))

(defn ^:export project
  "Add a projection clause to a metric definition.
   STUB: Returns the definition unchanged."
  [definition _projection-clause]
  definition)

(defn ^:export replaceClause
  "Replace a clause in a metric definition.
   STUB: Returns the definition unchanged."
  [definition _target-clause _new-clause]
  definition)

(defn ^:export removeClause
  "Remove a clause from a metric definition.
   STUB: Returns the definition unchanged."
  [definition _clause]
  definition)

(defn ^:export temporalBucket
  "Get the temporal bucket for a clause or dimension.
   STUB: Returns nil."
  [_clause-or-dimension]
  nil)

(defn ^:export availableTemporalBuckets
  "Get available temporal buckets for a dimension.
   STUB: Returns empty array."
  [_definition _dimension]
  (proxy/proxy []))

(defn ^:export withTemporalBucket
  "Apply a temporal bucket to a dimension.
   STUB: Returns the dimension unchanged."
  [dimension _bucket]
  dimension)

(defn ^:export binning
  "Get the binning strategy for a clause or dimension.
   STUB: Returns nil."
  [_clause-or-dimension]
  nil)

(defn ^:export availableBinningStrategies
  "Get available binning strategies for a dimension.
   STUB: Returns empty array."
  [_definition _dimension]
  (proxy/proxy []))

(defn ^:export withBinning
  "Apply a binning strategy to a dimension.
   STUB: Returns the dimension unchanged."
  [dimension _binning-strategy]
  dimension)

(defn ^:export isBoolean
  "Check if dimension is boolean type.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isCoordinate
  "Check if dimension is coordinate type.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isTemporal
  "Check if dimension is temporal type.
   STUB: Returns false."
  [_dimension]
  true)

(defn ^:export isDateOrDateTime
  "Check if dimension is date or datetime type.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isForeignKey
  "Check if dimension is a foreign key.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isLocation
  "Check if dimension is a location type.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isLatitude
  "Check if dimension is a latitude.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isLongitude
  "Check if dimension is a longitude.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isNumeric
  "Check if dimension is numeric type.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isPrimaryKey
  "Check if dimension is a primary key.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isStringLike
  "Check if dimension is string-like type.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isStringOrStringLike
  "Check if dimension is string or string-like type.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export isTime
  "Check if dimension is time type.
   STUB: Returns false."
  [_dimension]
  false)

(defn ^:export displayInfo
  "Get display info for a displayable item.
   STUB: Returns mock display info."
  [_definition _source]
  (camel->kebab-proxy
   {:display-name "Mock Display Name"}))

(defn ^:export dimensionValuesInfo
  "Get dimension values info.
   STUB: Returns mock info."
  [_definition _dimension]
  (camel->kebab-proxy
   {:id nil
    :can-list-values false
    :can-search-values false
    :can-remap-values false}))
