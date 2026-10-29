(ns metabase-enterprise.semantic-layer-import.dbt.manifest
  "Malli schemas for the parts of a dbt `target/manifest.json` that the dbt → Metabase metric converter reads.

  These describe the *input* contract, not the converter's intermediate representation. They cover manifest schema v12
  as written by dbt 1.12 and later, and only the keys the converter looks at. Undeclared keys pass through untouched,
  which is why every map schema here is marked `::mr/deliberately-open`. A key that may be `null` is optional here too:
  dbt-core writes every key, as `null` when unset, but the published schema requires few of them and another writer (dbt
  Fusion, a hand-written manifest) may leave them out, and the converter reads an absent key as `null`. Older dbt
  releases are not supported: the converter is written against the manifests dbt 1.12 writes, the first release with the
  inline (`models:`-nested) spec and its `metric_aggregation_params` and `cumulative_type_params.metric`; dbt 1.8 to
  1.11 also write schema v12, with some of the same keys (`fill_nulls_with` is from 1.7, `cumulative_type_params` from
  1.9), but they have not been tested, and v10 and v11 have fewer keys still. [[decode-manifest]] rejects anything but
  v12 from dbt 1.12+ up front, by `metadata`, rather than failing deeper in with a key-by-key explanation.

  Decode with [[decode-manifest]], which expects the JSON parsed with *string* keys ([[metabase.util.json/decode]]
  without keywordization). The transformer then:

  * keywordizes the keys of every map that a `:map` schema here reaches, so field access is idiomatic;
  * leaves the keys of `:map-of :string` maps (`nodes`, `semantic_models`, `metrics`, `columns`) as strings, since
    those are dbt unique IDs like `metric.my_project.sales` or column names;
  * turns enum-valued strings such as `agg` and `type` into keywords.

  Maps the schemas do not reach keep their string keys, so anything the converter reads must be declared here. That
  is deliberate: this file doubles as the record of which manifest fields we depend on.

  References:

  * https://schemas.getdbt.com/dbt/manifest/v12.json
  * https://docs.getdbt.com/reference/artifacts/manifest-json
  * dbt-semantic-interfaces, `dbt_semantic_interfaces/implementations/` (the Python dataclasses these mirror)"
  (:require
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::aggregation-type
  "`measures[].agg`. Mirrors `dbt_semantic_interfaces.type_enums.AggregationType`, a closed set the manifest JSON
  schema also fixes. The converter can turn every one of these into an MBQL aggregation."
  [:enum :sum :min :max :count_distinct :sum_boolean :average :percentile :median :count])

(mr/def ::metric-type
  "`metrics[].type`. A closed set in the manifest JSON schema. The converter handles every type but `:conversion`,
  which the parse stage reports."
  [:enum :simple :ratio :cumulative :derived :conversion])

(mr/def ::entity-type
  "`semantic_models[].entities[].type`. A closed set in the manifest JSON schema."
  [:enum :primary :unique :foreign :natural])

(mr/def ::dimension-type
  "`semantic_models[].dimensions[].type`."
  [:enum :categorical :time])

(mr/def ::time-granularity
  "The granularity of a time dimension, `dimensions[].type_params.time_granularity`: a closed set of standard units
  in the manifest JSON schema. Custom granularities from a custom calendar on the time spine never appear here, only
  in the free-form string fields `metrics[].time_granularity`, `MetricTimeWindow.granularity` and `offset_to_grain`."
  [:enum :nanosecond :microsecond :millisecond :second :minute :hour :day :week :month :quarter :year])

(mr/def ::where-filter
  "One filter clause. The template is unrendered Jinja such as `{{ Dimension('order__status') }} = 'Shipped'`."
  [:map {::mr/deliberately-open true}
   [:where_sql_template :string]])

(mr/def ::where-filter-intersection
  "A metric or measure `filter`: every clause must hold."
  [:map {::mr/deliberately-open true}
   [:where_filters [:sequential ::where-filter]]])

(mr/def ::filter
  "`filter` as it appears on a metric or a metric input measure."
  [:maybe ::where-filter-intersection])

(mr/def ::aggregation-params
  "`measures[].agg_params` and `metric_aggregation_params.agg_params`: the parameters of the aggregation, of which only
  `percentile` has any. On the legacy spec dbt writes the map for `agg: percentile` and `null` otherwise; on the 1.12
  inline spec it writes the map for every aggregation, with a `null` `percentile` (see the `parcel_delivery` fixture).
  The converter reads it only for a percentile."
  [:map {::mr/deliberately-open true}
   [:percentile                 {:optional true} [:maybe number?]]
   [:use_discrete_percentile    {:optional true} [:maybe :boolean]]
   [:use_approximate_percentile {:optional true} [:maybe :boolean]]])

(mr/def ::non-additive-dimension
  "`measures[].non_additive_dimension`, for semi-additive measures such as account balances. No Metabase equivalent;
  the parse stage reports a measure that has one."
  [:map {::mr/deliberately-open true}
   [:name             :string]
   ;; dbt documents min and max, but its manifest schema types this as the full aggregation enum; dbt defaults it to
   ;; min when a project leaves it out
   [:window_choice    {:optional true} [:maybe ::aggregation-type]]
   [:window_groupings {:optional true} [:maybe [:sequential :string]]]])

(mr/def ::measure
  "A legacy-spec measure. `expr` is either a bare column name, the literal `1`, or warehouse SQL; `nil` means the
  measure name is the column. Note dbt consumes `create_metric: true` when it generates the manifest: the generated
  metric lands in `metrics` and the measure reads `create_metric: false`, so iterate `metrics`, not measures."
  [:map {::mr/deliberately-open true}
   [:name                   :string]
   [:agg                    ::aggregation-type]
   [:label                  {:optional true} [:maybe :string]]
   [:description            {:optional true} [:maybe :string]]
   [:expr                   {:optional true} [:maybe :string]]
   [:create_metric          {:optional true} :boolean]
   [:agg_params             {:optional true} [:maybe ::aggregation-params]]
   [:non_additive_dimension {:optional true} [:maybe ::non-additive-dimension]]
   [:agg_time_dimension     {:optional true} [:maybe :string]]])

(mr/def ::entity
  "A join key. `expr` is the column; `nil` means the entity name is the column. The manifest JSON schema requires only
  `name` and `type`; dbt writes the rest, as `null` when unset, but a hand-written manifest need not."
  [:map {::mr/deliberately-open true}
   [:name        :string]
   [:type        ::entity-type]
   [:label       {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:role        {:optional true} [:maybe :string]]
   [:expr        {:optional true} [:maybe :string]]])

(mr/def ::dimension-type-params.validity-params
  "`dimensions[].type_params.validity_params`, marking the start and end columns of a slowly changing dimension's
  validity window (dbt's SCD type II support, together with a `natural` entity). Each flag defaults to false when left
  out. Carried into the IR for the resolve stage to report: a dimension set has no notion of a validity window."
  [:map {::mr/deliberately-open true}
   [:is_start {:optional true} [:maybe :boolean]]
   [:is_end   {:optional true} [:maybe :boolean]]])

(mr/def ::dimension-type-params
  "`dimensions[].type_params`, only present for `type: time`."
  [:map {::mr/deliberately-open true}
   [:time_granularity ::time-granularity]
   [:validity_params  {:optional true} [:maybe ::dimension-type-params.validity-params]]])

(mr/def ::dimension
  "A categorical or time dimension. `expr` is a column or SQL; `nil` means the dimension name is the column."
  [:map {::mr/deliberately-open true}
   [:name         :string]
   [:type         ::dimension-type]
   [:label        {:optional true} [:maybe :string]]
   [:description  {:optional true} [:maybe :string]]
   [:is_partition {:optional true} :boolean]
   [:type_params  {:optional true} [:maybe ::dimension-type-params]]
   [:expr         {:optional true} [:maybe :string]]])

(mr/def ::node-relation
  "The physical table a semantic model is built on, already resolved from `ref()` plus the profile and `+schema` /
  `+alias` configs. This is the source for serdes portable table refs. `relation_name` is the relation as dbt renders it
  in SQL, each part quoted the way the adapter quotes it (`\"dbt_bi\".\"public\".\"fact_sales\"` from dbt-postgres,
  which quotes by default; `analytics.dbt_alice.dim_customers` from dbt-snowflake, which does not): the one record of
  which parts the warehouse saw quoted (see [[metabase-enterprise.semantic-layer-import.dbt.parse/quoted-parts]])."
  [:map {::mr/deliberately-open true}
   [:database      {:optional true} [:maybe :string]]
   [:schema_name   :string]
   [:alias         :string]
   [:relation_name {:optional true} [:maybe :string]]])

(mr/def ::depends-on
  "Resolved lineage. For a simple metric, `nodes` holds its semantic model's unique ID; for a ratio, derived or
  inline-spec cumulative metric, the unique IDs of the metrics it refers to; for a semantic model, the unique ID of the
  model, seed or snapshot node it is built on (the key into `nodes`, which is where column `data_type`s live),
  possibly among other nodes it refers to."
  [:map {::mr/deliberately-open true}
   [:nodes  [:sequential :string]]
   [:macros {:optional true} [:sequential :string]]])

(mr/def ::semantic-model.defaults
  "`semantic_models[].defaults`: what a measure of the model takes when it does not say. Only `agg_time_dimension`,
  the time dimension the model's measures aggregate over, which the parse stage copies onto each measure without one."
  [:map {::mr/deliberately-open true}
   [:agg_time_dimension {:optional true} [:maybe :string]]])

(mr/def ::node-config
  "The `config` of a semantic model or a metric: only `enabled` is read, and only by dbt itself when it writes the
  manifest."
  [:map {::mr/deliberately-open true}
   [:enabled {:optional true} :boolean]])

(mr/def ::semantic-model
  "One entry of the top-level `semantic_models` map. `model` is the raw `ref('x')` string; use `node_relation` and
  `depends_on` instead. `node_relation` is the one nullable key that is required here: dbt resolves it from `ref()`
  when it parses the project and fails the parse when it cannot, so a manifest without it is one the converter has no
  table to build on."
  [:map {::mr/deliberately-open true}
   [:unique_id      :string]
   [:name           ms/NonBlankString]
   [:label          {:optional true} [:maybe :string]]
   [:description    {:optional true} [:maybe :string]]
   [:model          :string]
   [:node_relation  ::node-relation]
   [:defaults       {:optional true} [:maybe ::semantic-model.defaults]]
   [:primary_entity {:optional true} [:maybe :string]]
   [:entities       {:optional true} [:maybe [:sequential ::entity]]]
   [:dimensions     {:optional true} [:maybe [:sequential ::dimension]]]
   [:measures       {:optional true} [:maybe [:sequential ::measure]]]
   [:depends_on     ::depends-on]
   [:config         {:optional true} ::node-config]])

(mr/def ::time-window
  "`count` + `granularity`, e.g. `{:count 7 :granularity \"day\"}`. Used by cumulative `window` and derived
  `offset_window`. `granularity` stays a string because custom granularities are allowed here.

  `count` is deliberately not `pos-int?`. dbt parses the window from a string like `\"7 days\"` and only checks that
  the count `isdigit()`, so a manifest can legitimately carry `count: 0`; a schema stricter than dbt's parser would
  fail the whole run at decode time over one metric. The parse stage reads `count` only to name the window in the
  reason it reports a cumulative metric with a window, or an input with an offset, so a window that makes no sense
  fails nothing."
  [:map {::mr/deliberately-open true}
   [:count       nat-int?]
   [:granularity :string]])

(mr/def ::metric-input-measure
  "`type_params.measure` of a simple metric: which measure it aggregates plus per-metric overrides. `filter` and
  `fill_nulls_with` may be set here *or* on the metric itself; honour either."
  [:map {::mr/deliberately-open true}
   [:name              :string]
   [:filter            {:optional true} ::filter]
   [:alias             {:optional true} [:maybe :string]]
   [:join_to_timespine {:optional true} [:maybe :boolean]]
   [:fill_nulls_with   {:optional true} [:maybe :int]]])

(mr/def ::metric-input
  "A reference to another metric, used by ratio (`numerator` / `denominator`) and derived (`metrics`) metrics, and by
  an inline-spec cumulative metric for the metric it runs over (`cumulative_type_params.metric`). `offset_window` and
  `offset_to_grain` shift the input in time (a period-over-period or start-of-period comparison), which has no
  Metabase equivalent; the parse stage reports a metric with either."
  [:map {::mr/deliberately-open true}
   [:name            :string]
   [:filter          {:optional true} ::filter]
   [:alias           {:optional true} [:maybe :string]]
   [:offset_window   {:optional true} [:maybe ::time-window]]
   [:offset_to_grain {:optional true} [:maybe :string]]])

(mr/def ::metric-aggregation-params
  "`type_params.metric_aggregation_params`. New in dbt 1.12 for the inline (`models:`-nested) spec, where a simple
  metric carries its own aggregation instead of pointing at a measure: the semantic model it aggregates (also in
  `depends_on`), the `agg` and its params, the aggregation time dimension already defaulted from the model, and the
  non-additive dimension. dbt 1.12 writes the expression in `type_params.expr`, not here; the published v12 schema
  also allows an `expr` here, which the parse stage reads when `type_params.expr` is nil. `agg_params` is always
  written, with nil `percentile`, for every aggregation, as the `parcel_delivery` fixture, written by dbt 1.12.6, has
  it. On the legacy spec this is `nil`."
  [:map {::mr/deliberately-open true}
   [:semantic_model         {:optional true} [:maybe :string]]
   [:agg                    ::aggregation-type]
   [:agg_params             {:optional true} [:maybe ::aggregation-params]]
   [:agg_time_dimension     {:optional true} [:maybe :string]]
   [:non_additive_dimension {:optional true} [:maybe ::non-additive-dimension]]
   [:expr                   {:optional true} [:maybe :string]]])

(mr/def ::cumulative-type-params
  "`type_params.cumulative_type_params`. On the 1.12 inline spec `metric` is the input metric the running total is
  over, whose aggregation and semantic model the cumulative metric takes. `period_agg` says which value of the running
  total stands for a period when the metric is queried at a grain coarser than its own: the value at the period's
  `first` day (dbt's default), its `last` day, or the `average` over its days. Metabase's running total under a coarser
  breakout is the value at the end of the period, so only `last` converts; the parse stage reports the others, and a
  window or `grain_to_date`, before anything else is read."
  [:map {::mr/deliberately-open true}
   [:window        {:optional true} [:maybe ::time-window]]
   [:grain_to_date {:optional true} [:maybe :string]]
   [:period_agg    {:optional true} [:maybe [:enum :first :last :average]]]
   [:metric        {:optional true} [:maybe ::metric-input]]])

;; TODO (Cam 2026-10-22) -- make this a `:multi` schema with separate schemas based on `:type`
(mr/def ::metric-type-params
  "`metrics[].type_params`. Which keys are populated depends on `type`:

  * simple: `measure` (legacy spec) or `metric_aggregation_params` plus `expr` (1.12 inline spec)
  * ratio: `numerator`, `denominator`
  * derived: `metrics`, `expr`
  * cumulative: `measure` plus `window` / `grain_to_date` (legacy spec), or `cumulative_type_params` with the input
    metric under `metric` (1.12 inline spec, where the metric is also in `depends_on`)
  * conversion: `conversion_type_params` (out of scope, left untyped)

  `input_measures` is dbt's flattened list of every measure the metric transitively depends on. `fill_nulls_with` and
  `join_to_timespine` here are the inline spec's; the legacy spec writes them on `measure`."
  [:map {::mr/deliberately-open true}
   [:measure                   {:optional true} [:maybe ::metric-input-measure]]
   [:input_measures            {:optional true} [:maybe [:sequential ::metric-input-measure]]]
   [:numerator                 {:optional true} [:maybe ::metric-input]]
   [:denominator               {:optional true} [:maybe ::metric-input]]
   [:expr                      {:optional true} [:maybe :string]]
   [:window                    {:optional true} [:maybe ::time-window]]
   [:grain_to_date             {:optional true} [:maybe :string]]
   [:metrics                   {:optional true} [:maybe [:sequential ::metric-input]]]
   [:conversion_type_params    {:optional true} [:maybe :map]]
   [:cumulative_type_params    {:optional true} [:maybe ::cumulative-type-params]]
   [:metric_aggregation_params {:optional true} [:maybe ::metric-aggregation-params]]
   [:fill_nulls_with           {:optional true} [:maybe :int]]
   [:join_to_timespine         {:optional true} [:maybe :boolean]]])

(mr/def ::metric
  "One entry of the top-level `metrics` map. `meta` is free-form user metadata; the flexanalytics project puts
  `format` (percent, decimal places) and `synonyms` there."
  [:map {::mr/deliberately-open true}
   [:unique_id        :string]
   [:name             ms/NonBlankString]
   [:label            {:optional true} [:maybe :string]]
   [:description      {:optional true} [:maybe :string]]
   [:type             ::metric-type]
   [:type_params      ::metric-type-params]
   [:filter           {:optional true} ::filter]
   [:time_granularity {:optional true} [:maybe :string]]
   [:meta             {:optional true} [:maybe :map]]
   [:depends_on       ::depends-on]
   [:config           {:optional true} ::node-config]])

(mr/def ::column
  "One entry of a node's `columns` map. `data_type` comes from the project's `schema.yml` and is often absent, in
  which case base types have to come from Metabase's own synced metadata. `quote` is the column's `quote` config:
  true when dbt writes the column's name in quotes, so the warehouse keeps its spelling; nil or false when it writes
  it bare, which the warehouse may fold (see [[metabase-enterprise.semantic-layer-import.metadata]])."
  [:map {::mr/deliberately-open true}
   [:name        :string]
   [:description {:optional true} [:maybe :string]]
   [:data_type   {:optional true} [:maybe :string]]
   [:quote       {:optional true} [:maybe :boolean]]])

(mr/def ::node
  "One entry of the top-level `nodes` map. `nodes` mixes models, seeds, snapshots, tests and operations; all of them
  carry these relation fields. A semantic model can be built on a model, a seed or a snapshot."
  [:map {::mr/deliberately-open true}
   [:unique_id     :string]
   [:resource_type :keyword]
   [:name          :string]
   [:database      {:optional true} [:maybe :string]]
   [:schema        ms/NonBlankString]
   [:alias         ms/NonBlankString]
   [:relation_name {:optional true} [:maybe :string]]
   [:description   {:optional true} [:maybe :string]]
   [:columns       {:optional true} [:maybe [:map-of :string ::column]]]])

(def ^:private minimum-dbt-version
  "The oldest dbt release whose manifests the converter accepts, as `[major minor]`. dbt 1.12 is where the inline
  (`models:`-nested) spec arrived, with `metric_aggregation_params` and `cumulative_type_params.metric`, and it is the
  release the converter is written and tested against; the two fixtures are its manifests. Older releases write
  manifests the schemas here would mostly accept (`fill_nulls_with` dates from dbt 1.7 and `cumulative_type_params`
  from 1.9), but nothing has checked what they write, so they are refused rather than guessed at."
  [1 12])

(mu/defn- supported-dbt-version? :- :boolean
  "Whether `dbt_version`, a string like `1.12.6` or `1.13.0-b2`, is [[minimum-dbt-version]] or later."
  [dbt-version :- :string]
  (boolean (when-let [[_ major minor] (re-find #"^(\d+)\.(\d+)" dbt-version)]
             (not (neg? (compare [(parse-long major) (parse-long minor)] minimum-dbt-version))))))

(mr/def ::dbt-version
  "`metadata.dbt_version`: the release of dbt that wrote the manifest. Must be [[minimum-dbt-version]] or later."
  [:and
   :string
   [:fn {:error/message "only manifests written by dbt 1.12 or later are supported"} supported-dbt-version?]])

(mr/def ::dbt-schema-version
  "`metadata.dbt_schema_version`: the URL of the manifest JSON schema. Only v12, the version dbt 1.12+ writes, is
  supported."
  [:re {:error/message "only manifest schema v12 is supported"}
   #"^https://schemas\.getdbt\.com/dbt/manifest/v12\.json$"])

(mr/def ::metadata
  "`metadata`. The two version fields are what [[decode-manifest]] checks first, so that an old manifest is rejected
  with a message about its version rather than about the `type_params` keys it lacks."
  [:map {::mr/deliberately-open true}
   [:dbt_schema_version ::dbt-schema-version]
   [:dbt_version        ::dbt-version]
   [:project_name       {:optional true} :string]
   [:adapter_type       {:optional true} :string]
   [:generated_at       {:optional true} :string]])

(mr/def ::manifest
  "The subset of `target/manifest.json` the converter reads. Other top-level sections (`macros`, `sources`, `docs`,
  `saved_queries`, …) are present in a real manifest and pass through untouched."
  [:map {::mr/deliberately-open true}
   [:metadata        ::metadata]
   [:nodes           [:map-of :string ::node]]
   [:semantic_models [:map-of :string ::semantic-model]]
   [:metrics         [:map-of :string ::metric]]])

(def ^:private transformer
  (mtx/transformer
   (mtx/key-transformer {:decode keyword})
   mtx/json-transformer))

(mr/def ::json
  "A manifest as parsed from JSON with string keys, before decoding: any shape, which decoding checks."
  [:map-of {::mr/deliberately-open true, :description "the raw JSON of a manifest, of any shape"} :string :any])

(mu/defn decode-manifest :- ::manifest
  "Decode a manifest parsed from JSON *with string keys* into the shape described by `::manifest`, and validate it.
  Throws `Unsupported dbt manifest` when `metadata` says it was written by a dbt release before 1.12 or on a manifest
  schema other than v12, and `Invalid dbt manifest` with the humanized explanation when anything else does not match,
  e.g. an unknown `agg`.

    (decode-manifest (with-open [r (io/reader \"target/manifest.json\")]
                       (json/decode r)))"
  [manifest :- ::json]
  ;; the decoder is cached under a namespaced key and rebuilt only when a schema is defined again with [[mr/def]]
  (let [decoder  (mr/cached ::decoder ::manifest (fn [] (mc/decoder ::manifest transformer)))
        decoded  (decoder manifest)
        metadata (:metadata decoded)]
    (when-let [error (when (map? metadata) (mr/explain ::metadata metadata))]
      (throw (ex-info (format (str "Unsupported dbt manifest: the converter reads manifests written by dbt 1.12 or"
                                   " later (manifest schema v12), this one says dbt %s and %s")
                              (pr-str (:dbt_version metadata)) (pr-str (:dbt_schema_version metadata)))
                      {:dbt-version        (:dbt_version metadata)
                       :dbt-schema-version (:dbt_schema_version metadata)
                       :errors             (me/humanize error)})))
    (if-let [error (mr/explain ::manifest decoded)]
      (throw (ex-info "Invalid dbt manifest" {:errors (me/humanize error)}))
      decoded)))
