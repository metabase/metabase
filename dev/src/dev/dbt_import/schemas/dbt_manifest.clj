(ns dev.dbt-import.schemas.dbt-manifest
  "Malli schemas for the parts of a dbt `target/manifest.json` that the dbt → Metabase metric converter reads.

  These describe the *input* contract, not the converter's intermediate representation. They cover manifest schema
  v12 as written by dbt 1.12 and later, and only the keys the converter looks at. Undeclared keys pass through
  untouched. Older dbt releases are not supported: dbt 1.8 to 1.11 also write schema v12 but without the
  `type_params` keys the inline spec added (`fill_nulls_with`, `cumulative_type_params`, …), and v10 and v11 have
  fewer still. [[decode-manifest]] rejects anything but v12 from dbt 1.12+ up front, by `metadata`, rather than
  failing deeper in with a key-by-key explanation.

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
   [metabase.util.malli.registry :as mr]))

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
  [:map
   [:where_sql_template :string]])

(mr/def ::where-filter-intersection
  "A metric or measure `filter`: every clause must hold."
  [:map
   [:where_filters [:sequential ::where-filter]]])

(mr/def ::filter
  "`filter` as it appears on a metric or a metric input measure."
  [:maybe ::where-filter-intersection])

(mr/def ::aggregation-params
  "`measures[].agg_params`, only present for `agg: percentile`."
  [:map
   [:percentile                 {:optional true} [:maybe number?]]
   [:use_discrete_percentile    {:optional true} [:maybe :boolean]]
   [:use_approximate_percentile {:optional true} [:maybe :boolean]]])

(mr/def ::non-additive-dimension
  "`measures[].non_additive_dimension`, for semi-additive measures such as account balances. No Metabase equivalent;
  the parse stage reports a measure that has one."
  [:map
   [:name             :string]
   ;; dbt documents min and max, but its manifest schema types this as the full aggregation enum
   [:window_choice    ::aggregation-type]
   [:window_groupings {:optional true} [:sequential :string]]])

(mr/def ::measure
  "A legacy-spec measure. `expr` is either a bare column name, the literal `1`, or warehouse SQL; `nil` means the
  measure name is the column. Note dbt consumes `create_metric: true` when it generates the manifest: the generated
  metric lands in `metrics` and the measure reads `create_metric: false`, so iterate `metrics`, not measures."
  [:map
   [:name                   :string]
   [:agg                    ::aggregation-type]
   [:label                  [:maybe :string]]
   [:description            [:maybe :string]]
   [:expr                   [:maybe :string]]
   [:create_metric          {:optional true} :boolean]
   [:agg_params             [:maybe ::aggregation-params]]
   [:non_additive_dimension [:maybe ::non-additive-dimension]]
   [:agg_time_dimension     [:maybe :string]]])

