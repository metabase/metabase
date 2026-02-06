(ns metabase.lib-metric.js
  "JavaScript-facing API for lib-metric functions."
  (:refer-clojure :exclude [filter])
  (:require
   [clojure.string :as str]
   [goog.object :as gobject]
   [metabase.lib-metric.clause :as lib-metric.clause]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.display-info :as lib-metric.display-info]
   [metabase.lib-metric.filter :as lib-metric.filter]
   [metabase.lib-metric.metadata.js :as lib-metric.metadata.js]
   [metabase.lib-metric.projection :as lib-metric.projection]
   [metabase.lib-metric.types.isa :as types.isa]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util :as u]
   [metabase.util.memoize :as memoize]))

;; =============================================================================
;; CLJS -> JS Conversion Utilities
;; =============================================================================
;; These conversion functions transform CLJS data structures to JS objects/arrays.
;; Adapted from metabase.lib/js.cljs for consistent interop patterns.

(declare ^:private display-info->js)

(defn- cljs-key->js-key
  "Converts idiomatic Clojure keys (`:kebab-case-keywords`) into idiomatic JavaScript keys (`\"camelCaseStrings\"`).

  Namespaces are preserved. A `?` suffix in Clojure is replaced with an `\"is\"` prefix in JavaScript, eg.
  `:many-pks?` becomes `isManyPks`."
  [cljs-key]
  (let [key-str (u/qualified-name cljs-key)
        key-str (if (str/ends-with? key-str "?")
                  (str "is-" (str/replace key-str #"\?$" ""))
                  key-str)]
    (u/->camelCaseEn key-str)))

(defn- display-info-map->js* [x]
  (reduce (fn [obj [cljs-key cljs-val]]
            (let [js-key (cljs-key->js-key cljs-key)
                  js-val (display-info->js cljs-val)]
              (gobject/set obj js-key js-val)
              obj))
          #js {}
          x))

(def ^:private display-info-map->js
  (memoize/lru display-info-map->js* :lru/threshold 256))

(defn- display-info-seq->js* [x]
  (to-array (map display-info->js x)))

(def ^:private display-info-seq->js
  (memoize/lru display-info-seq->js* :lru/threshold 256))

(defn- display-info->js
  "Converts CLJS display info results into JS objects for the FE to consume.
  Recursively converts CLJS maps and sequences into JS objects and arrays."
  [x]
  (cond
    (nil? x)     nil
    (map? x)     (display-info-map->js x)
    (string? x)  x
    (seqable? x) (display-info-seq->js x)
    (keyword? x) (u/qualified-name x)
    :else        x))

;; Ensure all lib-metric code is loaded for any defmethod registrations
(comment lib-metric/keep-me
         lib-metric.display-info/keep-me
         lib-metric.metadata.js/keep-me)

(defn- object-get [obj k]
  (when (and obj (js-in k obj))
    (gobject/get obj k)))

(defn- get-prop
  "Get a property from an object that may be either a CLJS map or a JS Proxy.
   Tries CLJS keyword access first, then falls back to JS property access."
  [obj cljs-key js-key]
  (or (get obj cljs-key)
      (gobject/get obj js-key)))

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
  (to-array (lib-metric.definition/filters definition)))

(defn ^:export projections
  "Get the projection clauses from a metric definition.
   Returns a JS array of opaque CLJS values."
  [definition]
  (to-array (lib-metric.definition/projections definition)))

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
   Each dimension includes :filter-positions indicating which filter indices use it,
   and :operators containing available filter operators for that dimension type."
  [definition]
  (to-array (lib-metric.filter/filterable-dimensions definition)))

(defn ^:export filter
  "Add a filter clause to a metric definition.
   Returns a new MetricDefinition with the filter added."
  [definition filter-clause]
  (lib-metric.filter/add-filter definition filter-clause))

