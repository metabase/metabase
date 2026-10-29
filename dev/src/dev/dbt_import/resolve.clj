(ns dev.dbt-import.resolve
  "Stage 2 of the converter: bind IR metrics to Lib queries.

  Takes the IR (see [[dev.dbt-import.schemas.ir]]) and a config and, for every metric, builds with Lib the query that
  computes it against the [[dev.dbt-import.metadata]] provider for its database: the source table, one aggregation,
  and a filter per `where_sql_template`; plus a deterministic `entity_id`. For a simple or cumulative metric the
  aggregation is over the measure's `expr` (see [[measure-aggregation]]); for a ratio or derived metric it is
  arithmetic over `[:metric id]` references to the cards its input metrics became, which is why metrics are resolved in
  dependency order (see [[order-metrics]]) and each converted metric is added to the provider as a card. An input used
  with a filter of its own is inlined as the filtered form of its aggregation (see [[filtered-input]]). Metrics that
  cannot be expressed as a single-aggregation Metabase metric are reported in `:unsupported` with a reason instead of
  failing the run (see [[dev.dbt-import.unsupported]]).

  The stage's parts: [[dev.dbt-import.resolve.columns]] binds a metric to its table and columns and makes the context
  the rest works in, [[dev.dbt-import.resolve.filters]] turns filter templates into clauses, and
  [[dev.dbt-import.resolve.dimensions]] builds each metric's curated dimension set. This namespace holds the
  aggregations and puts the metrics together.

  Only knows the IR, not the manifest, so another semantic layer's parser would plug in unchanged."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [dev.dbt-import.metadata :as metadata]
   [dev.dbt-import.resolve.columns :as resolve.columns]
   [dev.dbt-import.resolve.dimensions :as resolve.dimensions]
   [dev.dbt-import.resolve.filters :as resolve.filters]
   [dev.dbt-import.schemas.ir :as schemas.ir]
   [dev.dbt-import.schemas.resolved :as schemas.resolved]
   [dev.dbt-import.sql :as sql]
   [dev.dbt-import.unsupported :as unsupported]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mu/defn entity-id :- ms/NanoIdString
  "A deterministic `entity_id` for the string `s`. Re-running the converter on the same input produces the same IDs,
  so a re-import updates the existing metrics instead of duplicating them."
  [s :- :string]
  ;; generate-nano-id seeds a RNG from a hex string parsed as a long, so hand it 15 hex chars (60 bits) of the hash
  (u/generate-nano-id (subs (codecs/bytes->hex (buddy-hash/sha256 s)) 0 15)))

(mu/defn- metric-entity-id :- ms/NanoIdString
  [{:keys [unique-id]} :- ::schemas.ir/metric]
  (entity-id (str "dbt-import/metric/" unique-id)))

(mu/defn- collection-entity-id :- ms/NanoIdString
  [project :- [:maybe :string]]
  (entity-id (str "dbt-import/collection/" project)))

