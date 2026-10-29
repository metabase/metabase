(ns dev.dbt-import.resolve
  "Stage 2 of the converter: bind IR metrics to Lib queries.

  Takes the IR (see [[dev.dbt-import.schemas.ir]]) and a config and, for every metric, builds with Lib the query that
  computes it against the [[dev.dbt-import.metadata]] provider for its database: the source table, one aggregation,
  and a filter per `where_sql_template`; plus a deterministic `entity_id` (see [[dev.dbt-import.ids]]). For a simple
  or cumulative metric the aggregation is over the measure's `expr` (see [[canonical-measure-aggregation]]); for a
  ratio or derived metric it is
  arithmetic over `[:metric id]` references to the cards its input metrics became, which is why metrics are resolved in
  dependency order (see [[order-metrics]]) and each converted metric is added to the provider as a card. An input used
  with a filter of its own is inlined as the filtered form of its aggregation (see [[filtered-input]]). Metrics that
  cannot be expressed as a single-aggregation Metabase metric are reported in `:unsupported` with a reason instead of
  failing the run (see [[dev.dbt-import.unsupported]]); a metric the converter itself fails on is listed in `:errors`.
  A converted metric carries `notes` on where it agrees with dbt only under some conditions (see [[notes]]).

  The stage's parts: [[dev.dbt-import.resolve.columns]] binds a metric to its table and columns and makes the run's
  env and each metric's context the rest works in (see [[resolve.columns/env]] and [[resolve.columns/metric-context]]),
  [[dev.dbt-import.resolve.filters]] turns filter templates into clauses, and [[dev.dbt-import.resolve.dimensions]]
  builds each metric's curated dimension set. This namespace holds the aggregations and puts the metrics together.

  Only knows the IR, not the manifest, so another semantic layer's parser would plug in unchanged."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [dev.dbt-import.ids :as ids]
   [dev.dbt-import.metadata :as metadata]
   [dev.dbt-import.resolve.columns :as resolve.columns]
   [dev.dbt-import.resolve.dimensions :as resolve.dimensions]
   [dev.dbt-import.resolve.filters :as resolve.filters]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.schemas.resolved :as resolved]
   [dev.dbt-import.sql :as sql]
   [dev.dbt-import.unsupported :as unsupported]
   [medley.core :as m]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.util :as lib.util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mu/defn- measure-expression :- [:maybe ::sql/value]
  "The Lib expression the measure aggregates: nil for a row count (`1`, or `*` under `count`); for `sum_boolean` the
  condition to count rows by, a bare boolean column counting where it is true; otherwise a column or value
  expression. A measure over any other literal has no Metabase equivalent."
  [{:keys [env query resolve-column]} :- ::resolve.columns/context
   agg                                :- :keyword
   expr                               :- :string]
  (let [{:keys [kind], column-name :name, literal :value} (resolve.columns/parse-expr expr)
        literal-unsupported (fn [literal]
                              (unsupported/throw! "%s over the literal %s has no Metabase equivalent"
                                                  (name agg) literal))]
    (case kind
      ;; `count(*)`, like `count(1)`, is a row count
      :wildcard (when-not (= agg :count)
                  (unsupported/throw! "%s over * has no Metabase equivalent" (name agg)))
      :literal  (when-not (and (= literal "1") (#{:sum :count} agg))
                  (literal-unsupported literal))
      :column   (let [column (resolve-column column-name)]
                  (if (= agg :sum_boolean)
                    (let [base-type (lib/type-of query column)]
                      ;; a column the project types as anything but boolean cannot be summed as one; an untyped one is
                      ;; trusted
                      (when (and (resolve.columns/known-type? base-type) (not (isa? base-type :type/Boolean)))
                        (unsupported/throw! "sum_boolean over the non-boolean column %s" (pr-str column-name)))
                      (lib/= column true))
                    column))
      :sql      (let [value (if (= agg :sum_boolean)
                              (sql/condition->mbql (:dialect env) expr resolve-column)
                              (sql/expression->mbql (:dialect env) expr resolve-column))]
                  (if (lib/clause? value)
                    value
                    (literal-unsupported (pr-str value)))))))

(mr/def ::canonical-aggregation
  "An aggregation in the form the Lib clauses are built from, see [[canonical-aggregation]]. `agg` is a dbt
  aggregation type, or one of the converter's own: `:row-count` for a `count` or `sum` over no expression,
  `:count-non-null` for a `count` over a column, which SQL skips nulls for, and `:count-where` for a `sum_boolean`,
  whose expression is the condition to count rows by. `percentile` is set for a `:percentile`."
  [:map {:closed true}
   [:agg        [:enum :row-count :count-non-null :count-where
                 :sum :average :min :max :median :count_distinct :percentile]]
   [:expression [:maybe ::sql/value]]
   [:percentile {:optional true} :double]])

(mu/defn- canonical-aggregation :- ::canonical-aggregation
  "The aggregation of the simple metric `ir` over `expression` (see [[measure-expression]]) in the form the Lib
  clauses are built from, so that the special cases are decided once and [[aggregation-clause]] and
  [[filtered-aggregation-clause]] are each a flat `case`."
  [{:keys [agg agg-params]} :- ::ir/metric.simple
   expression               :- [:maybe ::sql/value]]
  (cond
    ;; measure-expression gives no expression for a row count only
    (nil? expression)    {:agg :row-count, :expression nil}
    (= agg :count)       {:agg :count-non-null, :expression expression}
    (= agg :sum_boolean) {:agg :count-where, :expression expression}
    ;; dbt takes the percentile as a fraction, which is what Lib takes; the parse stage checked the range
    (= agg :percentile)  {:agg :percentile, :expression expression, :percentile (double (:percentile agg-params))}
    :else                {:agg agg, :expression expression}))

(mu/defn- expr-prefix :- :string
  "The reason prefix for a measure's or a derived metric's `expr`, so the reason says which SQL it is about."
  [expr :- :string]
  (str "expr " (pr-str expr)))

(mu/defn- canonical-measure-aggregation :- ::canonical-aggregation
  "The [[canonical-aggregation]] of the simple metric `ir`, or of a simple input to a composed one, over its measure's
  `expr` (see [[measure-expression]]), each failure saying which `expr`."
  [context                   :- ::resolve.columns/context
   {:keys [agg expr] :as ir} :- ::ir/metric.simple]
  (canonical-aggregation ir
                         (unsupported/with-reason-prefix (expr-prefix expr)
                           #(measure-expression context agg expr))))

(mu/defn- aggregation-clause :- ::lib.schema.aggregation/aggregation
  "The Lib aggregation clause for `aggregation` (see [[canonical-aggregation]]). A cumulative metric runs over
  everything up to each row, which Metabase has for a sum and a row count only; a running count of a column, which
  skips nulls, is the running sum of 1 where the column is not null."
  [metric-type                         :- [:enum :simple :cumulative]
   {:keys [agg expression percentile]} :- ::canonical-aggregation]
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
  "The Lib clause for `aggregation` over the rows `condition` holds for. A count is `count-where` and a distinct count
  `distinct-where`; every other aggregation is over a `case` that is its expression where the condition holds and
  null elsewhere, which the aggregation skips. That is how the query processor splices a filtered metric into a
  query, and it gives null, as MetricFlow does, for a group no row of which passes the condition, where `sum-where`
  would give 0. A count gives 0 for such a group either way, as it does for a filter on the metric itself."
  [{:keys [agg expression percentile]} :- ::canonical-aggregation
   condition                           :- ::lib.schema.expression/boolean]
  (let [filtered (delay (lib/case [[condition expression]]))]
    (case agg
      :row-count      (lib/count-where condition)
      :count-non-null (lib/count-where (lib/and condition (lib/not-null expression)))
      :count-where    (lib/count-where (lib/and condition expression))
      :count_distinct (lib/distinct-where expression condition)
      :sum            (lib/sum @filtered)
      :average        (lib/avg @filtered)
      :min            (lib/min @filtered)
      :max            (lib/max @filtered)
      :median         (lib/median @filtered)
      :percentile     (lib/percentile @filtered percentile))))

(mu/defn- with-fill-nulls :- ::lib.schema.aggregation/aggregation
  "`clause` taking `fill-nulls-with` where it is null, as `coalesce`; `clause` as it is when there is nothing to fill
  with."
  [clause          :- ::lib.schema.aggregation/aggregation
   fill-nulls-with :- [:maybe :int]]
  (if (some? fill-nulls-with)
    (lib/coalesce clause fill-nulls-with)
    clause))

(mu/defn- clauses :- [:sequential ::lib.schema.mbql-clause/clause]
  "Every MBQL clause in `query`, the ones nested inside others included: the aggregation and its arguments down to the
  field refs, the filters, and whatever else a stage holds."
  [query :- ::lib.schema/query]
  (filter lib.util/clause? (tree-seq coll? seq (:stages query))))

(def ^:private clause-features
  "The driver feature a clause needs, for the clauses the converter emits that some driver lacks: a median or
  percentile on MySQL, SQLite, H2 or Vertica, a regex on SQL Server or SQLite, a cast to an integer on H2. The
  query processor checks only a few of these before it compiles, so a metric using one would import and fail when it
  is queried; see [[check-features!]]."
  {:median            :percentile-aggregations
   :percentile        :percentile-aggregations
   :stddev            :standard-deviation-aggregations
   :var               :standard-deviation-aggregations
   :cum-sum           :window-functions/cumulative
   :cum-count         :window-functions/cumulative
   :distinct-where    :distinct-where
   :regex-match-first :regex
   :now               :now
   :today             :expressions/today
   :integer           :expressions/integer
   :float             :expressions/float
   :text              :expressions/text
   :date              :expressions/date
   :datetime          :expressions/datetime
   :get-year          :temporal-extract
   :get-quarter       :temporal-extract
   :get-month         :temporal-extract
   :get-day           :temporal-extract
   :get-hour          :temporal-extract
   :get-minute        :temporal-extract
   :get-second        :temporal-extract})

(mu/defn- check-features! :- :nil
  "[[unsupported/throw!]] when a clause of `query` needs a driver feature the config's driver lacks (see
  [[clause-features]] and [[metadata/driver-features]]), naming the clause and the feature."
  [query :- ::lib.schema/query]
  (doseq [clause (clauses query)
          :let   [feature (clause-features (first clause))]
          :when  (and feature (not (lib.metadata/database-supports? query feature)))]
    (unsupported/throw! "the %s driver does not support the %s clause, which the metric needs (feature %s)"
                        (name (:engine (lib.metadata/database query))) (name (first clause)) feature)))

(def ^:private week-note
  (str "a week grain is read as a Metabase week, which starts on the day the instance's start-of-week setting names;"
       " dbt weeks start on Monday, so the metric agrees with dbt only on an instance set to Monday"))

(def ^:private cumulative-note
  (str "a cumulative metric is a running total over whatever it is broken out by: it agrees with dbt with its"
       " agg_time_dimension as the finest breakout, and is a running total across the categories under any other"))

(mu/defn notes :- [:sequential :string]
  "What a user of the metric `query` computes should know that the query does not say: where it agrees with dbt only
  under some conditions. Read off the finished query, so that every way of building one is covered: a running
  aggregation, from a cumulative metric, is right only under its time dimension (see [[cumulative-note]]); a week
  bucket anywhere, from a `TimeDimension` grain or a `date_trunc`, in a filter or an expression, starts the week on
  the instance's first day of the week, not dbt's Monday (see [[week-note]])."
  [query :- ::lib.schema/query]
  (let [all-clauses (clauses query)]
    (cond-> []
      (some #(lib.util/clause-of-type? % #{:cum-sum :cum-count}) all-clauses) (conj cumulative-note)
      (some #(= :week (:temporal-unit (lib.options/options %))) all-clauses)   (conj week-note))))

(mu/defn- without-ref-types :- [:or ::lib.schema/query [:sequential ::lib-metric.schema/dimension-mapping]]
  "`x`, a query or a metric's dimension mappings, with the `:base-type` and `:effective-type` taken off every `:field`
  ref in it. The types are what the converter knew the column as, from the project's `data_type` or `:type/*` when
  it declares none; Lib reads a ref's options over the Field's own metadata, so a ref that carried them would override
  what the instance knows about the column once it is imported, an untyped ref making a date column untyped. The
  instance's metadata is authoritative; the ref names the column and nothing more, as a `[:metric id]` ref does (see
  [[input-leaf]])."
  [x :- [:or ::lib.schema/query [:sequential ::lib-metric.schema/dimension-mapping]]]
  (walk/postwalk (fn [form]
                   (if (lib.util/clause-of-type? form :field)
                     (lib.options/update-options form dissoc :base-type :effective-type)
                     form))
                 x))

(mu/defn- resolved-metric :- ::resolved/metric
  "The resolve stage's output for the metric `ir` of `context`: the query over its table, `aggregation` filtered by
  `filters`; its dimension set, notes and entity_id; and the card added to the provider for it, which later metrics
  refer to. The dimension set comes first, since it can still report the metric (see
  [[resolve.dimensions/dimension-set]]), and so does the feature check; a reported metric must leave no card behind
  for a later metric to refer to."
  [{:keys [provider query semantic-model agg-time-dimension] :as context} :- ::resolve.columns/context
   ir                                                                     :- ::ir/metric
   aggregation                                                            :- ::lib.schema.aggregation/aggregation
   filters                                                                :- [:sequential
                                                                              ::lib.schema.expression/boolean]]
  (let [dimensions (resolve.dimensions/dimension-set context)
        query      (without-ref-types (reduce lib/filter (lib/aggregate query aggregation) filters))
        _          (check-features! query)
        nano-id    (ids/metric-entity-id ir)
        card-id    (metadata/add-metric! provider {:name          (:label ir)
                                                   :description   (:description ir)
                                                   :table-id      (lib.util/source-table-id query)
                                                   :dataset-query query
                                                   :entity-id     nano-id})]
    (merge {:ir                 ir
            :entity-id          nano-id
            :card-id            card-id
            :metadata-provider  provider
            :semantic-model     (:name semantic-model)
            :agg-time-dimension agg-time-dimension
            :query              query
            :notes              (notes query)}
           (update dimensions :dimension-mappings without-ref-types))))

(mu/defn- resolve-simple :- ::resolved/metric
  "Resolve a simple or cumulative metric: one aggregation over its measure's `expr`, filtered by its templates."
  [env :- ::resolve.columns/env
   {metric-type :type, semantic-model-name :semantic-model, :keys [expr filters fill-nulls-with agg-time-dimension]
    :as ir}
   :- ::ir/metric.simple]
  (let [semantic-model (get (:semantic-models env) semantic-model-name)]
    (when-not semantic-model
      (unsupported/throw! "semantic model %s not found" (pr-str semantic-model-name)))
    (let [{:keys [query] :as context}             (resolve.columns/metric-context env semantic-model ir
                                                                                  agg-time-dimension)
          {:keys [agg expression] :as aggregation} (canonical-measure-aggregation context ir)
          filter-clauses                           (resolve.filters/filter-clauses context filters)
          result-type                              (when (and (some? fill-nulls-with) (#{:min :max} agg) expression)
                                                     (lib/type-of query expression))]
      ;; COALESCE(MAX(text), 0) fails in the warehouse; every other aggregation has a numeric result
      (when (and (resolve.columns/known-type? result-type) (not (isa? result-type :type/Number)))
        (unsupported/throw! "fill_nulls_with %s on a non-numeric aggregation: %s of %s, which is %s"
                            fill-nulls-with (name agg) (pr-str expr) result-type))
      (resolved-metric context ir
                       (with-fill-nulls (aggregation-clause metric-type aggregation) fill-nulls-with)
                       filter-clauses))))

(mr/def ::outcome
  "What a converted metric is to a ratio or derived metric that refers to it: the id of its card in the provider,
  which a `[:metric id]` reference names; its semantic model and `agg_time_dimension`, which the referring metric
  takes; and its IR, which a reference with a filter of its own is inlined from (see [[filtered-input]]). Deliberately
  not the whole `::resolved/metric`: its Lib query would be validated again for every later metric."
  [:map {:closed true}
   [:ir                 ::ir/metric]
   [:card-id            ::lib.schema.id/card]
   [:semantic-model     :string]
   [:agg-time-dimension [:maybe :string]]])

(mr/def ::outcomes
  "What the metrics resolved before the one at hand became, by name: `resolved`, or `failed` with the reason, the parse
  stage's reports, the cyclic metrics and the converter's own errors included. A ratio or derived metric refers to
  them; [[resolve-manifest]] accumulates them as it goes."
  [:map {:closed true}
   [:resolved [:map-of :string ::outcome]]
   [:failed   [:map-of :string :string]]])

(mu/defn- metric-inputs :- [:sequential ::ir/metric-input]
  "The references a metric makes to other metrics; none for a simple or cumulative one."
  [ir :- ::ir/metric]
  (case (:type ir)
    :ratio   [(:numerator ir) (:denominator ir)]
    :derived (:inputs ir)
    []))

(mu/defn- resolved-input :- ::outcome
  "What the metric `metric-input` refers to became. [[unsupported/throw!]] when it is not in the manifest, or was not
  converted."
  [{:keys [resolved failed]} :- ::outcomes
   {:keys [metric]}          :- ::ir/metric-input]
  (or (get resolved metric)
      (if (contains? failed metric)
        (unsupported/throw! "metric %s was not converted: %s" (pr-str metric) (get failed metric))
        (unsupported/throw! "metric %s not found" (pr-str metric)))))

(mu/defn- filtered-input :- ::lib.schema.aggregation/aggregation
  "A reference to `input` that carries a filter of its own, inlined as the filtered form of the input's aggregation over
  its measure (see [[filtered-aggregation-clause]]), with the input metric's own filters and the reference's combined,
  so the metric stays one card. Only a simple metric can be inlined."
  [context                  :- ::resolve.columns/context
   {input-ir :ir}           :- ::outcome
   {:keys [metric filters]} :- ::ir/metric-input]
  (let [{input-type :type, :keys [fill-nulls-with], input-filters :filters} input-ir]
    (when-not (= input-type :simple)
      (unsupported/throw! "metric %s is a %s metric; only a simple metric can take a filter where it is referred to"
                          (pr-str metric) (name input-type)))
    (let [aggregation (canonical-measure-aggregation context input-ir)
          ;; the filters as one condition: the clause itself when there is one, otherwise their `:and`
          condition   (sql/variadic lib/and
                                    (resolve.filters/filter-clauses context (into (vec input-filters) filters)))]
      (with-fill-nulls (filtered-aggregation-clause aggregation condition) fill-nulls-with))))

(mu/defn- input-leaf :- ::lib.schema.aggregation/aggregation
  "What a reference to another metric becomes in a ratio or derived metric's aggregation: a `[:metric id]` reference
  to the card the input became or, when the reference carries a filter, the input's aggregation inlined (see
  [[filtered-input]])."
  [{:keys [provider] :as context}     :- ::resolve.columns/context
   outcomes                           :- ::outcomes
   {:keys [filters] :as metric-input} :- ::ir/metric-input]
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
  [{:keys [env] :as context}                :- ::resolve.columns/context
   outcomes                                 :- ::outcomes
   {metric-type :type, :keys [expr] :as ir} :- ::ir/metric]
  (case metric-type
    :ratio
    (lib// (input-leaf context outcomes (:numerator ir))
           (input-leaf context outcomes (:denominator ir)))

    :derived
    (let [by-name (m/index-by #(or (:alias %) (:metric %)) (:inputs ir))
          value   (sql/expression->mbql (:dialect env) expr
                                        (fn [identifier]
                                          (if-let [input (get by-name identifier)]
                                            (input-leaf context outcomes input)
                                            (unsupported/throw! "%s is not one of the metric's inputs (%s)"
                                                                (pr-str identifier)
                                                                (str/join ", " (map pr-str (keys by-name)))))))]
      (if (lib/clause? value)
        value
        (unsupported/throw! "expr %s is the constant %s, not arithmetic over the inputs"
                            (pr-str expr) (pr-str value))))))

(mu/defn- resolve-composed :- ::resolved/metric
  "Resolve a ratio or derived metric against what its inputs became (see [[resolved-input]]). Its table, and so its
  dimensions, are its inputs', which must all be on one semantic model; its default dimension is their
  `agg_time_dimension` when they agree on one. Its `fill_nulls_with`, if any, wraps the arithmetic in `coalesce`, as
  on a simple metric."
  [env                                                              :- ::resolve.columns/env
   outcomes                                                         :- ::outcomes
   {metric-type :type, :keys [expr filters fill-nulls-with] :as ir} :- ::ir/metric]
  (let [prefix               (case metric-type
                               :ratio   "ratio"
                               :derived (expr-prefix expr))
        inputs               (unsupported/with-reason-prefix prefix
                               #(mapv (partial resolved-input outcomes) (metric-inputs ir)))
        semantic-model-names (distinct (map :semantic-model inputs))]
    (when (next semantic-model-names)
      (unsupported/throw! "inputs are on different semantic models (%s); a metric has one table"
                          (str/join ", " (map #(format "%s on %s" (-> % :ir :name) (:semantic-model %)) inputs))))
    (let [agg-time-dimension (let [candidates (distinct (map :agg-time-dimension inputs))]
                               (when-not (next candidates)
                                 (first candidates)))
          semantic-model     (get (:semantic-models env) (first semantic-model-names))
          context            (resolve.columns/metric-context env semantic-model ir agg-time-dimension)
          expression         (unsupported/with-reason-prefix prefix #(composed-expression context outcomes ir))]
      (resolved-metric context ir
                       (with-fill-nulls expression fill-nulls-with)
                       (resolve.filters/filter-clauses context filters)))))

(mu/defn- error :- ::resolved/error
  "The `:errors` entry for the metric the converter failed on with `e`."
  [metric-name :- :string
   unique-id   :- :string
   e           :- (ms/InstanceOfClass Throwable)]
  {:name      metric-name
   :unique-id unique-id
   :message   (str (pr-str (class e)) (when-let [message (ex-message e)] (str ": " message)))})

(mu/defn- error? :- :boolean
  "Is `result`, what [[resolve-metric]] made of a metric, an error entry?"
  [result :- [:or ::resolved/metric ::ir/unsupported ::resolved/error]]
  (contains? result :message))

(mu/defn resolve-metric :- [:or ::resolved/metric ::ir/unsupported ::resolved/error]
  "Resolve one IR metric in the run's `env` (see [[resolve.columns/env]]: the config, the metadata providers and the
  semantic models), or explain why it cannot be a Metabase metric. `outcomes` is what the metrics a ratio or derived
  metric refers to became (see [[resolve-manifest]]); a simple metric needs none.

  A metric the converter does not support is reported with the reason (see [[unsupported/throw!]]). Anything else
  thrown while resolving a metric is a bug in the converter or an input it did not anticipate; it is logged with its
  stack and returned as a `::resolved/error` naming it, so one bad metric does not stop the others from being
  written."
  ([env :- ::resolve.columns/env
    ir  :- ::ir/metric]
   (resolve-metric env {:resolved {}, :failed {}} ir))

  ([env                                           :- ::resolve.columns/env
    outcomes                                      :- ::outcomes
    {metric-name :name, :keys [unique-id] :as ir} :- ::ir/metric]
   (try
     (case (:type ir)
       (:simple :cumulative) (resolve-simple env ir)
       (:ratio :derived)     (resolve-composed env outcomes ir))
     (catch Throwable e
       (if (unsupported/exception? e)
         (unsupported/report metric-name unique-id (ex-message e))
         (do
           (log/errorf e "Error resolving metric %s" (pr-str metric-name))
           (error metric-name unique-id e)))))))

(mu/defn- refers-to-itself? :- :boolean
  "Whether the metric `metric-name` refers to itself through `inputs`, metric name → the names of the metrics it refers
  to, directly or through others."
  [inputs      :- [:map-of :string [:set :string]]
   metric-name :- :string]
  (loop [frontier (get inputs metric-name #{}), seen #{}]
    (cond
      (contains? frontier metric-name) true
      (empty? frontier)                false
      :else                            (let [seen (into seen frontier)]
                                         (recur (into #{} (comp (mapcat inputs) (remove seen)) frontier) seen)))))

(mu/defn- order-metrics :- [:map {:closed true}
                            [:ordered [:sequential ::ir/metric]]
                            [:cyclic  [:sequential ::ir/metric]]]
  "`metrics` with every ratio or derived metric after the metrics it refers to, otherwise in their order, so the cards
  a metric refers to exist, and are written, before it. A metric that refers to itself, directly or through others,
  can never be placed and is `cyclic`; a metric that refers to a cyclic one is placed after it, to be reported as
  referring to a metric that was not converted. A reference to a metric that is not in `metrics` holds nothing back;
  it is reported when the metric is resolved."
  [metrics :- [:sequential ::ir/metric]]
  (let [names       (into #{} (map :name) metrics)
        input-names (fn [metric] (into #{} (map :metric) (metric-inputs metric)))]
    (loop [remaining metrics, placed #{}, ordered [], cyclic []]
      (let [ready? (fn [metric]
                     (every? #(or (placed %) (not (names %))) (input-names metric)))
            ready  (filter ready? remaining)]
        (cond
          (empty? remaining)
          {:ordered ordered, :cyclic cyclic}

          ;; nothing can be placed: the remaining metrics include a cycle, whose members can never be; the rest only
          ;; refer to them and are placed once the cycle counts as placed
          (empty? ready)
          (let [inputs  (into {} (map (juxt :name input-names)) remaining)
                cyclic? (fn [metric] (refers-to-itself? inputs (:name metric)))
                found   (filter cyclic? remaining)]
            (recur (remove cyclic? remaining) (into placed (map :name) found) ordered (into cyclic found)))

          :else
          (recur (remove ready? remaining) (into placed (map :name) ready) (into ordered ready) cyclic))))))

(def ^:private cyclic-reason
  "metric refers to itself, directly or through the metrics it refers to")

(mu/defn- outcome :- ::outcome
  "What `metric` is to the metrics that refer to it."
  [metric :- ::resolved/metric]
  (select-keys metric [:ir :card-id :semantic-model :agg-time-dimension]))

(mu/defn resolve-manifest :- ::resolved/manifest
  "Resolve every metric in the IR, each after the metrics it refers to. Unsupported metrics from the parse stage are
  carried over, so the result's `:unsupported` is the complete list for the run, and so are the metrics the parse
  stage failed on (flagged `:error?` there), under `:errors` with the converter's own. A ratio or derived metric over
  any of them, over a metric that refers to itself, or over one this stage failed on, is reported with that metric's
  reason rather than as referring to a metric that does not exist."
  [config                                     :- ::resolved/config
   {:keys [metrics unsupported source] :as ir} :- ::ir/manifest]
  (let [env                      (resolve.columns/env config ir)
        {:keys [ordered cyclic]} (order-metrics metrics)
        cyclic-reports           (mapv (fn [{metric-name :name, :keys [unique-id]}]
                                         (unsupported/report metric-name unique-id cyclic-reason))
                                       cyclic)
        {parse-errors      true
         parse-unsupported false} (group-by (comp boolean :error?) unsupported)
        results                  (reduce (fn [{:keys [outcomes] :as results} {metric-name :name, :as metric}]
                                           (let [result (resolve-metric env outcomes metric)]
                                             (cond
                                               (unsupported/report? result)
                                               (-> results
                                                   (update :unsupported conj result)
                                                   (assoc-in [:outcomes :failed metric-name] (:reason result)))

                                               (error? result)
                                               (-> results
                                                   (update :errors conj result)
                                                   (assoc-in [:outcomes :failed metric-name] (:message result)))

                                               :else
                                               (-> results
                                                   (update :metrics conj result)
                                                   (assoc-in [:outcomes :resolved metric-name] (outcome result))))))
                                         {:metrics     []
                                          :unsupported (vec parse-unsupported)
                                          :errors      (mapv (fn [{metric-name :name, :keys [unique-id reason]}]
                                                               {:name      metric-name
                                                                :unique-id unique-id
                                                                :message   reason})
                                                             parse-errors)
                                          :outcomes    {:resolved {}
                                                        :failed   (into {}
                                                                        (map (juxt :name :reason))
                                                                        (concat unsupported cyclic-reports))}}
                                         ordered)]
    {:collection  {:name      (:collection-name config "dbt metrics")
                   :entity-id (ids/collection-entity-id (:project source))}
     :metrics     (:metrics results)
     :unsupported (into (:unsupported results) cyclic-reports)
     :errors      (:errors results)}))
