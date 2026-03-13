(ns metabase.lib-metric.js
  "JavaScript-facing API for lib-metric functions."
  (:refer-clojure :exclude [filter])
  (:require
   [clojure.string :as str]
   [goog.object :as gobject]
   [metabase.lib-metric.clause :as lib-metric.clause]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.display-info :as lib-metric.display-info]
   [metabase.lib-metric.filter :as lib-metric.filter]
   [metabase.lib-metric.metadata.js :as lib-metric.metadata.js]
   [metabase.lib-metric.projection :as lib-metric.projection]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib-metric.types.isa :as types.isa]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as memoize]
   [metabase.util.number :as u.number]
   [metabase.util.time :as u.time]))

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

(defn- assert-single-source!
  "Throw if expression is not a single leaf."
  [definition]
  (when-not (lib-metric.definition/expression-leaf? (:expression definition))
    (throw (ex-info (str "This function requires a single-source definition. "
                         "Use the multi-arity form with a SourceInstance or source metadata.")
                    {:expression (:expression definition)}))))

(defn- ->source-instance
  "Convert JS array ['metric', {'lib/uuid': '...'}, id] to CLJS vector."
  [js-array]
  (let [tag  (aget js-array 0)
        opts (aget js-array 1)
        id   (aget js-array 2)
        uuid (when opts (gobject/get opts "lib/uuid"))]
    [(keyword tag) {:lib/uuid uuid} id]))