(defn ^:export filterableDimensionOperators
  "Get available filter operators for a dimension.
   Returns a JS array of operator keyword strings (e.g., ['=', '!=', 'contains', ...]).
   Unlike metabase.lib which wraps operators in maps, this returns simple strings."
  [dimension]
  (to-array (map name (lib-metric.filter/filterable-dimension-operators dimension))))

;;; -------------------------------------------------- Filter Parts JS Conversion --------------------------------------------------

(defn- js-key->cljs-key
  "Converts idiomatic JavaScript keys (`\"camelCaseStrings\"`) into idiomatic Clojure keys (`:kebab-case-keywords`).
   Inverse of cljs-key->js-key."
  [js-key]
  (-> js-key
      (str/replace #"([a-z])([A-Z])" "$1-$2")
      str/lower-case
      keyword))

(defn- js-options->cljs-options
  "Convert JS options object to CLJS map with kebab-case keys."
  [js-options]
  (when js-options
    (reduce (fn [acc k]
              (let [cljs-key (js-key->cljs-key k)
                    v (gobject/get js-options k)]
                (assoc acc cljs-key v)))
            {}
            (js-keys js-options))))

(defn- cljs-options->js-options
  "Convert CLJS options map to JS object with camelCase keys."
  [cljs-options]
  (when (seq cljs-options)
    (let [result #js {}]
      (doseq [[k v] cljs-options]
        (gobject/set result (cljs-key->js-key k) v))
      result)))

(defn- filter-parts-js->cljs
  "Convert JS filter parts object to CLJS map.
   Handles camelCase -> kebab-case key conversion."
  [js-parts]
  (when js-parts
    (let [operator (some-> (gobject/get js-parts "operator") keyword)
          dimension (gobject/get js-parts "dimension")
          values (some-> (gobject/get js-parts "values") js->clj)
          options (js-options->cljs-options (gobject/get js-parts "options"))
          ;; For coordinate filters
          longitude-dimension (gobject/get js-parts "longitudeDimension")
          ;; For relative date filters
          unit (some-> (gobject/get js-parts "unit") keyword)
          value (gobject/get js-parts "value")
          offset-unit (some-> (gobject/get js-parts "offsetUnit") keyword)
          offset-value (gobject/get js-parts "offsetValue")
          ;; For specific date filters
          has-time (gobject/get js-parts "hasTime")]
      (cond-> {}
        operator             (assoc :operator operator)
        dimension            (assoc :dimension dimension)
        values               (assoc :values values)
        options              (assoc :options options)
        longitude-dimension  (assoc :longitude-dimension longitude-dimension)
        unit                 (assoc :unit unit)
        (some? value)        (assoc :value value)
        offset-unit          (assoc :offset-unit offset-unit)
        (some? offset-value) (assoc :offset-value offset-value)
        (some? has-time)     (assoc :has-time has-time)))))

(defn- filter-parts-cljs->js
  "Convert CLJS filter parts map to JS object.
   Handles kebab-case -> camelCase key conversion."
  [cljs-parts]
  (when cljs-parts
    (let [result #js {}]
      (when-let [operator (:operator cljs-parts)]
        (gobject/set result "operator" (name operator)))
      (when-let [dimension (:dimension cljs-parts)]
        (gobject/set result "dimension" dimension))
      (when-let [values (:values cljs-parts)]
        (gobject/set result "values" (to-array values)))
      (when-let [options (:options cljs-parts)]
        (gobject/set result "options" (cljs-options->js-options options)))
      (when-let [lon-dim (:longitude-dimension cljs-parts)]
        (gobject/set result "longitudeDimension" lon-dim))
      (when-let [unit (:unit cljs-parts)]
        (gobject/set result "unit" (name unit)))
      (when (contains? cljs-parts :value)
        (gobject/set result "value" (:value cljs-parts)))
      (when-let [offset-unit (:offset-unit cljs-parts)]
        (gobject/set result "offsetUnit" (name offset-unit)))
      (when (contains? cljs-parts :offset-value)
        (gobject/set result "offsetValue" (:offset-value cljs-parts)))
      (when (contains? cljs-parts :has-time)
        (gobject/set result "hasTime" (:has-time cljs-parts)))
      result)))

;;; -------------------------------------------------- Filter Clause/Parts Functions --------------------------------------------------

(defn ^:export stringFilterClause
  "Create a string filter clause from parts.
   Parts: {operator, dimension, values, options}"
  [parts]
  (lib-metric.filter/string-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export stringFilterParts
  "Extract string filter parts from a clause.
   Returns {operator, dimension, values, options} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/string-filter-parts definition filter-clause)))

(defn ^:export numberFilterClause
  "Create a number filter clause from parts.
   Parts: {operator, dimension, values}"
  [parts]
  (lib-metric.filter/number-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export numberFilterParts
  "Extract number filter parts from a clause.
   Returns {operator, dimension, values} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/number-filter-parts definition filter-clause)))

(defn ^:export coordinateFilterClause
  "Create a coordinate filter clause from parts.
   Parts: {operator, dimension, longitudeDimension, values}"
  [parts]
  (lib-metric.filter/coordinate-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export coordinateFilterParts
  "Extract coordinate filter parts from a clause.
   Returns {operator, dimension, longitudeDimension, values} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/coordinate-filter-parts definition filter-clause)))

