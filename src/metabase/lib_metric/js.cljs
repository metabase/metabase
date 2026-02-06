(ns metabase.lib-metric.js
  "JavaScript-facing API for lib-metric functions."
  (:require
   [goog.object :as gobject]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.metadata.js :as lib-metric.metadata.js]
   [metabase.lib-metric.proxy :as proxy]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
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

(defn- ->metadata-provider
  "Extract the metadata provider from a MetadataProviderable.
   If passed a MetricDefinition, extracts its :metadata-provider.
   Otherwise, assumes it's already a MetadataProvider and returns it."
  [providerable]
  (if (and (map? providerable)
           (= :metric/definition (:lib/type providerable)))
    (:metadata-provider providerable)
    providerable))

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
   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition).
   Returns nil if not found."
  [providerable metric-id]
  (first (lib.metadata.protocols/metadatas
          (->metadata-provider providerable)
          {:lib/type :metadata/metric, :id #{metric-id}})))

(defn ^:export measureMetadata
  "Get metadata for the Measure with `measure-id`.
   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition).
   Returns nil if not found."
  [providerable measure-id]
  (first (lib.metadata.protocols/metadatas
          (->metadata-provider providerable)
          {:lib/type :metadata/measure, :id #{measure-id}})))

(defn ^:export fromMetricMetadata
  "Create a MetricDefinition from metric metadata.
   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition).
   Returns opaque CLJS data (no conversion needed for TypeScript's opaque type).
   The metricMetadata should already be a CLJS data structure from the provider."
  [providerable metric-metadata]
  (lib-metric.definition/from-metric-metadata (->metadata-provider providerable) metric-metadata))

(defn ^:export fromMeasureMetadata
  "Create a MetricDefinition from measure metadata.
   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition).
   Returns opaque CLJS data (no conversion needed for TypeScript's opaque type).
   The measureMetadata should already be a CLJS data structure from the provider."
  [providerable measure-metadata]
  (lib-metric.definition/from-measure-metadata (->metadata-provider providerable) measure-metadata))

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
;; Mock data for stubs
;; =============================================================================

(def ^:private mock-dimensions
  "Mock dimension metadata for testing."
  [{:lib/type       :metadata/dimension
    :id             "d1-created-at"
    :name           "created_at"
    :display-name   "Created At"
    :effective-type :type/DateTime
    :semantic-type  :type/CreationTimestamp
    :source-type    :metric
    :source-id      1}
   {:lib/type       :metadata/dimension
    :id             "d2-category"
    :name           "category"
    :display-name   "Category"
    :effective-type :type/Text
    :semantic-type  :type/Category
    :source-type    :metric
    :source-id      1}
   {:lib/type       :metadata/dimension
    :id             "d3-amount"
    :name           "amount"
    :display-name   "Amount"
    :effective-type :type/Number
    :semantic-type  nil
    :source-type    :metric
    :source-id      1}])

(def ^:private mock-temporal-buckets
  "Mock temporal buckets for date/time dimensions."
  [{:lib/type :temporal-bucket
    :unit     :day}
   {:lib/type :temporal-bucket
    :unit     :week}
   {:lib/type :temporal-bucket
    :unit     :month
    :default  true}
   {:lib/type :temporal-bucket
    :unit     :quarter}
   {:lib/type :temporal-bucket
    :unit     :year}])

(def ^:private mock-binning-strategies
  "Mock binning strategies for numeric dimensions."
  [{:lib/type :binning-strategy
    :strategy :default
    :default  true}
   {:lib/type    :binning-strategy
    :strategy    :num-bins
    :num-bins    10}
   {:lib/type    :binning-strategy
    :strategy    :num-bins
    :num-bins    50}
   {:lib/type    :binning-strategy
    :strategy    :num-bins
    :num-bins    100}
   {:lib/type    :binning-strategy
    :strategy    :bin-width
    :bin-width   1.0}])

;; =============================================================================
;; NotImplemented stubs with mock data
;; =============================================================================

(defn ^:export fromJsMetricDefinition
  "Convert a JS metric definition (from JSON) to a MetricDefinition.

   The JS definition should match the format accepted by POST /api/metric/dataset:
   - source-metric OR source-measure (exactly one, as integer ID)
   - filters (optional array of MBQL filter clauses)
   - projections (optional array of dimension references)

   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition)
   to hydrate source metadata."
  [providerable js-definition]
  (let [provider       (->metadata-provider providerable)
        definition     (js->clj js-definition :keywordize-keys true)
        source-metric  (:source-metric definition)
        source-measure (:source-measure definition)
        filters        (or (:filters definition) [])
        projections    (or (:projections definition) [])
        [source-type source-id] (cond
                                  source-metric  [:source/metric source-metric]
                                  source-measure [:source/measure source-measure]
                                  :else          (throw (ex-info "Definition must have source-metric or source-measure"
                                                                 {:definition definition})))
        metadata       (if (= source-type :source/metric)
                         (lib.metadata.protocols/metadatas
                          provider {:lib/type :metadata/metric :id #{source-id}})
                         (lib.metadata.protocols/metadatas
                          provider {:lib/type :metadata/measure :id #{source-id}}))]
    {:lib/type          :metric/definition
     :source            {:type     source-type
                         :id       source-id
                         :metadata (first metadata)}
     :filters           filters
     :projections       projections
     :metadata-provider provider}))

(defn ^:export toJsMetricDefinition
  "Convert a MetricDefinition to a JS object for JSON serialization.

   Produces format compatible with POST /api/metric/dataset:
   - source-metric OR source-measure (integer ID)
   - filters (array, omitted if empty)
   - projections (array, omitted if empty)"
  [definition]
  (let [source-type (get-in definition [:source :type])
        source-id   (get-in definition [:source :id])
        filters     (:filters definition)
        projections (:projections definition)]
    (clj->js
     (cond-> {}
       (= source-type :source/metric)  (assoc :source-metric source-id)
       (= source-type :source/measure) (assoc :source-measure source-id)
       (seq filters)                   (assoc :filters filters)
       (seq projections)               (assoc :projections projections)))))

(defn ^:export filterableDimensions
  "Get dimensions that can be used for filtering.
   STUB: Returns mock dimensions."
  [_definition]
  (proxy/proxy mock-dimensions))

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
   :operator :=})

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
   :operator :=})

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
   :operator :inside})

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
   :operator :=})

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
   :operator :=})

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
   :unit :day})

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
   :operator :!=})

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
   :operator :=})

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
   :operator :is-null})