(mu/defn ^:export metadataProvider :- ::lib.schema.metadata/metadata-providerable
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

(mu/defn ^:export metricMetadata :- [:maybe ::lib.schema.metadata/metric]
  "Get metadata for the Metric with `metric-id`.
   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition).
   Returns nil if not found."
  [providerable metric-id]
  (first (lib.metadata.protocols/metadatas
          (->metadata-provider providerable)
          {:lib/type :metadata/metric, :id #{metric-id}})))

(mu/defn ^:export measureMetadata :- [:maybe ::lib.schema.metadata/measure]
  "Get metadata for the Measure with `measure-id`.
   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition).
   Returns nil if not found."
  [providerable measure-id]
  (first (lib.metadata.protocols/metadatas
          (->metadata-provider providerable)
          {:lib/type :metadata/measure, :id #{measure-id}})))

(mu/defn ^:export fromMetricMetadata :- ::lib-metric.schema/metric-definition
  "Create a MetricDefinition from metric metadata.
   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition).
   Returns opaque CLJS data (no conversion needed for TypeScript's opaque type).
   The metricMetadata should already be a CLJS data structure from the provider."
  [providerable metric-metadata]
  (lib-metric.definition/from-metric-metadata (->metadata-provider providerable) metric-metadata))

(mu/defn ^:export fromMeasureMetadata :- ::lib-metric.schema/metric-definition
  "Create a MetricDefinition from measure metadata.
   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition).
   Returns opaque CLJS data (no conversion needed for TypeScript's opaque type).
   The measureMetadata should already be a CLJS data structure from the provider."
  [providerable measure-metadata]
  (lib-metric.definition/from-measure-metadata (->metadata-provider providerable) measure-metadata))

(mu/defn ^:export sourceMetricId :- [:maybe :int]
  "Get the source metric ID from a definition, or null if measure-based."
  [definition]
  (lib-metric.definition/source-metric-id definition))

(mu/defn ^:export sourceMeasureId :- [:maybe :int]
  "Get the source measure ID from a definition, or null if metric-based."
  [definition]
  (lib-metric.definition/source-measure-id definition))

(mu/defn ^:export sourceMeasureTableId :- [:maybe :int]
  "Get the table ID of the source measure, or null if not measure-based."
  [definition]
  (when-let [measure-id (lib-metric.definition/source-measure-id definition)]
    (:table-id (first (lib.metadata.protocols/metadatas
                       (->metadata-provider definition)
                       {:lib/type :metadata/measure, :id #{measure-id}})))))

(mu/defn ^:export sourceInstances :- [:any {:ts/array-of :any}]
  "Get expression leaf instances as JS arrays.
   Returns a JS array of ['metric'|'measure', {'lib/uuid': '...'}, id] arrays."
  [definition]
  (to-array (map (fn [[tag opts id]]
                   #js [(name tag) #js {"lib/uuid" (:lib/uuid opts)} id])
                 (lib-metric.definition/expression-leaves
                  (:expression definition)))))

(mu/defn ^:export filters :- [:any {:ts/array-of ::lib.schema.mbql-clause/clause}]
  "Get the filter clauses from a metric definition.
   1-arity: returns flat MBQL filter clauses (single-source only).
   2-arity: returns filter clauses scoped to a specific source instance."
  ([definition]
   (assert-single-source! definition)
   (to-array (map :filter (lib-metric.definition/filters definition))))
  ([definition source-instance]
   (let [inst (->source-instance source-instance)
         uuid (lib-metric.definition/expression-leaf-uuid inst)]
     (to-array (map :filter (filterv #(= (:lib/uuid %) uuid)
                                     (lib-metric.definition/filters definition)))))))

(mu/defn ^:export projections :- [:any {:ts/array-of ::lib-metric.schema/dimension-reference}]
  "Get the projection clauses from a metric definition.
   1-arity: returns flat dimension-ref projections (single-source only).
   2-arity: returns projections scoped to a specific source metadata."
  ([definition]
   (assert-single-source! definition)
   (to-array (lib-metric.definition/flat-projections
              (lib-metric.definition/projections definition))))
  ([definition source-metadata]
   (let [dims (lib-metric.projection/projectable-dimensions-for-source definition source-metadata)]
     (to-array (filterv :projection-positions dims)))))

(mu/defn ^:export fromJsMetricDefinition :- ::lib-metric.schema/metric-definition
  "Convert a JS metric definition (from JSON) to a MetricDefinition.

   The JS definition should match the format accepted by POST /api/metric/dataset:
   - expression: a metric math expression tree
   - filters (optional, per-instance filters)
   - projections (optional, typed projections)

   Also accepts legacy format with source-metric/source-measure for backwards compat.

   Accepts a MetadataProviderable (either a MetadataProvider or MetricDefinition)."
  [providerable js-definition]
  (let [provider       (->metadata-provider providerable)
        definition     (js->clj js-definition :keywordize-keys true)]
    (if-let [expression (:expression definition)]
      ;; New expression-based format
      (let [norm-expression (lib-metric.schema/normalize-math-expression expression)
            ;; Normalize instance filters
            raw-filters     (or (:filters definition) [])
            norm-filters    (into []
                                  (keep (fn [inst-filter]
                                          (when-let [f (lib-metric.schema/normalize-filter-clause (:filter inst-filter))]
                                            {:lib/uuid (:lib/uuid inst-filter)
                                             :filter   f})))
                                  raw-filters)
            ;; Normalize typed projections
            raw-projections (or (:projections definition) [])
            norm-projections (mapv (fn [tp]
                                     {:type       (keyword (:type tp))
                                      :id         (:id tp)
                                      :projection (into [] (keep lib-metric.schema/normalize-dimension-ref) (:projection tp))})
                                   raw-projections)]
        {:lib/type          :metric/definition
         :expression        norm-expression
         :filters           norm-filters
         :projections       norm-projections
         :metadata-provider provider})
      ;; Legacy format: source-metric/source-measure
      (let [source-metric  (:source-metric definition)
            source-measure (:source-measure definition)
            [leaf-type source-id] (cond
                                    source-metric  [:metric source-metric]
                                    source-measure [:measure source-measure]
                                    :else          (throw (ex-info "Definition must have expression or source-metric/source-measure"
                                                                   {:definition definition})))
            uuid           (str (random-uuid))]
        {:lib/type          :metric/definition
         :expression        [leaf-type {:lib/uuid uuid} source-id]
         :filters           []
         :projections       []
         :metadata-provider provider}))))

(defn- expression->js
  "Convert a CLJS expression tree to JS, preserving namespaced keys like :lib/uuid.
   BigInts are wrapped in [:value opts string] clauses so the QP uses :type/BigInteger
   for parsing rather than the column's own type (which may be :type/Integer)."
  [expr]
  (cond
    (keyword? expr)         (u/qualified-name expr)
    (map? expr)             (let [obj #js {}]
                              (doseq [[k v] expr]
                                (gobject/set obj (u/qualified-name k) (expression->js v)))
                              obj)
    (vector? expr)          (to-array (map expression->js expr))
    (u.number/bigint? expr) (let [opts #js {}]
                              (gobject/set opts "base-type" "type/BigInteger")
                              (gobject/set opts "effective-type" "type/BigInteger")
                              (gobject/set opts "lib/uuid" (str (random-uuid)))
                              (to-array #js ["value" opts (str expr)]))
    :else                   expr))

(defn- instance-filter->js
  "Convert an instance-filter map to JS, preserving :lib/uuid key."
  [{:keys [lib/uuid filter]}]
  (let [obj #js {}]
    (gobject/set obj "lib/uuid" uuid)
    (gobject/set obj "filter" (expression->js filter))
    obj))

(defn- typed-projection->js
  "Convert a typed-projection map to JS."
  [{:keys [type id projection]}]
  (let [obj #js {}]
    (gobject/set obj "type" (name type))
    (gobject/set obj "id" id)
    (gobject/set obj "projection" (to-array (map expression->js projection)))
    obj))

(mu/defn ^:export toJsMetricDefinition :- :map
  "Convert a MetricDefinition to a JS object for JSON serialization.

   Produces format compatible with POST /api/metric/dataset:
   - expression: metric math expression tree
   - filters (array, omitted if empty)
   - projections (array, omitted if empty)"
  [definition]
  (let [expression  (:expression definition)
        filters     (:filters definition)
        projections (:projections definition)
        obj         #js {}]
    (gobject/set obj "expression" (expression->js expression))
    (when (seq filters)
      (gobject/set obj "filters" (to-array (map instance-filter->js filters))))
    (when (seq projections)
      (gobject/set obj "projections" (to-array (map typed-projection->js projections))))
    obj))

(mu/defn ^:export filterableDimensions :- [:any {:ts/array-of ::lib-metric.schema/metadata-dimension}]
  "Get dimensions that can be used for filtering.
   1-arity: returns dimensions for single-source definition.
   2-arity: returns dimensions scoped to a specific source instance."
  ([definition]
   (assert-single-source! definition)
   (to-array (lib-metric.filter/filterable-dimensions definition)))
  ([definition source-instance]
   (to-array (lib-metric.filter/filterable-dimensions-for-instance
              definition (->source-instance source-instance)))))

(mu/defn ^:export filter :- ::lib-metric.schema/metric-definition
  "Add a filter clause to a metric definition.
   2-arity: adds filter to single-source definition.
   3-arity: adds filter scoped to a specific source instance."
  ([definition filter-clause]
   (assert-single-source! definition)
   (lib-metric.filter/add-filter definition filter-clause))
  ([definition filter-clause source-instance]
   (let [inst (->source-instance source-instance)
         uuid (lib-metric.definition/expression-leaf-uuid inst)]
     (lib-metric.filter/add-filter definition filter-clause uuid))))

(mu/defn ^:export filterableDimensionOperators :- [:any {:ts/array-of :string}]
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
      u/lower-case-en
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
      (when (contains? cljs-parts :longitude-dimension)
        (gobject/set result "longitudeDimension" (:longitude-dimension cljs-parts)))
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

(mu/defn ^:export stringFilterClause :- ::lib.schema.mbql-clause/clause
  "Create a string filter clause from parts.
   Parts: {operator, dimension, values, options}"
  [parts :- ::lib-metric.schema/string-filter-parts]
  (lib-metric.filter/string-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export stringFilterParts :- [:maybe ::lib-metric.schema/string-filter-parts]
  "Extract string filter parts from a clause.
   Returns {operator, dimension, values, options} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (filter-parts-cljs->js (lib-metric.filter/string-filter-parts definition filter-clause)))

(mu/defn ^:export numberFilterClause :- ::lib.schema.mbql-clause/clause
  "Create a number filter clause from parts.
   Parts: {operator, dimension, values}"
  [parts :- ::lib-metric.schema/number-filter-parts]
  (lib-metric.filter/number-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export numberFilterParts :- [:maybe ::lib-metric.schema/number-filter-parts]
  "Extract number filter parts from a clause.
   Returns {operator, dimension, values} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (filter-parts-cljs->js (lib-metric.filter/number-filter-parts definition filter-clause)))

(mu/defn ^:export coordinateFilterClause :- ::lib.schema.mbql-clause/clause
  "Create a coordinate filter clause from parts.
   Parts: {operator, dimension, longitudeDimension, values}"
  [parts :- ::lib-metric.schema/coordinate-filter-parts]
  (lib-metric.filter/coordinate-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export coordinateFilterParts :- [:maybe ::lib-metric.schema/coordinate-filter-parts]
  "Extract coordinate filter parts from a clause.
   Returns {operator, dimension, longitudeDimension, values} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (filter-parts-cljs->js (lib-metric.filter/coordinate-filter-parts definition filter-clause)))

(mu/defn ^:export booleanFilterClause :- ::lib.schema.mbql-clause/clause
  "Create a boolean filter clause from parts.
   Parts: {operator, dimension, values}"
  [parts :- ::lib-metric.schema/boolean-filter-parts]
  (lib-metric.filter/boolean-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export booleanFilterParts :- [:maybe ::lib-metric.schema/boolean-filter-parts]
  "Extract boolean filter parts from a clause.
   Returns {operator, dimension, values} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (filter-parts-cljs->js (lib-metric.filter/boolean-filter-parts definition filter-clause)))

(mu/defn ^:export specificDateFilterClause :- ::lib.schema.mbql-clause/clause
  "Create a specific date filter clause from parts.
   Parts: {operator, dimension, values, hasTime}"
  [parts :- ::lib-metric.schema/specific-date-filter-parts]
  (lib-metric.filter/specific-date-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export specificDateFilterParts :- [:maybe ::lib-metric.schema/specific-date-filter-parts]
  "Extract specific date filter parts from a clause.
   Returns {operator, dimension, values, hasTime} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (some-> (lib-metric.filter/specific-date-filter-parts definition filter-clause)
          (update :values (fn [values] (mapv (comp u.time/dayjs-utc->local-date u.time/coerce-to-timestamp) values)))
          filter-parts-cljs->js))

(mu/defn ^:export relativeDateFilterClause :- ::lib.schema.mbql-clause/clause
  "Create a relative date filter clause from parts.
   Parts: {dimension, unit, value, offsetUnit, offsetValue, options}"
  [parts :- ::lib-metric.schema/relative-date-filter-parts]
  (lib-metric.filter/relative-date-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export relativeDateFilterParts :- [:maybe ::lib-metric.schema/relative-date-filter-parts]
  "Extract relative date filter parts from a clause.
   Returns {dimension, unit, value, offsetUnit, offsetValue, options} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (filter-parts-cljs->js (lib-metric.filter/relative-date-filter-parts definition filter-clause)))

(mu/defn ^:export excludeDateFilterClause :- ::lib.schema.mbql-clause/clause
  "Create an exclude date filter clause from parts.
   Parts: {operator, dimension, unit, values}"
  [parts :- ::lib-metric.schema/exclude-date-filter-parts]
  (lib-metric.filter/exclude-date-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export excludeDateFilterParts :- [:maybe ::lib-metric.schema/exclude-date-filter-parts]
  "Extract exclude date filter parts from a clause.
   Returns {operator, dimension, unit, values} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (filter-parts-cljs->js (lib-metric.filter/exclude-date-filter-parts definition filter-clause)))

(mu/defn ^:export timeFilterClause :- ::lib.schema.mbql-clause/clause
  "Create a time filter clause from parts.
   Parts: {operator, dimension, values}"
  [parts :- ::lib-metric.schema/time-filter-parts]
  (lib-metric.filter/time-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export timeFilterParts :- [:maybe ::lib-metric.schema/time-filter-parts]
  "Extract time filter parts from a clause.
   Returns {operator, dimension, values} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (filter-parts-cljs->js (lib-metric.filter/time-filter-parts definition filter-clause)))

(mu/defn ^:export defaultFilterClause :- ::lib.schema.mbql-clause/clause
  "Create a default filter clause from parts.
   Parts: {operator, dimension}"
  [parts :- ::lib-metric.schema/default-filter-parts]
  (lib-metric.filter/default-filter-clause (filter-parts-js->cljs parts)))

(mu/defn ^:export defaultFilterParts :- [:maybe ::lib-metric.schema/default-filter-parts]
  "Extract default filter parts from a clause.
   Returns {operator, dimension} or null."
  [definition :- ::lib-metric.schema/metric-definition
   filter-clause :- ::lib.schema.mbql-clause/clause]
  (filter-parts-cljs->js (lib-metric.filter/default-filter-parts definition filter-clause)))

(mu/defn ^:export projectionableDimensions :- [:any {:ts/array-of ::lib-metric.schema/metadata-dimension}]
  "Get dimensions that can be used for projections.
   1-arity: returns dimensions for single-source definition.
   2-arity: returns dimensions scoped to a specific source metadata."
  ([definition]
   (assert-single-source! definition)
   (to-array (lib-metric.projection/projectable-dimensions definition)))
  ([definition source-metadata]
   (to-array (lib-metric.projection/projectable-dimensions-for-source
              definition source-metadata))))

(mu/defn ^:export defaultBreakoutDimensions :- [:any {:ts/array-of ::lib-metric.schema/metadata-dimension}]
  "Get dimensions corresponding to the source metric's default breakout columns."
  [definition]
  (to-array (lib-metric.projection/default-breakout-dimensions definition)))

(mu/defn ^:export dimensionReference :- ::lib-metric.schema/dimension-reference
  "Convert a DimensionMetadata map to a bare dimension reference [:dimension {} uuid].
   If already a reference, returns it as-is."
  [dimension]
  (lib-metric.dimension/reference dimension))

(mu/defn ^:export project :- ::lib-metric.schema/metric-definition
  "Add a dimension reference projection to a metric definition.
   The dimension-ref must be a dimension reference (from dimensionReference,
   withTemporalBucket, or withBinning).
   2-arity: adds projection to single-source definition.
   3-arity: adds projection scoped to a specific source metadata."
  ([definition dimension-ref]
   (assert-single-source! definition)
   (lib-metric.projection/project definition dimension-ref))
  ([definition dimension source-metadata]
   (lib-metric.projection/project-for-source definition dimension source-metadata)))

(mu/defn ^:export projectionDimension :- [:maybe ::lib-metric.schema/metadata-dimension]
  "Get the dimension metadata for a projection clause.
   Returns the dimension or null if not found."
  [definition projection]
  (lib-metric.projection/projection-dimension definition projection))

(mu/defn ^:export replaceClause :- ::lib-metric.schema/metric-definition
  "Replace a clause in a metric definition.
   Finds the target clause by its :lib/uuid and replaces it with the new clause.
   Returns the definition unchanged if target clause is not found."
  [definition target-clause new-clause]
  (lib-metric.clause/replace-clause definition target-clause new-clause))

(mu/defn ^:export removeClause :- ::lib-metric.schema/metric-definition
  "Remove a clause from a metric definition.
   Finds the clause by its :lib/uuid and removes it from :filters or :projections.
   Returns the definition unchanged if clause is not found."
  [definition clause]
  (lib-metric.clause/remove-clause definition clause))

(mu/defn ^:export swapClauses :- ::lib-metric.schema/metric-definition
  "Swap two clauses in a metric definition.
   Finds both clauses by their :lib/uuid and swaps their positions.
   Works within the same vector (both filters, both projections) or across vectors.
   Returns the definition unchanged if either clause is not found."
  [definition source-clause target-clause]
  (lib-metric.clause/swap-clauses definition source-clause target-clause))

(mu/defn ^:export temporalBucket :- [:maybe ::lib.schema.temporal-bucketing/option]
  "Get the temporal bucket for a projection clause."
  [projection]
  (lib-metric.projection/temporal-bucket projection))

(mu/defn ^:export availableTemporalBuckets :- [:any {:ts/array-of ::lib.schema.temporal-bucketing/option}]
  "Get available temporal buckets for a dimension."
  [definition dimension]
  (to-array (lib-metric.projection/available-temporal-buckets definition dimension)))

(mu/defn ^:export withTemporalBucket :- [:schema {:ts/same-as 0} ::lib-metric.schema/dimension-reference]
  "Apply a temporal bucket to a projection."
  [projection bucket]
  (lib-metric.projection/with-temporal-bucket projection bucket))

(mu/defn ^:export binning :- [:maybe ::lib-metric.schema/binning]
  "Get the binning strategy for a projection clause."
  [projection]
  (lib-metric.projection/binning projection))

(mu/defn ^:export availableBinningStrategies :- [:any {:ts/array-of ::lib-metric.schema/binning-option}]
  "Get available binning strategies for a dimension.
   Returns an empty array if no strategies are available."
  [definition dimension]
  (-> (lib-metric.projection/available-binning-strategies definition dimension)
      (or [])
      to-array))

(mu/defn ^:export withBinning :- [:schema {:ts/same-as 0} ::lib-metric.schema/dimension-reference]
  "Apply a binning strategy to a projection."
  [projection binning-strategy]
  (lib-metric.projection/with-binning projection binning-strategy))

(mu/defn ^:export isBoolean :- :boolean
  "Check if dimension is boolean type."
  [dimension]
  (types.isa/boolean? dimension))

(mu/defn ^:export isCoordinate :- :boolean
  "Check if dimension is coordinate type."
  [dimension]
  (types.isa/coordinate? dimension))

(mu/defn ^:export isTemporal :- :boolean
  "Check if dimension is temporal type."
  [dimension]
  (types.isa/temporal? dimension))

(mu/defn ^:export isDateOrDateTime :- :boolean
  "Check if dimension is date or datetime type."
  [dimension]
  (types.isa/date-or-datetime? dimension))

(mu/defn ^:export isForeignKey :- :boolean
  "Check if dimension is a foreign key."
  [dimension]
  (types.isa/foreign-key? dimension))

(mu/defn ^:export isLocation :- :boolean
  "Check if dimension is a location type."
  [dimension]
  (types.isa/location? dimension))

(mu/defn ^:export isLatitude :- :boolean
  "Check if dimension is a latitude."
  [dimension]
  (types.isa/latitude? dimension))

(mu/defn ^:export isLongitude :- :boolean
  "Check if dimension is a longitude."
  [dimension]
  (types.isa/longitude? dimension))

(mu/defn ^:export isNumeric :- :boolean
  "Check if dimension is numeric type."
  [dimension]
  (types.isa/numeric? dimension))

(mu/defn ^:export isPrimaryKey :- :boolean
  "Check if dimension is a primary key."
  [dimension]
  (types.isa/primary-key? dimension))

(mu/defn ^:export isStringLike :- :boolean
  "Check if dimension is string-like type."
  [dimension]
  (types.isa/string-like? dimension))

(mu/defn ^:export isStringOrStringLike :- :boolean
  "Check if dimension is string or string-like type."
  [dimension]
  (types.isa/string-or-string-like? dimension))

(mu/defn ^:export isTime :- :boolean
  "Check if dimension is time type."
  [dimension]
  (types.isa/time? dimension))

(mu/defn ^:export isCategory :- :boolean
  "Check if dimension is a categorical type."
  [dimension]
  (types.isa/category? dimension))

(mu/defn ^:export isID :- :boolean
  "Check if dimension is an ID (primary key or foreign key)."
  [dimension]
  (types.isa/id? dimension))

(mu/defn ^:export isURL :- :boolean
  "Check if dimension is a URL."
  [dimension]
  (types.isa/URL? dimension))

(mu/defn ^:export isEntityName :- :boolean
  "Check if dimension is an entity name."
  [dimension]
  (types.isa/entity-name? dimension))

(mu/defn ^:export isTitle :- :boolean
  "Check if dimension is a title."
  [dimension]
  (types.isa/title? dimension))

(mu/defn ^:export isState :- :boolean
  "Check if dimension is a state."
  [dimension]
  (types.isa/state? dimension))

(mu/defn ^:export isCountry :- :boolean
  "Check if dimension is a country."
  [dimension]
  (types.isa/country? dimension))

(mu/defn ^:export isCity :- :boolean
  "Check if dimension is a city."
  [dimension]
  (types.isa/city? dimension))

(mu/defn ^:export displayInfo :- [:any {:ts/object-of ::lib-metric.schema/display-info}]
  "Get display info for a displayable item.
   Dispatches on :lib/type to return appropriate display info structure."
  [definition source]
  (display-info->js
   (lib-metric.display-info/display-info definition source)))

(defn- resolve-dimension-field
  "Resolve a dimension to its underlying field metadata via dimension-mapping.
   Returns the field column metadata or nil if resolution fails."
  [metadata-provider dimension]
  (let [mapping  (:dimension-mapping dimension)
        target   (:target mapping)
        table-id (:table-id mapping)
        field-id (lib-metric.dimension/dimension-target->field-id target)]
    (when (and metadata-provider field-id table-id)
      (first (lib.metadata.protocols/metadatas
              metadata-provider
              {:lib/type :metadata/column
               :table-id table-id
               :id       #{field-id}})))))

(mu/defn ^:export dimensionValuesInfo :- [:any {:ts/object-of :map}]
  "Get dimension values info. Prefers has-field-values stored directly on the
   dimension (computed during sync). Falls back to resolving the underlying field
   for backward compatibility with older dimensions that lack the key."
  [definition dimension]
  (let [raw-hfv (:has-field-values dimension)
        dim-hfv (when raw-hfv (keyword raw-hfv))]
    (if dim-hfv
      (display-info->js
       {:id                (:id dimension)
        :can-list-values   (= :list dim-hfv)
        :can-search-values (= :search dim-hfv)
        :can-remap-values  false})
      (let [mp    (:metadata-provider definition)
            field (resolve-dimension-field mp dimension)
            has-fv (when field
                     (lib.field/infer-has-field-values field))
            can-remap (boolean
                       (when field
                         (get-in field [:lib/external-remap :field-id])))]
        (display-info->js
         {:id                (:id dimension)
          :can-list-values   (= :list has-fv)
          :can-search-values (= :search has-fv)
          :can-remap-values  can-remap})))))

(mu/defn ^:export isSameSource :- :boolean
  "Check if two dimensions share at least one common source.
   Returns false if either dimension has no sources."
  [dimension1 dimension2]
  (let [sources1 (:sources dimension1)
        sources2 (:sources dimension2)]
    (boolean
     (when (and (seq sources1) (seq sources2))
       (some (set sources1) sources2)))))
