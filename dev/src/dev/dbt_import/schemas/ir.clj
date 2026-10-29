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
  [:map {:closed true}
   [:database [:maybe :string]]
   [:schema   :string]
   [:table    :string]])

(mr/def ::column
  "A column of the relation, as the source project documents it. `data-type` is the warehouse type string and may be
  missing when the project does not declare it."
  [:map {:closed true}
   [:name        :string]
   [:data-type   [:maybe :string]]
   [:description [:maybe :string]]])

(mr/def ::entity
  "A join key. `expr` is always set: a bare column name or SQL. `type` is dbt's: `primary`, `unique` or `foreign`, or
  `natural`, the key of a slowly changing dimension whose rows are versions of one thing, told apart by the validity
  window of a time dimension with `validity-params` (see `::dimension`)."
  [:map {:closed true}
   [:name        :string]
   [:type        ::dbt-manifest/entity-type]
   [:expr        :string]
   [:label       [:maybe :string]]
   [:description [:maybe :string]]])

(mr/def ::validity-params
  "The flags of a time dimension that bounds a slowly changing dimension's validity window: whether it is the window's
  start or its end (dbt's `validity_params`)."
  [:map {:closed true}
   [:is-start :boolean]
   [:is-end   :boolean]])

(mr/def ::dimension
  "Something a metric can be grouped by. `expr` is always set. `granularity` is only set for time dimensions, and
  `validity-params` only for a time dimension that bounds a validity window (see `::entity`)."
  [:map {:closed true}
   [:name            :string]
   [:type            ::dbt-manifest/dimension-type]
   [:expr            :string]
   [:granularity     [:maybe ::dbt-manifest/time-granularity]]
   [:validity-params [:maybe ::validity-params]]
   [:label           [:maybe :string]]
   [:description     [:maybe :string]]])

(mr/def ::aggregation
  "An aggregation function over an expression. `expr` is always set: a bare column name, the literal `1`, or SQL.
  Deciding which of those it is, and whether Metabase can express it, happens in the resolve stage.
  `agg-time-dimension` is already defaulted from the semantic model."
  [:map {:closed true}
   [:agg                    ::dbt-manifest/aggregation-type]
   [:expr                   :string]
   [:agg-params             [:maybe ::dbt-manifest/aggregation-params]]
   [:non-additive-dimension [:maybe ::dbt-manifest/non-additive-dimension]]
   [:agg-time-dimension     [:maybe :string]]])

(mr/def ::measure
  "A named, reusable aggregation declared on a semantic model."
  [:merge
   ::aggregation
   [:map {:closed true}
    [:name        :string]
    [:label       [:maybe :string]]
    [:description [:maybe :string]]]])

(mr/def ::semantic-model
  "One physical table and everything the semantic layer declares on it. `measures` and `columns` are keyed by name.
  `primary-entity` names the entity a filter uses as the prefix of this model's own dimensions
  (`Dimension('<primary-entity>__<dimension>')`); nil when the model declares none."
  [:map {:closed true}
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
  [:map {:closed true}
   [:metric  :string]
   [:alias   [:maybe :string]]
   [:filters [:sequential :string]]])

(mr/def ::metric.common
  "What every metric has. `label` falls back to the name. `filters` holds unrendered filter templates on the metric
  itself; empty means none. `fill-nulls-with` is the value the metric takes where its aggregation is null, on a simple
  metric from the metric or its input measure, on any other kind from the metric. `time-granularity` is the coarsest
  grain the metric is meant to be queried at, a dbt granularity name (standard or from a custom calendar); nil means
  its time dimension's own. `meta` is the project's free-form metadata, carried for a later mapping and not written
  anywhere."
  [:map {:closed true}
   [:type             [:enum :simple :cumulative :ratio :derived]]
   [:name             :string]
   [:unique-id        :string]
   [:label            :string]
   [:description      [:maybe :string]]
   [:filters          [:sequential :string]]
   [:fill-nulls-with  [:maybe :int]]
   [:time-granularity [:maybe :string]]
   [:meta             [:maybe :map]]])

(mr/def ::metric.simple
  "A simple metric: one aggregation over one semantic model, flattened so the resolve stage does not have to chase
  the measure. A cumulative metric is the same with its aggregation running over everything up to each row. `measure`
  names the source measure for reporting, or is nil when the metric carried its own aggregation."
  [:merge
   ::metric.common
   ::aggregation
   [:map {:closed true}
    [:type              [:enum :simple :cumulative]]
    [:semantic-model    :string]
    [:measure           [:maybe :string]]
    [:join-to-timespine :boolean]]])

(mr/def ::metric.ratio
  "A ratio of two other metrics."
  [:merge
   ::metric.common
   [:map {:closed true}
    [:type        [:= :ratio]]
    [:numerator   ::metric-input]
    [:denominator ::metric-input]]])

(mr/def ::metric.derived
  "Arithmetic, as SQL in `expr`, over other metrics, which `expr` names by their alias or name."
  [:merge
   ::metric.common
   [:map {:closed true}
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
  "A metric a stage could not convert, and why: at parse time one that could not become a `::metric` (or, rarely, a
  semantic model that could not be parsed), at resolve time one that has no Metabase equivalent. Reported rather than
  thrown so one bad metric does not fail the whole run. `error?` marks an entry that is not a case the converter chose
  not to convert but an exception it did not anticipate, a bug or an input outside what it reads; absent means a
  reported case."
  [:map {:closed true}
   [:name      :string]
   [:unique-id :string]
   [:reason    :string]
   [:error?    {:optional true} :boolean]])

(mr/def ::manifest.source
  "Where a manifest came from: the semantic layer `tool` (`\"dbt\"`), its version and the project's name, as the
  tool records them; nil where it does not."
  [:map {:closed true}
   [:tool :string]
   [:version [:maybe :string]]
   [:project [:maybe :string]]])

(mr/def ::manifest
  "Everything parsed from one semantic layer. `semantic-models` is keyed by semantic model name; `metrics` is sorted
  by name (the resolve stage puts a metric after the metrics it refers to). `adapter-type` is the warehouse the
  semantic layer was written for, as the tool names it (dbt's `metadata.adapter_type`: `postgres`, `bigquery`, …), nil
  when it does not say; it is the manifest's say on which Metabase driver the config should name."
  [:map {:closed true}
   [:source          ::manifest.source]
   [:adapter-type    [:maybe :string]]
   [:semantic-models [:map-of :string ::semantic-model]]
   [:metrics         [:sequential ::metric]]
   [:unsupported     [:sequential ::unsupported]]])
