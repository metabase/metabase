(ns metabase-enterprise.semantic-layer-import.resolve.metrics
  "The resolve stage for metrics: bind IR metrics to Lib queries.

  For every metric, builds with Lib the query that computes it against the
  [[metabase-enterprise.semantic-layer-import.metadata]] provider for its database: the source table, one aggregation,
  and a filter per `::ir/filter`; plus a deterministic `entity_id` (see
  [[metabase-enterprise.semantic-layer-import.ids]]). For a simple or cumulative metric the aggregation is over its
  `expr` (see [[canonical-metric-aggregation]]); for a ratio or derived metric it is arithmetic over `[:metric id]`
  references to the cards its input metrics became, which is why metrics are resolved in dependency order (see
  [[order-metrics]]) and each converted metric is added to the provider as a card. An input used with a filter of its
  own is inlined as the filtered form of its aggregation (see [[filtered-input]]). Metrics that cannot be expressed as a
  single-aggregation Metabase metric are reported in `:unsupported` with a reason instead of failing the run (see
  [[metabase-enterprise.semantic-layer-import.unsupported]]); a metric the import itself fails on is listed in
  `:errors`. A converted metric carries `notes` on where it agrees with the source only under some conditions (see
  [[notes]]).

  [[metabase-enterprise.semantic-layer-import.resolve.columns]] binds a metric to its table and columns,
  [[metabase-enterprise.semantic-layer-import.resolve.filters]] turns its filters into clauses, and
  [[metabase-enterprise.semantic-layer-import.resolve.dimensions]] builds its curated dimension set. This namespace
  holds the aggregations and puts each metric together."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.ids :as ids]
   [metabase-enterprise.semantic-layer-import.metadata :as metadata]
   [metabase-enterprise.semantic-layer-import.resolve.columns :as resolve.columns]
   [metabase-enterprise.semantic-layer-import.resolve.dimensions :as resolve.dimensions]
   [metabase-enterprise.semantic-layer-import.resolve.filters :as resolve.filters]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.schemas.resolved :as resolved]
   [metabase-enterprise.semantic-layer-import.sql :as sql]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
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
   [metabase.sql-to-mbql.core :as sql-to-mbql]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mu/defn- aggregated-expression :- [:maybe ::sql-to-mbql/expression]
  "The Lib expression an aggregation with `operator` aggregates `expr` as: nil for a row count (`1` under `:sum` or
  `:count`, or `*` under `:count`); for `:count-where` the condition to count rows by, a bare boolean column counting
  where it is true; otherwise a column or value expression. An aggregation over any other literal has no Metabase
  equivalent."
  [{:keys [env query resolve-column]} :- ::resolve.columns/context
   operator                           :- :keyword
   expr                               :- :string]
  (let [{:keys [kind], column-name :name, literal :value} (sql/parse-expr expr)
        literal-unsupported (fn [literal]
                              (unsupported/throw-reason "%s over the literal %s has no Metabase equivalent"
                                                        (name operator) literal))]
    (case kind
      ;; `count(*)`, like `count(1)`, is a row count
      :wildcard (when-not (= operator :count)
                  (unsupported/throw-reason "%s over * has no Metabase equivalent" (name operator)))
      :literal  (when-not (and (= literal "1") (#{:sum :count} operator))
                  (literal-unsupported literal))
      :column   (let [column (resolve-column column-name)]
                  (if (= operator :count-where)
                    (let [base-type (lib/type-of query column)]
                      ;; a column the project types as anything but boolean is no condition; an untyped one is trusted
                      (when (and (resolve.columns/known-type? base-type) (not (isa? base-type :type/Boolean)))
                        (unsupported/throw-reason "count-where over the non-boolean column %s" (pr-str column-name)))
                      (lib/= column true))
                    column))
      :sql      (let [value (sql/expression->mbql (:dialect env) expr resolve-column
                                                  {:condition? (= operator :count-where)})]
                  (if (lib/clause? value)
                    value
                    (literal-unsupported (pr-str value)))))))

(mr/def ::canonical-aggregation
  "An aggregation in the form the Lib clauses are built from, see [[canonical-aggregation]]. `agg` is an IR operator,
  or one of the stage's own: `:row-count` for a `:count` or `:sum` over no expression, and `:count-non-null` for a
  `:count` over a column, which SQL skips nulls for. The expression of a `:count-where` is the condition to count rows
  by. `percentile` is set for a `:percentile`."
  [:map {:closed true}
   [:agg        [:enum :row-count :count-non-null :count-where
                 :sum :avg :min :max :median :count-distinct :percentile]]
   [:expression [:maybe ::sql-to-mbql/expression]]
   [:percentile {:optional true} :double]])

(mu/defn- canonical-aggregation :- ::canonical-aggregation
  "`aggregation` over `expression` (see [[aggregated-expression]]) in the form the Lib clauses are built from, so that
  the special cases are decided once and [[aggregation-clause]] and [[filtered-aggregation-clause]] are each a flat
  `case`."
  [{:keys [operator percentile]} :- ::ir/aggregation
   expression                    :- [:maybe ::sql-to-mbql/expression]]
  (cond
    ;; aggregated-expression gives no expression for a row count only
    (nil? expression)         {:agg :row-count, :expression nil}
    (= operator :count)       {:agg :count-non-null, :expression expression}
    ;; the IR takes the percentile as a fraction, which is what Lib takes
    (= operator :percentile)  {:agg :percentile, :expression expression, :percentile (double percentile)}
    :else                     {:agg operator, :expression expression}))

(mu/defn- expr-prefix :- :string
  "The reason prefix for an aggregation's or a derived metric's `expr`, so the reason says which SQL it is about."
  [expr :- :string]
  (str "expr " (pr-str expr)))

(mu/defn- canonical-metric-aggregation :- ::canonical-aggregation
  "The [[canonical-aggregation]] of the simple metric `ir`, or of a simple input to a composed one, over its
  aggregation's `expr` (see [[aggregated-expression]]), each failure saying which `expr`."
  [context                                                :- ::resolve.columns/context
   {{:keys [operator expr] :as aggregation} :aggregation} :- ::ir/metric.simple]
  (canonical-aggregation aggregation
                         (unsupported/with-reason-prefix (expr-prefix expr)
                           #(aggregated-expression context operator expr))))

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
      (unsupported/throw-reason "a running %s has no Metabase equivalent: only a running sum or row count does"
                                (name agg)))
    (case agg
      :row-count      (lib/count)
      :count-non-null (lib/count-where (lib/not-null expression))
      :count-where    (lib/count-where expression)
      :sum            (lib/sum expression)
      :avg            (lib/avg expression)
      :min            (lib/min expression)
      :max            (lib/max expression)
      :median         (lib/median expression)
      :count-distinct (lib/distinct expression)
      :percentile     (lib/percentile expression percentile))))

(mu/defn- filtered-aggregation-clause :- ::lib.schema.aggregation/aggregation
  "The Lib clause for `aggregation` over the rows `condition` holds for. A count is `count-where` and a distinct count
  `distinct-where`; every other aggregation is over a `case` that is its expression where the condition holds and
  null elsewhere, which the aggregation skips. That is how the query processor splices a filtered metric into a
  query, and it gives null, as an outer join to the filtered metric would, for a group no row of which passes the
  condition, where `sum-where`
  would give 0. A count gives 0 for such a group either way, as it does for a filter on the metric itself."
  [{:keys [agg expression percentile]} :- ::canonical-aggregation
   condition                           :- ::lib.schema.expression/boolean]
  (let [filtered (delay (lib/case [[condition expression]]))]
    (case agg
      :row-count      (lib/count-where condition)
      :count-non-null (lib/count-where (lib/and condition (lib/not-null expression)))
      :count-where    (lib/count-where (lib/and condition expression))
      :count-distinct (lib/distinct-where expression condition)
      :sum            (lib/sum @filtered)
      :avg            (lib/avg @filtered)
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
  is queried; see [[check-features]]."
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

(mu/defn- check-features :- :nil
  "[[unsupported/throw-reason]] when a clause of `query` needs a driver feature the config's driver lacks (see
  [[clause-features]] and [[metadata/driver-features]]), naming the clause and the feature."
  [query :- ::lib.schema/query]
  (doseq [clause (clauses query)
          :let   [feature (clause-features (first clause))]
          :when  (and feature (not (lib.metadata/database-supports? query feature)))]
    (unsupported/throw-reason "the %s driver does not support the %s clause, which the metric needs (feature %s)"
                              (name (:engine (lib.metadata/database query))) (name (first clause)) feature)))

(def ^:private week-note
  (str "a week grain is read as a Metabase week, which starts on the day the instance's start-of-week setting names;"
       " an ISO week, which semantic layers and most warehouses use, starts on Monday, so the metric agrees with the"
       " source only on an instance set to Monday"))

(def ^:private cumulative-note
  (str "a cumulative metric is a running total over whatever it is broken out by: it agrees with the source with its"
       " time dimension as the finest breakout, and is a running total across the categories under any other"))

(mu/defn notes :- [:sequential :string]
  "What a user of the metric `query` computes should know that the query does not say: where it agrees with the
  source only under some conditions. Read off the finished query, so that every way of building one is covered: a
  running aggregation, from a cumulative metric, is right only under its time dimension (see [[cumulative-note]]); a
  week bucket anywhere, from a bucketed reference or a `date_trunc`, in a filter or an expression, starts the week on
  the instance's first day of the week, not the ISO week's Monday (see [[week-note]])."
  [query :- ::lib.schema/query]
  (let [all-clauses (clauses query)]
    (cond-> []
      (some #(lib.util/clause-of-type? % #{:cum-sum :cum-count}) all-clauses) (conj cumulative-note)
      (some #(= :week (:temporal-unit (lib.options/options %))) all-clauses)   (conj week-note))))

(mu/defn- without-ref-types :- [:or ::lib.schema/query [:sequential ::lib-metric.schema/dimension-mapping]]
  "`x`, a query or a metric's dimension mappings, with the `:base-type` and `:effective-type` taken off every `:field`
  ref in it. The types are what the import knew the column as, from the project's `data_type` or `:type/*` when it
  declares none; Lib reads a ref's options over the Field's own metadata, so a ref that carried them would override
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
  [{:keys [env provider query table time-dimension] :as context} :- ::resolve.columns/context
   ir                                                            :- ::ir/metric
   aggregation                                                   :- ::lib.schema.aggregation/aggregation
   filters                                                       :- [:sequential ::lib.schema.expression/boolean]]
  (let [dimensions (resolve.dimensions/dimension-set context)
        query      (without-ref-types (reduce lib/filter (lib/aggregate query aggregation) filters))
        _          (check-features query)
        nano-id    (ids/metric-entity-id (:source env) (metadata/database-name provider) ir)
        card-id    (metadata/add-metric! provider {:name          (:label ir)
                                                   :description   (:description ir)
                                                   :table-id      (lib.util/source-table-id query)
                                                   :dataset-query query
                                                   :entity-id     nano-id})]
    (merge {:ir                ir
            :entity-id         nano-id
            :card-id           card-id
            :metadata-provider provider
            :table             (:name table)
            :time-dimension    time-dimension
            :query             query
            :notes             (notes query)}
           (update dimensions :dimension-mappings without-ref-types))))

(mu/defn- resolve-simple :- ::resolved/metric
  "Resolve a simple or cumulative metric: one aggregation over its `expr`, filtered by its filters."
  [env :- ::resolve.columns/env
   {metric-type :type, table-name :table, :keys [aggregation filters fill-nulls-with time-dimension] :as ir}
   :- ::ir/metric.simple]
  (let [table (get (:tables env) table-name)]
    (when-not table
      (unsupported/throw-reason "table %s not found" (pr-str table-name)))
    (let [{:keys [query] :as context}            (resolve.columns/metric-context env table ir time-dimension)
          {:keys [agg expression] :as canonical} (canonical-metric-aggregation context ir)
          filter-clauses                         (resolve.filters/filter-clauses context filters)
          result-type                            (when (and (some? fill-nulls-with) (#{:min :max} agg) expression)
                                                   (lib/type-of query expression))]
      ;; COALESCE(MAX(text), 0) fails in the warehouse; every other aggregation has a numeric result
      (when (and (resolve.columns/known-type? result-type) (not (isa? result-type :type/Number)))
        (unsupported/throw-reason "filling nulls with %s on a non-numeric aggregation: %s of %s, which is %s"
                                  fill-nulls-with (name agg) (pr-str (:expr aggregation)) result-type))
      (resolved-metric context ir
                       (with-fill-nulls (aggregation-clause metric-type canonical) fill-nulls-with)
                       filter-clauses))))

(mr/def ::outcome
  "What a converted metric is to a ratio or derived metric that refers to it: the id of its card in the provider,
  which a `[:metric id]` reference names; its table and time dimension, which the referring metric takes; and its IR,
  which a reference with a filter of its own is inlined from (see [[filtered-input]]). Deliberately not the whole
  `::resolved/metric`: its Lib query would be validated again for every later metric."
  [:map {:closed true}
   [:ir             ::ir/metric]
   [:card-id        ::lib.schema.id/card]
   [:table          :string]
   [:time-dimension [:maybe :string]]])

(mr/def ::outcomes
  "What the metrics resolved before the one at hand became, by name: `resolved`, or `failed` with the reason, the parse
  stage's reports, the cyclic metrics and the import's own errors included. A ratio or derived metric refers to them;
  [[resolve-metrics]] accumulates them as it goes."
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
  "What the metric `metric-input` refers to became. [[unsupported/throw-reason]] when it is not in the semantic layer,
  or was not converted."
  [{:keys [resolved failed]} :- ::outcomes
   {:keys [metric]}          :- ::ir/metric-input]
  (or (get resolved metric)
      (if (contains? failed metric)
        (unsupported/throw-reason "metric %s was not converted: %s" (pr-str metric) (get failed metric))
        (unsupported/throw-reason "metric %s not found" (pr-str metric)))))

(mu/defn- filtered-input :- ::lib.schema.aggregation/aggregation
  "A reference to `input` that carries a filter of its own, inlined as the filtered form of the input's aggregation
  (see [[filtered-aggregation-clause]]), with the input metric's own filters and the reference's combined, so the
  metric stays one card. Only a simple metric can be inlined."
  [context                  :- ::resolve.columns/context
   {input-ir :ir}           :- ::outcome
   {:keys [metric filters]} :- ::ir/metric-input]
  (let [{input-type :type, :keys [fill-nulls-with], input-filters :filters} input-ir]
    (when-not (= input-type :simple)
      (unsupported/throw-reason (str "metric %s is a %s metric; only a simple metric can take a filter where it is"
                                     " referred to")
                                (pr-str metric) (name input-type)))
    (let [aggregation (canonical-metric-aggregation context input-ir)
          clauses     (resolve.filters/filter-clauses context (into (vec input-filters) filters))
          ;; the filters as one condition: the clause itself when there is one, otherwise their `:and`
          condition   (if (next clauses) (apply lib/and clauses) (first clauses))]
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
                                            (unsupported/throw-reason "%s is not one of the metric's inputs (%s)"
                                                                      (pr-str identifier)
                                                                      (str/join ", " (map pr-str (keys by-name)))))))]
      (if (lib/clause? value)
        value
        (unsupported/throw-reason "expr %s is the constant %s, not arithmetic over the inputs"
                                  (pr-str expr) (pr-str value))))))

(mu/defn- resolve-composed :- ::resolved/metric
  "Resolve a ratio or derived metric against what its inputs became (see [[resolved-input]]). Its table, and so its
  dimensions, are its inputs', which must all be on one table; its time dimension is theirs when they agree on one.
  Its `fill-nulls-with`, if any, wraps the arithmetic in `coalesce`, as on a simple metric."
  [env                                                              :- ::resolve.columns/env
   outcomes                                                         :- ::outcomes
   {metric-type :type, :keys [expr filters fill-nulls-with] :as ir} :- ::ir/metric]
  (let [prefix               (case metric-type
                               :ratio   "ratio"
                               :derived (expr-prefix expr))
        inputs               (unsupported/with-reason-prefix prefix
                               #(mapv (partial resolved-input outcomes) (metric-inputs ir)))
        table-names          (distinct (map :table inputs))]
    (when (next table-names)
      (unsupported/throw-reason "inputs are on different tables (%s); a metric has one table"
                                (str/join ", " (map #(format "%s on %s" (-> % :ir :name) (:table %)) inputs))))
    (let [time-dimension (let [candidates (distinct (map :time-dimension inputs))]
                           (when-not (next candidates)
                             (first candidates)))
          table          (get (:tables env) (first table-names))
          context        (resolve.columns/metric-context env table ir time-dimension)
          expression     (unsupported/with-reason-prefix prefix #(composed-expression context outcomes ir))]
      (resolved-metric context ir
                       (with-fill-nulls expression fill-nulls-with)
                       (resolve.filters/filter-clauses context filters)))))

(mu/defn- error :- ::resolved/error
  "The `:errors` entry for the metric the import failed on with `e`."
  [metric-name :- :string
   unique-id   :- :string
   e           :- (ms/InstanceOfClass Throwable)]
  {:kind      :metric
   :name      metric-name
   :unique-id unique-id
   :message   (str (pr-str (class e)) (when-let [message (ex-message e)] (str ": " message)))})

(mu/defn- error? :- :boolean
  "Is `result`, what [[resolve-metric]] made of a metric, an error entry?"
  [result :- [:or ::resolved/metric ::ir/unsupported ::resolved/error]]
  (contains? result :message))

(mu/defn resolve-metric :- [:or ::resolved/metric ::ir/unsupported ::resolved/error]
  "Resolve one IR metric in the run's `env` (see [[resolve.columns/env]]: the config, the metadata providers and the
  tables), or explain why it cannot be a Metabase metric. `outcomes` is what the metrics a ratio or derived metric
  refers to became (see [[resolve-metrics]]); a simple metric needs none.

  A metric the import does not support is reported with the reason (see [[unsupported/throw-reason]]). Anything else
  thrown while resolving a metric is a bug in the import or an input it did not anticipate; it is logged with its
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
         (unsupported/report :metric metric-name unique-id (ex-message e))
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
  (select-keys metric [:ir :card-id :table :time-dimension]))

(mr/def ::resolved-metrics
  "What [[resolve-metrics]] made of a semantic layer's metrics: the converted ones, the ones it reported, and the ones
  it failed on."
  [:map {:closed true}
   [:metrics     [:sequential ::resolved/metric]]
   [:unsupported [:sequential ::ir/unsupported]]
   [:errors      [:sequential ::resolved/error]]])

(mu/defn resolve-metrics :- ::resolved-metrics
  "Resolve `metrics`, each after the metrics it refers to. `failed` is the metrics an earlier stage could not convert,
  by name, with the reason: a ratio or derived metric over one of them, over a metric that refers to itself, or over
  one this stage failed on, is reported with that metric's reason rather than as referring to a metric that does not
  exist."
  [env     :- ::resolve.columns/env
   failed  :- [:map-of :string :string]
   metrics :- [:sequential ::ir/metric]]
  (let [{:keys [ordered cyclic]} (order-metrics metrics)
        cyclic-reports           (mapv (fn [{metric-name :name, :keys [unique-id]}]
                                         (unsupported/report :metric metric-name unique-id cyclic-reason))
                                       cyclic)
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
                                          :unsupported []
                                          :errors      []
                                          :outcomes    {:resolved {}
                                                        :failed   (into failed
                                                                        (map (juxt :name :reason))
                                                                        cyclic-reports)}}
                                         ordered)]
    {:metrics     (:metrics results)
     :unsupported (into (:unsupported results) cyclic-reports)
     :errors      (:errors results)}))
