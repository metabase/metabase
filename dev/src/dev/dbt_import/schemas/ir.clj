(ns dev.dbt-import.schemas.ir
  "The intermediate representation (IR) between parsing a semantic layer and emitting Metabase content.

  Deliberately small and mostly free of dbt vocabulary: a semantic model is a physical table plus the entities,
  dimensions and measures declared on it, and a metric is one aggregation over one semantic model. Another semantic
  layer would need only a new parser into this shape.

  Everything here is still *source* vocabulary: column names, warehouse type strings, SQL fragments. Mapping to
  Metabase base types, portable refs and MBQL happens in the resolve and emit stages."
  (:require
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [metabase.util.malli.registry :as mr]))

(mr/def ::relation
  "The physical table a semantic model is built on."
  [:map
   [:database [:maybe :string]]
   [:schema   :string]
   [:table    :string]])

(mr/def ::column
  "A column of the relation, as the source project documents it. `data-type` is the warehouse type string and may be
  missing when the project does not declare it."
  [:map
   [:name        :string]
   [:data-type   [:maybe :string]]
   [:description [:maybe :string]]])

(mr/def ::entity
  "A join key. `expr` is always set: a bare column name or SQL."
  [:map
   [:name        :string]
   [:type        ::dbt-manifest/entity-type]
   [:expr        :string]
   [:label       [:maybe :string]]
   [:description [:maybe :string]]])

(mr/def ::dimension
  "Something a metric can be grouped by. `expr` is always set. `granularity` is only set for time dimensions."
  [:map
   [:name        :string]
   [:type        ::dbt-manifest/dimension-type]
   [:expr        :string]
   [:granularity [:maybe ::dbt-manifest/time-granularity]]
   [:label       [:maybe :string]]
   [:description [:maybe :string]]])

(mr/def ::aggregation
  "An aggregation function over an expression. `expr` is always set: a bare column name, the literal `1`, or SQL.
  Deciding which of those it is, and whether Metabase can express it, happens at emit time. `agg-time-dimension` is
  already defaulted from the semantic model."
  [:map
   [:agg                    ::dbt-manifest/aggregation-type]
   [:expr                   :string]
   [:agg-params             [:maybe ::dbt-manifest/aggregation-params]]
   [:non-additive-dimension [:maybe ::dbt-manifest/non-additive-dimension]]
   [:agg-time-dimension     [:maybe :string]]])

(mr/def ::measure
  "A named, reusable aggregation declared on a semantic model."
  [:merge
   ::aggregation
   [:map
    [:name        :string]
    [:label       [:maybe :string]]
    [:description [:maybe :string]]]])

(mr/def ::semantic-model
  "One physical table and everything the semantic layer declares on it. `measures` and `columns` are keyed by name.
  `primary-entity` names the entity a filter uses as the prefix of this model's own dimensions
  (`Dimension('<primary-entity>__<dimension>')`); nil when the model declares none."
  [:map
   [:name                       :string]
   [:unique-id                  :string]
   [:label                      [:maybe :string]]
   [:description                [:maybe :string]]
   [:relation                   ::relation]
   [:columns                    [:map-of :string ::column]]
   [:default-agg-time-dimension [:maybe :string]]
   [:primary-entity             [:maybe :string]]
   [:entities                   [:sequential ::entity]]
   [:dimensions                 [:sequential ::dimension]]
   [:measures                   [:map-of :string ::measure]]])

(mr/def ::metric-input
  "A reference from a ratio or derived metric to another metric: by name, with the alias a derived `expr` uses for it
  (nil means its name) and the unrendered filter templates that apply to this use of it only."
  [:map
   [:metric  :string]
   [:alias   [:maybe :string]]
   [:filters [:sequential :string]]])

(mr/def ::metric.common
  "What every metric has. `label` falls back to the name. `filters` holds unrendered filter templates (QRES-3) on the
  metric itself; empty means none."
  [:map
   [:type        [:enum :simple :cumulative :ratio :derived]]
   [:name        :string]
   [:unique-id   :string]
   [:label       :string]
   [:description [:maybe :string]]
   [:filters     [:sequential :string]]
   [:meta        [:maybe :map]]])

(mr/def ::metric.simple
  "A simple metric: one aggregation over one semantic model, flattened so the emitter does not have to chase the
  measure. A cumulative metric is the same with its aggregation running over everything up to each row. `measure`
  names the source measure for reporting, or is nil when the metric carried its own aggregation."
  [:merge
   ::metric.common
   ::aggregation
   [:map
    [:type              [:enum :simple :cumulative]]
    [:semantic-model    :string]
    [:measure           [:maybe :string]]
    [:fill-nulls-with   [:maybe :int]]
    [:join-to-timespine :boolean]]])

(mr/def ::metric.ratio
  "A ratio of two other metrics."
  [:merge
   ::metric.common
   [:map
    [:type        [:= :ratio]]
    [:numerator   ::metric-input]
    [:denominator ::metric-input]]])

(mr/def ::metric.derived
  "Arithmetic, as SQL in `expr`, over other metrics, which `expr` names by their alias or name."
  [:merge
   ::metric.common
   [:map
    [:type   [:= :derived]]
    [:expr   :string]
    [:inputs [:sequential ::metric-input]]]])

(mr/def ::metric
  "A metric of any kind, see `type`."
  [:multi {:dispatch :type}
   [:simple     ::metric.simple]
   [:cumulative ::metric.simple]
   [:ratio      ::metric.ratio]
   [:derived    ::metric.derived]])

(mr/def ::unsupported
  "A metric the parser could not turn into a `::metric`, and why. Reported rather than thrown so one bad metric does
  not fail the whole run."
  [:map
   [:name      :string]
   [:unique-id :string]
   [:reason    :string]])

(mr/def ::manifest.source
  [:map
   [:tool :string]
   [:version [:maybe :string]]
   [:project [:maybe :string]]])

(mr/def ::manifest
  "Everything parsed from one semantic layer. `semantic-models` is keyed by semantic model name; `metrics` is sorted
  by name (the resolve stage puts a metric after the metrics it refers to)."
  [:map
   [:source          ::manifest.source]
   [:semantic-models [:map-of :string ::semantic-model]]
   [:metrics         [:sequential ::metric]]
   [:unsupported     [:sequential ::unsupported]]])