(mr/def ::entity
  "A join key. `expr` is the column; `nil` means the entity name is the column. The manifest JSON schema requires only
  `name` and `type`; dbt writes the rest, as `null` when unset, but a hand-written manifest need not."
  [:map
   [:name        :string]
   [:type        ::entity-type]
   [:label       {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:role        {:optional true} [:maybe :string]]
   [:expr        {:optional true} [:maybe :string]]])

(mr/def ::dimension-type-params.validity-params
  "`dimensions[].type_params.validity_params`, marking the start and end columns of a slowly changing dimension's
  validity window. Not read by the converter."
  [:map
   [:is_start :boolean]
   [:is_end   :boolean]])

(mr/def ::dimension-type-params
  "`dimensions[].type_params`, only present for `type: time`."
  [:map
   [:time_granularity ::time-granularity]
   [:validity_params  {:optional true} [:maybe ::dimension-type-params.validity-params]]])

(mr/def ::dimension
  "A categorical or time dimension. `expr` is a column or SQL; `nil` means the dimension name is the column."
  [:map
   [:name         :string]
   [:type         ::dimension-type]
   [:label        [:maybe :string]]
   [:description  [:maybe :string]]
   [:is_partition {:optional true} :boolean]
   [:type_params  [:maybe ::dimension-type-params]]
   [:expr         [:maybe :string]]])

(mr/def ::node-relation
  "The physical table a semantic model is built on, already resolved from `ref()` plus the profile and `+schema` /
  `+alias` configs. This is the source for serdes portable table refs."
  [:map
   [:database      [:maybe :string]]
   [:schema_name   :string]
   [:alias         :string]
   [:relation_name {:optional true} [:maybe :string]]])

(mr/def ::depends-on
  "Resolved lineage. For a simple metric, `nodes` holds its semantic model's unique ID; for a ratio, derived or
  inline-spec cumulative metric, the unique IDs of the metrics it refers to; for a semantic model, the unique ID of the
  model, seed or snapshot node it is built on (the key into `nodes`, which is where column `data_type`s live),
  possibly among other nodes it refers to."
  [:map
   [:nodes  [:sequential :string]]
   [:macros {:optional true} [:sequential :string]]])

(mr/def ::semantic-model.defaults
  [:map
   [:agg_time_dimension [:maybe :string]]])

(mr/def ::node-config
  "The `config` of a semantic model or a metric: only `enabled` is read, and only by dbt itself when it writes the
  manifest."
  [:map
   [:enabled {:optional true} :boolean]])

(mr/def ::semantic-model
  "One entry of the top-level `semantic_models` map. `model` is the raw `ref('x')` string; use `node_relation` and
  `depends_on` instead."
  [:map
   [:unique_id      :string]
   [:name           :string]
   [:label          [:maybe :string]]
   [:description    [:maybe :string]]
   [:model          :string]
   [:node_relation  ::node-relation]
   [:defaults       [:maybe ::semantic-model.defaults]]
   [:primary_entity {:optional true} [:maybe :string]]
   [:entities       [:sequential ::entity]]
   [:dimensions     [:sequential ::dimension]]
   [:measures       [:sequential ::measure]]
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
  [:map
   [:count       nat-int?]
   [:granularity :string]])

(mr/def ::metric-input-measure
  "`type_params.measure` of a simple metric: which measure it aggregates plus per-metric overrides. `filter` and
  `fill_nulls_with` may be set here *or* on the metric itself; honour either."
  [:map
   [:name              :string]
   [:filter            ::filter]
   [:alias             [:maybe :string]]
   [:join_to_timespine {:optional true} :boolean]
   [:fill_nulls_with   [:maybe :int]]])

(mr/def ::metric-input
  "A reference to another metric, used by ratio (`numerator` / `denominator`) and derived (`metrics`) metrics.
  `offset_window` and `offset_to_grain` shift the input in time (a period-over-period or start-of-period comparison),
  which has no Metabase equivalent; the parse stage reports a metric with either."
  [:map
   [:name            :string]
   [:filter          ::filter]
   [:alias           [:maybe :string]]
   [:offset_window   {:optional true} [:maybe ::time-window]]
   [:offset_to_grain {:optional true} [:maybe :string]]])

(mr/def ::metric-aggregation-params
  "`type_params.metric_aggregation_params`. New in dbt 1.12 for the inline (`models:`-nested) spec, where a simple
  metric carries its own aggregation instead of pointing at a measure: the semantic model it aggregates (also in
  `depends_on`), the `agg` and its params, the aggregation time dimension already defaulted from the model, and the
  non-additive dimension. The expression is *not* here but in `type_params.expr`, and `agg_params` is always written,
  with nil `percentile`, for every aggregation, as the `parcel_delivery` fixture, written by dbt 1.12.6, has it. On
  the legacy spec this is `nil`."
  [:map
   [:semantic_model         [:maybe :string]]
   [:agg                    ::aggregation-type]
   [:agg_params             [:maybe ::aggregation-params]]
   [:agg_time_dimension     [:maybe :string]]
   [:non_additive_dimension [:maybe ::non-additive-dimension]]])

(mr/def ::cumulative-type-params
  "`type_params.cumulative_type_params`. On the 1.12 inline spec `metric` is the input metric the running total is
  over, whose aggregation and semantic model the cumulative metric takes. `period_agg` says which value of the running
  total stands for a period when the metric is queried at a grain coarser than its own: the value at the period's
  `first` day (dbt's default), its `last` day, or the `average` over its days. Metabase's running total under a coarser
  breakout is the value at the end of the period, so only `last` converts; the parse stage reports the others, and a
  window or `grain_to_date`, before anything else is read."
  [:map
   [:window        [:maybe ::time-window]]
   [:grain_to_date [:maybe :string]]
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

  `input_measures` is dbt's flattened list of every measure the metric transitively depends on."
  [:map
   [:measure                   [:maybe ::metric-input-measure]]
   [:input_measures            {:optional true} [:sequential ::metric-input-measure]]
   [:numerator                 [:maybe ::metric-input]]
   [:denominator               [:maybe ::metric-input]]
   [:expr                      [:maybe :string]]
   [:window                    [:maybe ::time-window]]
   [:grain_to_date             [:maybe :string]]
   [:metrics                   [:maybe [:sequential ::metric-input]]]
   [:conversion_type_params    [:maybe :map]]
   [:cumulative_type_params    [:maybe ::cumulative-type-params]]
   [:metric_aggregation_params {:optional true} [:maybe ::metric-aggregation-params]]
   [:fill_nulls_with           [:maybe :int]]
   [:join_to_timespine         {:optional true} :boolean]])

(mr/def ::metric
  "One entry of the top-level `metrics` map. `meta` is free-form user metadata; the flexanalytics project puts
  `format` (percent, decimal places) and `synonyms` there."
  [:map
   [:unique_id        :string]
   [:name             :string]
   [:label            [:maybe :string]]
   [:description      [:maybe :string]]
   [:type             ::metric-type]
   [:type_params      ::metric-type-params]
   [:filter           ::filter]
   [:time_granularity {:optional true} [:maybe :string]]
   [:meta             {:optional true} [:maybe :map]]
   [:depends_on       ::depends-on]
   [:config           {:optional true} ::node-config]])

(mr/def ::column
  "One entry of a node's `columns` map. `data_type` comes from the project's `schema.yml` and is often absent, in
  which case base types have to come from Metabase's own synced metadata."
  [:map
   [:name        :string]
   [:description [:maybe :string]]
   [:data_type   [:maybe :string]]])

(mr/def ::node
  "One entry of the top-level `nodes` map. `nodes` mixes models, seeds, snapshots, tests and operations; all of them
  carry these relation fields. A semantic model can be built on a model, a seed or a snapshot."
  [:map
   [:unique_id     :string]
   [:resource_type :keyword]
   [:name          :string]
   [:database      [:maybe :string]]
   [:schema        :string]
   [:alias         :string]
   [:relation_name {:optional true} [:maybe :string]]
   [:description   [:maybe :string]]
   [:columns       [:map-of :string ::column]]])

(def ^:private minimum-dbt-version
  "The oldest dbt release whose manifests the converter accepts, as `[major minor]`. dbt 1.12 is where the inline
  spec and the `type_params` keys that go with it (`fill_nulls_with`, `cumulative_type_params`,
  `metric_aggregation_params`) arrived; the schemas here require them."
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
  [:map
   [:dbt_schema_version ::dbt-schema-version]
   [:dbt_version        ::dbt-version]
   [:project_name       {:optional true} :string]
   [:adapter_type       {:optional true} :string]
   [:generated_at       {:optional true} :string]])

(mr/def ::manifest
  "The subset of `target/manifest.json` the converter reads. Other top-level sections (`macros`, `sources`, `docs`,
  `saved_queries`, …) are present in a real manifest and pass through untouched."
  [:map
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
      (throw (ex-info (str "Unsupported dbt manifest: the converter reads manifests written by dbt 1.12 or later"
                           " (manifest schema v12), this one says dbt " (pr-str (:dbt_version metadata))
                           " and " (pr-str (:dbt_schema_version metadata)))
                      {:dbt-version        (:dbt_version metadata)
                       :dbt-schema-version (:dbt_schema_version metadata)
                       :errors             (me/humanize error)})))
    (if-let [error (mr/explain ::manifest decoded)]
      (throw (ex-info "Invalid dbt manifest" {:errors (me/humanize error)}))
      decoded)))
