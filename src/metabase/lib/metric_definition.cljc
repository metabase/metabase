(ns metabase.lib.metric-definition
  "MetricDefinition - describes a single metric source for the metrics-explorer.

  A MetricDefinition wraps either:
  - A saved metric card (type :metric-card)
  - An ad-hoc metric from a measure (type :measure)

  This provides a uniform interface for building queries from either source.

  MetricDefinition also tracks:
  - projections: dimensions to break out by (become breakouts in the final query)
  - filters: filter clauses to apply

  Use `apply-projection-config` from projection-config namespace to configure these
  based on a ProjectionConfig, or set them directly via `add-projection` and `add-filter`."
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.util.malli :as mu]))

(def ^:private Projection
  "Schema for a projection (column + optional bucket)."
  [:map
   [:column ::lib.schema.metadata/column]
   [:bucket {:optional true} [:maybe ::lib.schema.temporal-bucketing/option]]])

(def ^:private MetricDefinition
  "Schema for a MetricDefinition."
  [:map
   [:lib/type [:= :metric-definition]]
   [:metadata-provider [:maybe ::lib.schema.metadata/metadata-provider]]
   [:source [:maybe [:map
                     [:type [:enum :metric-card :measure]]]]]
   [:projections {:optional true} [:sequential Projection]]
   [:filters {:optional true} [:sequential ::lib.schema/stage.mbql.filter]]])

(mu/defn metric-definition :- MetricDefinition
  "Create an empty MetricDefinition with the given metadata provider."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider]
  {:lib/type :metric-definition
   :metadata-provider metadata-provider
   :source nil
   :projections []
   :filters []})

(mu/defn with-metric-card :- MetricDefinition
  "Set the source to a saved metric card."
  [definition :- MetricDefinition
   card-id    :- ::lib.schema.id/card
   card       :- ::lib.schema.metadata/card]
  (assoc definition :source
         {:type :metric-card
          :card-id card-id
          :card card}))

(mu/defn with-measure :- MetricDefinition
  "Set the source to a measure (ad-hoc metric)."
  [definition :- MetricDefinition
   measure-id :- ::lib.schema.id/measure
   measure    :- ::lib.schema.metadata/measure]
  (assoc definition :source
         {:type :measure
          :measure-id measure-id
          :measure measure}))

(mu/defn metric-definition-source
  "Get the source configuration from a metric definition.
  Returns nil if no source has been set."
  [definition :- MetricDefinition]
  (:source definition))

(mu/defn metric-definition-source-type :- [:maybe [:enum :metric-card :measure]]
  "Get the source type: :metric-card, :measure, or nil if no source set."
  [definition :- MetricDefinition]
  (get-in definition [:source :type]))

(mu/defn metric-definition->base-query :- [:maybe ::lib.schema/query]
  "Build the base query for this metric definition.

  For metric-card: returns the card's query
  For measure: builds a query from the measure's table with the measure as an aggregation"
  [definition :- MetricDefinition]
  (let [provider (:metadata-provider definition)
        source (:source definition)]
    (when source
      (case (:type source)
        :metric-card
        (let [card (:card source)]
          (lib.query/query provider card))

        :measure
        (let [measure (:measure source)
              table-id (:table-id measure)
              table-meta (lib.metadata/table provider table-id)]
          (when table-meta
            (-> (lib.query/query provider table-meta)
                (lib.aggregation/aggregate -1 (lib.ref/ref measure)))))

        nil))))

;;; ------------------------------------------------ Projections ------------------------------------------------

(mu/defn available-dimensions :- [:sequential ::lib.schema.metadata/column]
  "Get columns that can be used for breakouts from this metric definition's base query.
  These are the columns available for projections."
  [definition :- MetricDefinition]
  (if-let [query (metric-definition->base-query definition)]
    (lib.breakout/breakoutable-columns query -1)
    []))

(mu/defn add-projection :- MetricDefinition
  "Add a projection (dimension) to the metric definition.
  The projection is a column with an optional temporal bucket that will become
  a breakout when the query is built.

  Parameters:
  - definition: The MetricDefinition
  - column: The column metadata to project by
  - bucket: Optional temporal bucket to apply (nil for no bucket)"
  [definition :- MetricDefinition
   column     :- ::lib.schema.metadata/column
   bucket     :- [:maybe ::lib.schema.temporal-bucketing/option]]
  (update definition :projections
          (fnil conj [])
          {:column column
           :bucket bucket}))

(mu/defn projections :- [:sequential Projection]
  "Get the current projections from a metric definition."
  [definition :- MetricDefinition]
  (get definition :projections []))

(mu/defn clear-projections :- MetricDefinition
  "Remove all projections from a metric definition."
  [definition :- MetricDefinition]
  (assoc definition :projections []))

;;; ------------------------------------------------ Filters ------------------------------------------------

(mu/defn add-filter :- MetricDefinition
  "Add a filter clause to the metric definition.
  The filter will be applied when the query is built."
  [definition    :- MetricDefinition
   filter-clause :- ::lib.schema/stage.mbql.filter]
  (update definition :filters (fnil conj []) filter-clause))

(mu/defn metric-definition-filters :- [:sequential ::lib.schema/stage.mbql.filter]
  "Get the current filters from a metric definition."
  [definition :- MetricDefinition]
  (get definition :filters []))

(mu/defn clear-filters :- MetricDefinition
  "Remove all filters from a metric definition."
  [definition :- MetricDefinition]
  (assoc definition :filters []))

;;; ------------------------------------------------ Query Building ------------------------------------------------

(defn- apply-projection-to-query
  "Apply a single projection as a breakout to the query."
  [query projection]
  (let [{:keys [column bucket]} projection
        col-with-bucket (if bucket
                          (lib.temporal-bucket/with-temporal-bucket column bucket)
                          column)]
    (lib.breakout/breakout query -1 col-with-bucket)))

(mu/defn metric-definition->query :- [:maybe ::lib.schema/query]
  "Build a complete query from the metric definition.

  This builds the base query and then applies:
  1. All projections as breakouts
  2. All filters

  Returns nil if no source is set."
  [definition :- MetricDefinition]
  (when-let [base-query (metric-definition->base-query definition)]
    (let [with-projections (reduce apply-projection-to-query
                                   base-query
                                   (:projections definition))
          with-filters (reduce (fn [q filter-clause]
                                 (lib.filter/filter q -1 filter-clause))
                               with-projections
                               (:filters definition))]
      with-filters)))