(defn ^:export booleanFilterClause
  "Create a boolean filter clause from parts.
   Parts: {operator, dimension, values}"
  [parts]
  (lib-metric.filter/boolean-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export booleanFilterParts
  "Extract boolean filter parts from a clause.
   Returns {operator, dimension, values} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/boolean-filter-parts definition filter-clause)))

(defn ^:export specificDateFilterClause
  "Create a specific date filter clause from parts.
   Parts: {operator, dimension, values, hasTime}"
  [parts]
  (lib-metric.filter/specific-date-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export specificDateFilterParts
  "Extract specific date filter parts from a clause.
   Returns {operator, dimension, values, hasTime} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/specific-date-filter-parts definition filter-clause)))

(defn ^:export relativeDateFilterClause
  "Create a relative date filter clause from parts.
   Parts: {dimension, unit, value, offsetUnit, offsetValue, options}"
  [parts]
  (lib-metric.filter/relative-date-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export relativeDateFilterParts
  "Extract relative date filter parts from a clause.
   Returns {dimension, unit, value, offsetUnit, offsetValue, options} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/relative-date-filter-parts definition filter-clause)))

(defn ^:export excludeDateFilterClause
  "Create an exclude date filter clause from parts.
   Parts: {operator, dimension, unit, values}"
  [parts]
  (lib-metric.filter/exclude-date-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export excludeDateFilterParts
  "Extract exclude date filter parts from a clause.
   Returns {operator, dimension, unit, values} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/exclude-date-filter-parts definition filter-clause)))

(defn ^:export timeFilterClause
  "Create a time filter clause from parts.
   Parts: {operator, dimension, values}"
  [parts]
  (lib-metric.filter/time-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export timeFilterParts
  "Extract time filter parts from a clause.
   Returns {operator, dimension, values} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/time-filter-parts definition filter-clause)))

(defn ^:export defaultFilterClause
  "Create a default filter clause from parts.
   Parts: {operator, dimension}"
  [parts]
  (lib-metric.filter/default-filter-clause (filter-parts-js->cljs parts)))

(defn ^:export defaultFilterParts
  "Extract default filter parts from a clause.
   Returns {operator, dimension} or null."
  [definition filter-clause]
  (filter-parts-cljs->js (lib-metric.filter/default-filter-parts definition filter-clause)))

(defn ^:export projectionableDimensions
  "Get dimensions that can be used for projections.
   Returns dimensions with :projection-positions metadata."
  [definition]
  (to-array (lib-metric.projection/projectable-dimensions definition)))

(defn ^:export project
  "Add a projection for a dimension to a metric definition.
   Returns the updated definition with the new projection."
  [definition dimension]
  (lib-metric.projection/project definition dimension))