(mu/defn- measure-expression :- [:maybe ::sql/value]
  "The Lib expression the measure aggregates: nil for a row count (`1`, or `*` under `count`); for `sum_boolean` the
  condition to count rows by, a bare boolean column counting where it is true; otherwise a column or value
  expression. A measure over any other literal has no Metabase equivalent."
  [{:keys [query dialect resolve-column]} :- ::resolve.columns/context
   agg                                    :- :keyword
   expr                                   :- :string]
  (let [{:keys [kind], column-name :name, literal :value} (resolve.columns/parse-expr expr)
        literal-unsupported (fn [literal]
                              (unsupported/throw! "%s over the literal %s has no Metabase equivalent" (name agg) literal))]
    (case kind
      ;; `count(*)`, like `count(1)`, is a row count
      :wildcard (when-not (= agg :count)
                  (unsupported/throw! "%s over * has no Metabase equivalent" (name agg)))
      :literal  (when-not (and (= literal "1") (#{:sum :count} agg))
                  (literal-unsupported literal))
      :column   (let [column (resolve-column column-name)]
                  (if (= agg :sum_boolean)
                    (let [base-type (lib/type-of query column)]
                      ;; a column the project types as anything but boolean cannot be summed as one; an untyped one is trusted
                      (when (and (resolve.columns/known-type? base-type) (not (isa? base-type :type/Boolean)))
                        (unsupported/throw! "sum_boolean over the non-boolean column %s" (pr-str column-name)))
                      (lib/= column true))
                    column))
      :sql      (let [value (if (= agg :sum_boolean)
                              (sql/condition->mbql dialect expr resolve-column)
                              (sql/expression->mbql dialect expr resolve-column))]
                  (if (vector? value)
                    value
                    (literal-unsupported (pr-str value)))))))

(mr/def ::aggregation
  "An aggregation in the form the Lib clauses are built from, see [[canonical-aggregation]]. `agg` is a dbt
  aggregation type, or one of the converter's own: `:row-count` for a `count` or `sum` over no expression,
  `:count-non-null` for a `count` over a column, which SQL skips nulls for, and `:count-where` for a `sum_boolean`,
  whose expression is the condition to count rows by. `percentile` is set for a `:percentile`."
  [:map {:closed true}
   [:agg        [:enum :row-count :count-non-null :count-where
                 :sum :average :min :max :median :count_distinct :percentile]]
   [:expression [:maybe ::sql/value]]
   [:percentile {:optional true} :double]])

(mu/defn- canonical-aggregation :- ::aggregation
  "The aggregation `agg` over `expression` (see [[measure-expression]]) in the form the Lib clauses are built from, so
  that the special cases are decided once and [[aggregation-clause]] and [[filtered-aggregation-clause]] are each a
  flat `case`."
  [{:keys [agg agg-params]} :- ::schemas.ir/aggregation
   expression               :- [:maybe ::sql/value]]
  (cond
    ;; measure-expression gives no expression for a row count only
    (nil? expression)    {:agg :row-count, :expression nil}
    (= agg :count)       {:agg :count-non-null, :expression expression}
    (= agg :sum_boolean) {:agg :count-where, :expression expression}
    ;; dbt takes the percentile as a fraction, which is what Lib takes; the parse stage checked the range
    (= agg :percentile)  {:agg :percentile, :expression expression, :percentile (double (:percentile agg-params))}
    :else                {:agg agg, :expression expression}))

(mu/defn- measure-aggregation :- ::aggregation
  "The aggregation of a simple metric, or of an input to a composed one, over its measure's `expr`, each failure
  saying which `expr`."
  [context                     :- ::resolve.columns/context
   {:keys [agg expr] :as aggregation} :- ::schemas.ir/aggregation]
  (canonical-aggregation aggregation
                         (unsupported/with-reason-prefix (str "expr " (pr-str expr))
                           #(measure-expression context agg expr))))

(mu/defn- aggregation-clause :- ::lib.schema.aggregation/aggregation
  "The Lib aggregation clause for `aggregation` (see [[canonical-aggregation]]). A cumulative metric runs over
  everything up to each row, which Metabase has for a sum and a row count only; a running count of a column, which
  skips nulls, is the running sum of 1 where the column is not null."
  [metric-type                         :- [:enum :simple :cumulative]
   {:keys [agg expression percentile]} :- ::aggregation]
  (if (= metric-type :cumulative)
    (case agg
      :row-count      (lib/cum-count)
      :count-non-null (lib/cum-sum (lib/case [[(lib/not-null expression) 1]] 0))
      :sum            (lib/cum-sum expression)
      (unsupported/throw! "a running %s has no Metabase equivalent: only a running sum or row count does"
                          (if (= agg :count-where) "sum_boolean" (name agg))))
    (case agg
      :row-count      (lib/count)
      :count-non-null (lib/count-where (lib/not-null expression))
      :count-where    (lib/count-where expression)
      :sum            (lib/sum expression)
      :average        (lib/avg expression)
      :min            (lib/min expression)
      :max            (lib/max expression)
      :median         (lib/median expression)
      :count_distinct (lib/distinct expression)
      :percentile     (lib/percentile expression percentile))))

(mu/defn- filtered-aggregation-clause :- ::lib.schema.aggregation/aggregation
  "The Lib clause for `aggregation` over the rows `condition` holds for: `sum-where`, `count-where` or
  `distinct-where`. Only a sum, a count, a distinct count and a `sum_boolean` have a filtered form."
  [{:keys [agg expression]} :- ::aggregation
   condition                :- ::lib.schema.expression/boolean]
  (case agg
    :row-count      (lib/count-where condition)
    :count-non-null (lib/count-where (lib/and condition (lib/not-null expression)))
    :count-where    (lib/count-where (lib/and condition expression))
    :sum            (lib/sum-where expression condition)
    :count_distinct (lib/distinct-where expression condition)
    (unsupported/throw! "a filtered %s has no Metabase equivalent: only sum, count, count_distinct and sum_boolean have a filtered form"
                        (name agg))))

(mu/defn- with-fill-nulls :- ::lib.schema.aggregation/aggregation
  "`clause` taking `fill-nulls-with` where it is null, as `coalesce`; `clause` as it is when there is nothing to fill
  with."
  [clause          :- ::lib.schema.aggregation/aggregation
   fill-nulls-with :- [:maybe :int]]
  (if (some? fill-nulls-with)
    (lib/coalesce clause fill-nulls-with)
    clause))

(mu/defn- resolved-metric :- ::schemas.resolved/metric
  "The resolve stage's output for the metric `ir` of `context`: the query over its table, `aggregation` filtered by
  `filters`; its dimension set and entity_id; and the card added to the provider for it, which later metrics refer to.
  The dimension set comes first, since it can still report the metric (see [[resolve.dimensions/dimension-set]]), and a
  reported metric must leave no card behind for a later metric to refer to."
  [{:keys [provider query model agg-time-dimension] :as context} :- ::resolve.columns/context
   ir                                                            :- ::schemas.ir/metric
   aggregation                                                   :- ::lib.schema.aggregation/aggregation
   filters                                                       :- [:sequential ::lib.schema.expression/boolean]]
  (let [dimensions (resolve.dimensions/dimension-set context)
        query      (reduce lib/filter (lib/aggregate query aggregation) filters)
        entity-id  (metric-entity-id ir)
        card-id    (metadata/add-metric! provider {:name          (:label ir)
                                                   :description   (:description ir)
                                                   :table-id      (get-in query [:stages 0 :source-table])
                                                   :dataset-query query
                                                   :entity-id     entity-id})]
    (merge {:ir                 ir
            :entity-id          entity-id
            :card-id            card-id
            :metadata-provider  provider
            :semantic-model     (:name model)
            :agg-time-dimension agg-time-dimension
            :query              query}
           dimensions)))

(mu/defn- resolve-simple :- ::schemas.resolved/metric
  "Resolve a simple or cumulative metric: one aggregation over its measure's `expr`, filtered by its templates."
  [config          :- ::schemas.resolved/config
   providers       :- [:map-of :string ::lib.schema.metadata/metadata-provider]
   semantic-models :- [:map-of :string ::schemas.ir/semantic-model]
   {:keys [type expr filters semantic-model fill-nulls-with agg-time-dimension] :as ir} :- ::schemas.ir/metric.simple]
  (let [model (get semantic-models semantic-model)]
    (when-not model
      (unsupported/throw! "semantic model %s not found" (pr-str semantic-model)))
    (let [{:keys [query] :as context}             (resolve.columns/metric-context config providers semantic-models model ir agg-time-dimension)
          {:keys [agg expression] :as aggregation} (measure-aggregation context ir)
          filter-clauses                           (resolve.filters/filter-clauses context filters)
          result-type                              (when (and (some? fill-nulls-with) (#{:min :max} agg) expression)
                                                     (lib/type-of query expression))]
      ;; COALESCE(MAX(text), 0) fails in the warehouse; every other aggregation has a numeric result
      (when (and (resolve.columns/known-type? result-type) (not (isa? result-type :type/Number)))
        (unsupported/throw! "fill_nulls_with %s on a non-numeric aggregation: %s of %s, which is %s"
                            fill-nulls-with (name agg) (pr-str expr) result-type))
      (resolved-metric context ir (with-fill-nulls (aggregation-clause type aggregation) fill-nulls-with) filter-clauses))))

(mr/def ::outcomes
  "What the metrics resolved before the one at hand became, by name: `resolved`, or `failed` with the reason, the parse
  stage's reports included. A ratio or derived metric refers to them."
  [:map {:closed true}
   [:resolved [:map-of :string ::schemas.resolved/metric]]
   [:failed   [:map-of :string :string]]])

(mu/defn- metric-inputs :- [:sequential ::schemas.ir/metric-input]
  "The references a metric makes to other metrics; none for a simple or cumulative one."
  [ir :- ::schemas.ir/metric]
  (case (:type ir)
    :ratio   [(:numerator ir) (:denominator ir)]
    :derived (:inputs ir)
    []))

(mu/defn- resolved-input :- ::schemas.resolved/metric
  "What the metric `metric-input` refers to became. [[unsupported/throw!]] when it is not in the manifest, or was not
  converted."
  [{:keys [resolved failed]} :- ::outcomes
   {:keys [metric]}          :- ::schemas.ir/metric-input]
  (or (get resolved metric)
      (if (contains? failed metric)
        (unsupported/throw! "metric %s was not converted: %s" (pr-str metric) (get failed metric))
        (unsupported/throw! "metric %s not found" (pr-str metric)))))

(defn- conjunction
  "`clauses` as one condition: the clause itself when there is one, otherwise their `:and`."
  [clauses]
  (if (next clauses)
    (apply lib/and clauses)
    (first clauses)))

(mu/defn- filtered-input :- ::lib.schema.aggregation/aggregation
  "A reference to `input` that carries a filter of its own, inlined as the filtered form of the input's aggregation over
  its measure (see [[filtered-aggregation-clause]]), with the input metric's own filters and the reference's combined,
  so the metric stays one card. Only a simple metric can be inlined."
  [context                  :- ::resolve.columns/context
   {input-ir :ir}           :- ::schemas.resolved/metric
   {:keys [metric filters]} :- ::schemas.ir/metric-input]
  (let [{:keys [type fill-nulls-with], input-filters :filters} input-ir]
    (when-not (= type :simple)
      (unsupported/throw! "metric %s is a %s metric; only a simple metric can take a filter where it is referred to"
                          (pr-str metric) (name type)))
    (let [aggregation (measure-aggregation context input-ir)
          condition   (conjunction (resolve.filters/filter-clauses context (into (vec input-filters) filters)))]
      (with-fill-nulls (filtered-aggregation-clause aggregation condition) fill-nulls-with))))

(mu/defn- input-leaf :- ::lib.schema.aggregation/aggregation
  "What a reference to another metric becomes in a ratio or derived metric's aggregation: a `[:metric id]` reference
  to the card the input became or, when the reference carries a filter, the input's aggregation inlined (see
  [[filtered-input]])."
  [{:keys [provider] :as context}     :- ::resolve.columns/context
   outcomes                           :- ::outcomes
   {:keys [filters] :as metric-input} :- ::schemas.ir/metric-input]
  (let [input (resolved-input outcomes metric-input)]
    (if (seq filters)
      (filtered-input context input metric-input)
      ;; the ref's effective type is the input card's, which the instance works out itself, and would be `:type/*`
      ;; for a column the project does not type
      (-> (lib/ref (lib.metadata/metric provider (:card-id input)))
          (lib/update-options dissoc :effective-type)))))

(mu/defn- composed-expression :- ::lib.schema.aggregation/aggregation
  "The aggregation of a ratio or derived metric: arithmetic over what its inputs became (see [[input-leaf]]). A derived
  `expr` is SQL whose identifiers are the inputs' aliases, or names."
  [{:keys [dialect] :as context} :- ::resolve.columns/context
   outcomes                      :- ::outcomes
   {:keys [type expr] :as ir}    :- ::schemas.ir/metric]
  (case type
    :ratio
    (lib// (input-leaf context outcomes (:numerator ir))
           (input-leaf context outcomes (:denominator ir)))

    :derived
    (let [by-name (into {} (map (fn [{:keys [alias] :as input}] [(or alias (:metric input)) input])) (:inputs ir))
          value   (sql/expression->mbql dialect expr
                                        (fn [identifier]
                                          (if-let [input (get by-name identifier)]
                                            (input-leaf context outcomes input)
                                            (unsupported/throw! "%s is not one of the metric's inputs (%s)"
                                                                (pr-str identifier) (str/join ", " (map pr-str (keys by-name)))))))]
      (if (vector? value)
        value
        (unsupported/throw! "expr %s is the constant %s, not arithmetic over the inputs" (pr-str expr) (pr-str value))))))

(mu/defn- resolve-composed :- ::schemas.resolved/metric
  "Resolve a ratio or derived metric against what its inputs became (see [[resolved-input]]). Its table, and so its
  dimensions, are its inputs', which must all be on one semantic model; its default dimension is their
  `agg_time_dimension` when they agree on one. Its `fill_nulls_with`, if any, wraps the arithmetic in `coalesce`, as
  on a simple metric."
  [config                                       :- ::schemas.resolved/config
   providers                                    :- [:map-of :string ::lib.schema.metadata/metadata-provider]
   semantic-models                              :- [:map-of :string ::schemas.ir/semantic-model]
   outcomes                                     :- ::outcomes
   {:keys [type expr filters fill-nulls-with] :as ir} :- ::schemas.ir/metric]
  (let [prefix      (case type
                      :ratio   "ratio"
                      :derived (str "expr " (pr-str expr)))
        inputs      (unsupported/with-reason-prefix prefix #(mapv (partial resolved-input outcomes) (metric-inputs ir)))
        model-names (distinct (map :semantic-model inputs))]
    (when (next model-names)
      (unsupported/throw! "inputs are on different semantic models (%s); a metric has one table"
                          (str/join ", " (map #(format "%s on %s" (-> % :ir :name) (:semantic-model %)) inputs))))
    (let [agg-time-dimension (let [candidates (distinct (map :agg-time-dimension inputs))]
                               (when-not (next candidates)
                                 (first candidates)))
          context            (resolve.columns/metric-context config providers semantic-models
                                                     (get semantic-models (first model-names)) ir agg-time-dimension)
          expression         (unsupported/with-reason-prefix prefix #(composed-expression context outcomes ir))]
      (resolved-metric context ir (with-fill-nulls expression fill-nulls-with) (resolve.filters/filter-clauses context filters)))))

(mu/defn resolve-metric :- [:or ::schemas.resolved/metric ::schemas.ir/unsupported]
  "Resolve one IR metric against the IR `semantic-models` (keyed by name), the metadata `providers` (keyed by Metabase
  database name, see [[metadata/providers]]) and `config`, or explain why it cannot be a Metabase metric. `outcomes`
  is what the metrics a ratio or derived metric refers to became (see [[resolve-manifest]]); a simple metric needs
  none.

  A metric the converter does not support is reported with the reason (see [[unsupported/throw!]]). Any other
  exception while resolving a metric is a bug in the converter or an input it did not anticipate; it is logged with
  its stack and reported the same way, so one bad metric does not stop the others from being written."
  ([config          :- ::schemas.resolved/config
    providers       :- [:map-of :string ::lib.schema.metadata/metadata-provider]
    semantic-models :- [:map-of :string ::schemas.ir/semantic-model]
    ir              :- ::schemas.ir/metric]
   (resolve-metric config providers semantic-models {:resolved {}, :failed {}} ir))

  ([config          :- ::schemas.resolved/config
    providers       :- [:map-of :string ::lib.schema.metadata/metadata-provider]
    semantic-models :- [:map-of :string ::schemas.ir/semantic-model]
    outcomes        :- ::outcomes
    {metric-name :name, :keys [unique-id] :as ir} :- ::schemas.ir/metric]
   (try
     (case (:type ir)
       (:simple :cumulative) (resolve-simple config providers semantic-models ir)
       (:ratio :derived)     (resolve-composed config providers semantic-models outcomes ir))
     (catch Exception e
       (if (unsupported/exception? e)
         (unsupported/report metric-name unique-id (ex-message e))
         (do
           (log/errorf e "Error resolving metric %s" (pr-str metric-name))
           (unsupported/report metric-name unique-id
                               (format "error resolving metric (%s): %s" (pr-str (class e)) (ex-message e)))))))))

(mu/defn- order-metrics :- [:map {:closed true}
                            [:ordered [:sequential ::schemas.ir/metric]]
                            [:cyclic  [:sequential ::schemas.ir/metric]]]
  "`metrics` with every ratio or derived metric after the metrics it refers to, otherwise in their order, so the cards
  a metric refers to exist, and are written, before it. A metric that refers to itself, directly or through others,
  can never be placed and is `cyclic`. A reference to a metric that is not in `metrics` holds nothing back; it is
  reported when the metric is resolved."
  [metrics :- [:sequential ::schemas.ir/metric]]
  (let [names (into #{} (map :name) metrics)]
    (loop [remaining metrics, placed #{}, ordered []]
      (let [ready? (fn [metric]
                     (every? #(or (placed %) (not (names %))) (map :metric (metric-inputs metric))))
            ready  (filter ready? remaining)]
        (cond
          (empty? remaining) {:ordered ordered, :cyclic []}
          (empty? ready)     {:ordered ordered, :cyclic (vec remaining)}
          :else              (recur (remove ready? remaining)
                                    (into placed (map :name) ready)
                                    (into ordered ready)))))))

(mu/defn- outcomes :- ::outcomes
  "What the `metrics` resolved and the `unsupported` reported so far are to the next metric, by name."
  [metrics     :- [:sequential ::schemas.resolved/metric]
   unsupported :- [:sequential ::schemas.ir/unsupported]]
  {:resolved (u/index-by (comp :name :ir) metrics)
   :failed   (into {} (map (juxt :name :reason)) unsupported)})

(mu/defn resolve-manifest :- ::schemas.resolved/manifest
  "Resolve every metric in the IR, each after the metrics it refers to. Unsupported metrics from the parse stage are
  carried over, so the result's `:unsupported` is the complete list for the run, and a ratio or derived metric over
  one of them is reported with that metric's reason rather than as referring to a metric that does not exist."
  [config                                                     :- ::schemas.resolved/config
   {:keys [semantic-models metrics unsupported source] :as ir} :- ::schemas.ir/manifest]
  (let [providers                (metadata/providers config ir)
        {:keys [ordered cyclic]} (order-metrics metrics)
        results                  (reduce (fn [{:keys [metrics unsupported] :as results} metric]
                                           (let [result (resolve-metric config providers semantic-models
                                                                        (outcomes metrics unsupported) metric)]
                                             (if (contains? result :reason)
                                               (update results :unsupported conj result)
                                               (update results :metrics conj result))))
                                         {:metrics [], :unsupported (vec unsupported)}
                                         ordered)]
    {:collection  {:name      (:collection-name config "dbt metrics")
                   :entity-id (collection-entity-id (:project source))}
     :metrics     (:metrics results)
     :unsupported (into (:unsupported results)
                        (map (fn [{metric-name :name, :keys [unique-id]}]
                               (unsupported/report metric-name unique-id
                                                   "metric refers to itself, directly or through the metrics it refers to")))
                        cyclic)}))