(defn ^:export defaultFilterParts
  "Extract default filter parts from a clause.
   STUB: Returns nil."
  [_definition _filter-clause]
  nil)

(defn ^:export projectionableDimensions
  "Get dimensions that can be used for projections.
   STUB: Returns mock dimensions."
  [_definition]
  (proxy/proxy mock-dimensions))

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
   STUB: Returns mock temporal buckets."
  [_definition _dimension]
  (proxy/proxy mock-temporal-buckets))

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
   STUB: Returns mock binning strategies."
  [_definition _dimension]
  (proxy/proxy mock-binning-strategies))

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
   Dispatches on :lib/type to return appropriate display info structure."
  [_definition source]
  (let [lib-type (:lib/type source)]
    (camel->kebab-proxy
     (case lib-type
       :metadata/metric
       {:display-name (or (:display-name source) (:name source) "Metric")}

       :metadata/measure
       {:display-name (or (:display-name source) (:name source) "Measure")}

       :metadata/dimension
       {:display-name         (or (:display-name source) (:name source) "Dimension")
        :filter-positions     []
        :projection-positions []}

       :temporal-bucket
       {:short-name   (name (:unit source))
        :display-name (lib.temporal-bucket/describe-temporal-unit (:unit source))
        :default      (boolean (:default source))
        :selected     (boolean (:selected source))}

       :binning-strategy
       {:display-name (lib.binning/binning-display-name source nil)
        :default      (boolean (:default source))
        :selected     (boolean (:selected source))}

       ;; Default for filter clauses and other types
       {:display-name (or (:display-name source)
                          (when-let [op (:operator source)]
                            (name op))
                          "Unknown")}))))

(defn ^:export dimensionValuesInfo
  "Get dimension values info.
   STUB: Returns mock info based on dimension."
  [_definition dimension]
  (camel->kebab-proxy
   {:id                (:id dimension)
    :can-list-values   (= :type/Category (:semantic-type dimension))
    :can-search-values (= :type/Text (:effective-type dimension))
    :can-remap-values  false}))