(defn ^:export projectionDimension
  "Get the dimension metadata for a projection clause.
   Returns the dimension or null if not found."
  [definition projection]
  (lib-metric.projection/projection-dimension definition projection))

(defn ^:export replaceClause
  "Replace a clause in a metric definition.
   Finds the target clause by its :lib/uuid and replaces it with the new clause.
   Returns the definition unchanged if target clause is not found."
  [definition target-clause new-clause]
  (lib-metric.clause/replace-clause definition target-clause new-clause))

(defn ^:export removeClause
  "Remove a clause from a metric definition.
   Finds the clause by its :lib/uuid and removes it from :filters or :projections.
   Returns the definition unchanged if clause is not found."
  [definition clause]
  (lib-metric.clause/remove-clause definition clause))

(defn ^:export swapClauses
  "Swap two clauses in a metric definition.
   Finds both clauses by their :lib/uuid and swaps their positions.
   Works within the same vector (both filters, both projections) or across vectors.
   Returns the definition unchanged if either clause is not found."
  [definition source-clause target-clause]
  (lib-metric.clause/swap-clauses definition source-clause target-clause))

(defn ^:export temporalBucket
  "Get the temporal bucket for a clause or dimension.
   STUB: Returns nil."
  [_clause-or-dimension]
  nil)

(defn ^:export availableTemporalBuckets
  "Get available temporal buckets for a dimension.
   STUB: Returns mock temporal buckets."
  [_definition _dimension]
  (to-array mock-temporal-buckets))

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
  (to-array mock-binning-strategies))

(defn ^:export withBinning
  "Apply a binning strategy to a dimension.
   STUB: Returns the dimension unchanged."
  [dimension _binning-strategy]
  dimension)

(defn ^:export isBoolean
  "Check if dimension is boolean type."
  [dimension]
  (types.isa/boolean? dimension))

(defn ^:export isCoordinate
  "Check if dimension is coordinate type."
  [dimension]
  (types.isa/coordinate? dimension))

(defn ^:export isTemporal
  "Check if dimension is temporal type."
  [dimension]
  (types.isa/temporal? dimension))

(defn ^:export isDateOrDateTime
  "Check if dimension is date or datetime type."
  [dimension]
  (types.isa/date-or-datetime? dimension))

(defn ^:export isForeignKey
  "Check if dimension is a foreign key."
  [dimension]
  (types.isa/foreign-key? dimension))

(defn ^:export isLocation
  "Check if dimension is a location type."
  [dimension]
  (types.isa/location? dimension))

(defn ^:export isLatitude
  "Check if dimension is a latitude."
  [dimension]
  (types.isa/latitude? dimension))

(defn ^:export isLongitude
  "Check if dimension is a longitude."
  [dimension]
  (types.isa/longitude? dimension))

(defn ^:export isNumeric
  "Check if dimension is numeric type."
  [dimension]
  (types.isa/numeric? dimension))

(defn ^:export isPrimaryKey
  "Check if dimension is a primary key."
  [dimension]
  (types.isa/primary-key? dimension))

(defn ^:export isStringLike
  "Check if dimension is string-like type."
  [dimension]
  (types.isa/string-like? dimension))

(defn ^:export isStringOrStringLike
  "Check if dimension is string or string-like type."
  [dimension]
  (types.isa/string-or-string-like? dimension))

(defn ^:export isTime
  "Check if dimension is time type."
  [dimension]
  (types.isa/time? dimension))

(defn ^:export displayInfo
  "Get display info for a displayable item.
   Dispatches on :lib/type to return appropriate display info structure."
  [definition source]
  (display-info->js
   (lib-metric.display-info/display-info definition source)))

(defn ^:export dimensionValuesInfo
  "Get dimension values info.
   STUB: Returns mock info based on dimension."
  [_definition dimension]
  (display-info->js
   {:id                (:id dimension)
    :can-list-values   (= :type/Category (:semantic-type dimension))
    :can-search-values (= :type/Text (:effective-type dimension))
    :can-remap-values  false}))
