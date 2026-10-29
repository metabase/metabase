(ns metabase-enterprise.semantic-layer-import.dbt.filters
  "dbt filters as IR filters (see `::ir/filter`).

  A dbt `filter` is a list of `where_sql_template`s: SQL around MetricFlow object references in Jinja,
  `{{ Dimension('order__status') }} = 'Shipped'`. [[render-filter]] stands a placeholder in for each reference, and
  [[ir-reference]] says what each one refers to in the IR's terms:

  * `Dimension('<entity>__<dimension>')`, or a bare `Dimension('<dimension>')`, is a dimension reached through the
    entity, which names a join of the metric's table or, as its primary entity, the table itself (see
    [[metabase-enterprise.semantic-layer-import.dbt.joins]]);
  * `TimeDimension(..., '<grain>')`, or `Dimension(...).grain('<grain>')`, is the same, bucketed by the grain;
  * `metric_time` is the metric's time dimension, its `agg_time_dimension`;
  * `Entity('<name>')` is the key of that name on the metric's table.

  What the IR has no place for is reported here, at parse time: a `Metric(...)` reference, any argument beyond a
  reference's name and grain, any other method chained onto it, and a template with no reference at all. A dbt grain
  that is a Metabase unit under another name is renamed (see [[parse-grain]])."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.sql :as sql]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::metricflow-reference
  "A MetricFlow object reference from a filter template: `Dimension('entity__name')`, `TimeDimension('entity__name',
  'grain')`, `Entity('name')` or `Metric('name', ...)`. `:grain` is the second argument of a `TimeDimension`, or the
  argument of a `.grain('month')` chained onto the reference, which means the same. `:arguments` is whatever followed
  the quoted arguments, `entity_path=['order']` or `group_by=['customer']`, as written; `:methods` is every other
  method call chained onto the reference, `.date_part('month')`, as written; both nil when there was none."
  [:map {:closed true}
   [:kind      [:enum :dimension :time-dimension :entity :metric]]
   [:name      :string]
   [:grain     [:maybe :string]]
   [:arguments [:maybe :string]]
   [:methods   [:maybe :string]]])

(mr/def ::rendered-filter
  "A filter template with its references replaced by placeholder identifiers, and what each placeholder stood for."
  [:map {:closed true}
   [:sql        :string]
   [:references [:map-of :string ::metricflow-reference]]])

(def ^:private reference-re
  "`{{ Dimension('order__status') }}`, `{{ TimeDimension('metric_time', 'day') }}`, `{{ Entity('customer') }}`,
  `{{ Metric('revenue', group_by=['customer']) }}`, `{{ Dimension('order__ordered_at').grain('month') }}`: the
  object, its quoted first argument, an optional quoted second argument, whatever else precedes the closing
  parenthesis, and the method calls chained onto it."
  (re-pattern (str "\\{\\{\\s*(Dimension|TimeDimension|Entity|Metric)\\("
                   "\\s*(?:'([^']*)'|\"([^\"]*)\")\\s*"
                   "(?:,\\s*(?:'([^']*)'|\"([^\"]*)\"))?"
                   "([^)]*)\\)"
                   "((?:\\s*\\.\\s*\\w+\\([^)]*\\))*)"
                   "\\s*\\}\\}")))

(def ^:private method-re
  "One `.name(arguments)` call chained onto a reference."
  #"\.\s*(\w+)\(([^)]*)\)")

(mu/defn- extra-arguments :- [:maybe :string]
  "`remainder`, what a reference had after its quoted arguments, without the comma that separated it from them; nil
  when there was nothing but whitespace."
  [remainder :- :string]
  (not-empty (str/replace (str/trim remainder) #"^,\s*" "")))

(mu/defn- chained-methods :- [:map {:closed true}
                              [:grain   [:maybe :string]]
                              [:methods [:maybe :string]]]
  "What the method calls chained onto a reference, `chain`, say: `.grain('month')` names the grain (the last one wins),
  and anything else is `:methods`, as written, for the resolver to report."
  [chain :- :string]
  (reduce (fn [acc [call method-name arguments]]
            (if-let [grain (when (= method-name "grain")
                             (let [[_ single-quoted double-quoted]
                                   (re-matches #"\s*(?:'([^']*)'|\"([^\"]*)\")\s*" arguments)]
                               (or single-quoted double-quoted)))]
              (assoc acc :grain grain)
              (update acc :methods str (str/replace call #"\s+" ""))))
          {:grain nil, :methods nil}
          (re-seq method-re chain)))

(def ^:private reference-kinds
  {"Dimension"     :dimension
   "TimeDimension" :time-dimension
   "Entity"        :entity
   "Metric"        :metric})

(mu/defn- parse-reference :- ::metricflow-reference
  "What the MetricFlow reference `text`, one match of [[reference-re]], refers to."
  [text :- :string]
  (let [[_ object single-1 double-1 single-2 double-2 remainder chain] (re-matches reference-re text)
        {:keys [grain], method-calls :methods}                        (chained-methods chain)]
    {:kind      (reference-kinds object)
     :name      (or single-1 double-1)
     :grain     (or grain single-2 double-2)
     :arguments (extra-arguments remainder)
     :methods   method-calls}))

(mu/defn- render-filter :- ::rendered-filter
  "Replace each MetricFlow reference in the filter `template` with a placeholder identifier, so the rest parses as SQL
  with [[sql/condition->mbql]], whose column callback then sees the placeholders as column names. `:references` says
  what each placeholder stood for, arguments the import does not read included, for [[ir-reference]] to report. The
  same reference written twice is one placeholder. Jinja the regex does not recognise is left alone and fails to
  parse."
  [template :- :string]
  (let [placeholders (into {}
                           (map-indexed (fn [i text] [text (format "__dbt_ref_%d__" i)]))
                           (distinct (map first (re-seq reference-re template))))]
    {:sql        (str/replace template reference-re (fn [[text]] (placeholders text)))
     :references (into {} (map (fn [[text placeholder]] [placeholder (parse-reference text)])) placeholders)}))

(def ^:private grain-aliases
  "dbt granularities read as a Metabase unit of another name. A fiscal quarter is a calendar quarter until custom
  calendars are supported."
  {"fiscal_quarter" "quarter"})

(mu/defn parse-grain :- ::ir/grain
  "The IR grain for the dbt granularity `granularity` that `what` (a dimension reference, a metric) is bucketed by: the
  granularity itself, or the Metabase unit of another name it is read as (see [[grain-aliases]])."
  [granularity :- :string
   what        :- :string]
  (if-let [alias (get grain-aliases granularity)]
    (do (log/infof "Reading the %s granularity of %s as %s" granularity what alias)
        alias)
    granularity))

(mu/defn- dimension-reference :- [:or ::ir/reference.dimension ::ir/reference.time-dimension]
  "The IR reference for the dimension path `ref-name`, `<entity>__<dimension>` or a bare dimension name, or
  `metric_time` for the metric's time dimension, bucketed by `bucket`."
  [ref-name :- :string
   bucket   :- ::ir/bucket]
  (if (= ref-name "metric_time")
    {:kind :time-dimension, :bucket bucket}
    (let [parts (str/split ref-name #"__" -1)]
      ;; `''`, `'order__'` or `'__status'`: a part of the path is missing
      (when (some str/blank? parts)
        (unsupported/throw! "%s is not a dimension reference: expected <entity>__<dimension>, or a dimension name"
                            (pr-str ref-name)))
      {:kind   :dimension
       :path   (vec (butlast parts))
       :name   (last parts)
       :bucket bucket})))

(mu/defn- ir-reference :- ::ir/reference
  "The IR reference for the MetricFlow `reference`. [[unsupported/throw!]] for what the IR has no place for."
  [{:keys [kind grain arguments], ref-name :name, method-calls :methods} :- ::metricflow-reference]
  ;; `entity_path=[...]` names the join path to a dimension; the import reaches one through the entity in the
  ;; reference itself and cannot follow another path, so the argument is reported rather than dropped. A `Metric`
  ;; reference is reported whatever its arguments.
  (when (and arguments (not= kind :metric))
    (unsupported/throw! "%s has the argument %s, which is not supported: only the name and, for TimeDimension, a grain"
                        (pr-str ref-name) arguments))
  ;; `.grain('month')` is read (see [[render-filter]]); `.date_part('month')` and anything else chained on is not
  (when (and method-calls (not= kind :metric))
    (unsupported/throw! "%s has the method call %s, which is not supported: only .grain('<granularity>') is"
                        (pr-str ref-name) method-calls))
  (case kind
    :metric
    (unsupported/throw! "Metric(%s): a condition on another metric's value is a HAVING, which a metric has no place for"
                        (pr-str ref-name))

    :entity
    (do (when grain
          (unsupported/throw! "Entity(%s) has the grain %s, but an entity is a key, not a time dimension"
                              (pr-str ref-name) (pr-str grain)))
        {:kind :key, :name ref-name})

    ;; `Dimension('x').grain('month')` means what `TimeDimension('x', 'month')` does
    (:dimension :time-dimension)
    (dimension-reference ref-name (when (or (= kind :time-dimension) grain)
                                    {:grain (some-> grain (parse-grain ref-name))}))))

(mu/defn parse-filter :- ::ir/filter
  "The IR filter for one `where_sql_template`, each failure saying which template."
  [template :- :string]
  (unsupported/with-reason-prefix (str "filter " (pr-str template))
    (fn []
      (let [{:keys [sql references]} (render-filter template)]
        ;; a template that still holds Jinja the renderer did not recognise, `{{ var('x') }}` or a reference written
        ;; in a way it does not read, is better reported as that than as referring to nothing, which the resolve
        ;; stage's SQL parse does
        (when (and (empty? references) (not (sql/jinja? sql)))
          (unsupported/throw! "the filter references no dimension or entity"))
        {:text       template
         :sql        sql
         :references (update-vals references ir-reference)}))))
