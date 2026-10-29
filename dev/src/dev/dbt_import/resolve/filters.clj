(ns dev.dbt-import.resolve.filters
  "The resolve stage's filters: a metric's `where_sql_template`s as Lib filter clauses.

  A template is SQL around MetricFlow references, `{{ Dimension('order__status') }} = 'Shipped'`.
  [[sql/render-filter]] stands a placeholder in for each reference and [[sql/condition->mbql]] parses the rest in the
  dialect of the config's `:driver`; the references are resolved here (see [[reference-clause]]). A dimension reached
  through the model's own primary entity (or `metric_time`) is one of its columns; one reached through another entity
  is on the semantic model that entity joins to (see [[resolve.columns/join-context]]). A `TimeDimension`, or a `.grain()`,
  buckets the column by the grain, when the column can be (see [[available-unit]])."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [dev.dbt-import.resolve.columns :as resolve.columns]
   [dev.dbt-import.schemas.ir :as schemas.ir]
   [dev.dbt-import.sql :as sql]
   [dev.dbt-import.unsupported :as unsupported]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::located-dimension
  "A dbt dimension and the context whose columns its expr is written against."
  [:map {:closed true}
   [:dimension ::schemas.ir/dimension]
   [:context   ::resolve.columns/context]])

(mu/defn- own-dimension :- ::located-dimension
  "The dimension named `dimension-name` on `context`'s model."
  [{:keys [model] :as context} :- ::resolve.columns/context
   dimension-name              :- :string]
  (if-let [dimension (m/find-first #(= dimension-name (:name %)) (:dimensions model))]
    {:dimension dimension, :context context}
    (unsupported/throw! "dimension %s is not on semantic model %s" (pr-str dimension-name) (pr-str (:name model)))))

(mu/defn- locate-dimension :- ::located-dimension
  "The dimension `dimension-path` names and the context its expr is written against. dbt writes a dimension path as
  `<entity>__<dimension>`: through the model's primary entity it is one of the model's own dimensions, through a
  foreign entity it is on the semantic model that entity is primary for (see [[resolve.columns/join-context]]). `metric_time`
  is the metric's `agg_time_dimension`."
  [{:keys [model agg-time-dimension] :as context} :- ::resolve.columns/context
   dimension-path                                 :- :string]
  (b/cond
    (= dimension-path "metric_time")
    (if agg-time-dimension
      (own-dimension context agg-time-dimension)
      (unsupported/throw! "metric_time: the measure has no agg_time_dimension"))

    :let [[prefix dimension-name & more] (str/split dimension-path #"__")]

    ;; no entity prefix at all
    (nil? dimension-name)
    (own-dimension context prefix)

    (seq more)
    (unsupported/throw! "%s reaches a dimension through more than one entity, which is not supported" (pr-str dimension-path))

    (= prefix (:primary-entity model))
    (own-dimension context dimension-name)

    :else
    (own-dimension (resolve.columns/join-context context (resolve.columns/own-entity context prefix)) dimension-name)))

(def ^:private grain-aliases
  "dbt granularities read as a Metabase unit of another name. A fiscal quarter is a calendar quarter until custom
  calendars are supported."
  {"fiscal_quarter" "quarter"})

(mu/defn- grain->unit :- [:maybe ::lib.schema.temporal-bucketing/unit.date-time.truncate]
  "The Metabase truncation unit the dbt granularity `grain` names, for the dimension `dimension-name`; nil when
  Metabase has no unit of that name (`nanosecond`). A dbt granularity truncates, so it is never an extraction unit
  like `day-of-week`."
  [grain          :- :string
   dimension-name :- :string]
  (let [unit-name (get grain-aliases grain grain)
        unit      (keyword unit-name)]
    (when (mr/validate ::lib.schema.temporal-bucketing/unit.date-time.truncate unit)
      (when-not (= unit-name grain)
        (log/infof "Reading the %s granularity of %s as %s" grain dimension-name unit-name))
      ;; dbt weeks are ISO weeks; a Metabase week starts on the day the instance's start-of-week setting names
      (when (= unit :week)
        (log/warnf (str "The week granularity of %s is read as a Metabase week, which starts on the day the instance's"
                        " start-of-week setting names; dbt weeks start on Monday")
                   dimension-name))
      unit)))

(mu/defn available-unit :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "The Metabase unit the dbt granularity `grain` names (see [[grain->unit]]), when `column`, the ref for the dimension
  `dimension-name`, can be bucketed by it; nil otherwise. For a column of known type Lib says which units it supports
  (a date has no `hour`). A column the project does not type is a Field of unknown type, which Lib cannot bucket at
  all; dbt declares the dimension `type: time`, and that is trusted: the unit applies as written, and the instance's
  own metadata is the check, when the import binds the field."
  [{:keys [query]} :- ::resolve.columns/context
   column          :- ::lib.schema.ref/ref
   grain           :- :string
   dimension-name  :- :string]
  (when-let [unit (grain->unit grain dimension-name)]
    (when (or (not (resolve.columns/known-type? (lib/type-of query column)))
              (m/find-first #(= unit (:unit %)) (lib/available-temporal-buckets query column)))
      unit)))

(mu/defn- time-dimension-clause :- ::lib.schema.ref/ref
  "`column`, the ref for `dimension`, bucketed by `grain`, a dbt granularity name; nil means the dimension's own. See
  [[available-unit]] for which grains a column takes."
  [context                                  :- ::resolve.columns/context
   {:keys [granularity expr] :as dimension} :- ::schemas.ir/dimension
   column                                   :- ::sql/value
   grain                                    :- [:maybe :string]]
  (b/cond
    (not= :time (:type dimension))
    (unsupported/throw! "TimeDimension(%s): %s is not a time dimension" (pr-str (:name dimension)) (pr-str (:name dimension)))

    (not= :column (:kind (resolve.columns/parse-expr expr)))
    (unsupported/throw! "cannot bucket the SQL expression %s by time" (pr-str expr))

    :let [grain (or grain (some-> granularity name))
          unit  (available-unit context column grain (:name dimension))]

    (not unit)
    (unsupported/throw! "granularity %s has no Metabase temporal unit for %s" (pr-str grain) (pr-str (:name dimension)))

    :else
    (lib/with-temporal-bucket column unit)))

(mu/defn- reference-clause :- ::sql/value
  "The Lib expression a filter template's reference stands for."
  [context                                                :- ::resolve.columns/context
   {:keys [kind grain arguments methods], ref-name :name} :- ::sql/reference]
  ;; `entity_path=[...]` names the join path to a dimension; the converter reaches one through the entity in the
  ;; reference itself and cannot follow another path, so the argument is reported rather than dropped. A `Metric`
  ;; reference is reported whatever its arguments.
  (when (and arguments (not= kind :metric))
    (unsupported/throw! "%s has the argument %s, which is not supported: only the name and, for TimeDimension, a grain"
                        (pr-str ref-name) arguments))
  ;; `.grain('month')` is read (see [[sql/render-filter]]); `.date_part('month')` and anything else chained on is not
  (when (and methods (not= kind :metric))
    (unsupported/throw! "%s has the method call %s, which is not supported: only .grain('<granularity>') is"
                        (pr-str ref-name) methods))
  (case kind
    :metric
    (unsupported/throw! "Metric(%s): filters on other metrics are not supported yet (QRES-5)" (pr-str ref-name))

    :entity
    (let [entity (resolve.columns/own-entity context ref-name)]
      (when grain
        (unsupported/throw! "Entity(%s) has the grain %s, but an entity is a key, not a time dimension"
                            (pr-str ref-name) (pr-str grain)))
      (resolve.columns/column-or-sql context (:expr entity)))

    (:dimension :time-dimension)
    (let [{:keys [dimension context]} (locate-dimension context ref-name)
          column                      (resolve.columns/column-or-sql context (:expr dimension))]
      ;; `Dimension('x').grain('month')` means what `TimeDimension('x', 'month')` does
      (if (or (= kind :time-dimension) grain)
        (time-dimension-clause context dimension column grain)
        column))))

(mu/defn- filter-clause :- ::lib.schema.expression/boolean
  "The Lib filter clause for one `where_sql_template`."
  [{:keys [dialect resolve-column] :as context} :- ::resolve.columns/context
   template                                     :- :string]
  (let [{:keys [sql references]} (sql/render-filter template)]
    ;; a template that still holds Jinja the renderer did not recognise, `{{ var('x') }}` or a reference written
    ;; in a way it does not read, is better reported as that than as referring to nothing, which the parse does
    (when (and (empty? references) (not (sql/jinja? sql)))
      (unsupported/throw! "the filter references no dimension or entity"))
    (sql/condition->mbql dialect sql (fn [identifier]
                                       (if-let [reference (get references identifier)]
                                         (reference-clause context reference)
                                         (resolve-column identifier))))))

(mu/defn filter-clauses :- [:sequential ::lib.schema.expression/boolean]
  "The Lib filter clauses for `templates`, each failure saying which template."
  [context   :- ::resolve.columns/context
   templates :- [:sequential :string]]
  (mapv (fn [template]
          (unsupported/with-reason-prefix (str "filter " (pr-str template)) #(filter-clause context template)))
        templates))
