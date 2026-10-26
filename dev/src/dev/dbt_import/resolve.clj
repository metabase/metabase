(ns dev.dbt-import.resolve
  "Stage 2 of the converter: bind IR metrics to Lib queries.

  Takes the IR (see [[dev.dbt-import.schemas.ir]]) and a config and, for every metric, builds with Lib the query that
  computes it against the [[dev.dbt-import.metadata]] provider for its database: the source table, one aggregation
  over the measure's `expr`, and a filter per `where_sql_template`; plus a deterministic `entity_id`. Metrics that
  cannot be expressed as a single-aggregation Metabase metric are reported in `:unsupported` with a reason instead of
  failing the run.

  The manifest's column list is documentation, not the warehouse schema: a project may declare no `data_type`, or
  not document the column at all. Such a column is a Field of unknown type in the provider (see
  [[metadata/column]]); the instance supplies the type when the serdes import binds the field, and a column that does
  not exist fails there, with the authoritative metadata.

  SQL, in a measure's `expr` or in a filter, goes through [[dev.dbt-import.sql]] in the dialect of the config's
  `:driver`. A filter's references are resolved here: a dimension reached through the model's own primary entity (or
  `metric_time`) is one of its columns, one reached through another entity lives on another semantic model and needs a
  join (QRES-4).

  Only knows the IR, not the manifest, so another semantic layer's parser would plug in unchanged."
  (:require
   [better-cond.core :as b]
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [dev.dbt-import.metadata :as metadata]
   [dev.dbt-import.schemas.ir :as schemas.ir]
   [dev.dbt-import.schemas.resolved :as schemas.resolved]
   [dev.dbt-import.sql :as sql]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)))

(mu/defn entity-id :- ::schemas.resolved/entity-id
  "A deterministic `entity_id` for the string `s`. Re-running the converter on the same input produces the same IDs,
  so a re-import updates the existing metrics instead of duplicating them."
  [s :- :string]
  ;; generate-nano-id seeds a RNG from a hex string parsed as a long, so hand it 15 hex chars (60 bits) of the hash
  (u/generate-nano-id (subs (codecs/bytes->hex (buddy-hash/sha256 s)) 0 15)))

(mu/defn- metric-entity-id :- ::schemas.resolved/entity-id
  [{:keys [unique-id]} :- ::schemas.ir/metric]
  (entity-id (str "dbt-import/metric/" unique-id)))

(mu/defn- collection-entity-id :- ::schemas.resolved/entity-id
  [project :- [:maybe :string]]
  (entity-id (str "dbt-import/collection/" project)))

(def ^:private identifier-re
  "A bare column name, optionally table-qualified. Each part is either quoted (`\"Sales\"`, `` `sales` ``) or a run of
  letters, digits and underscores in any script that is not all digits (so `1.0` is not table `1`, column `0`); a
  leading digit is legal in a warehouse when quoted, and dbt projects write it unquoted in `expr`. Surrounding
  whitespace, including the newline a YAML block scalar adds, is ignored."
  (let [bare "(?=[\\p{L}\\p{N}_]*[\\p{L}_])[\\p{L}\\p{N}_]+"]
    (re-pattern (str "(?s)^\\s*"
                     "(?:(?:\"[^\"]+\"|`[^`]+`|" bare ")\\s*\\.\\s*)?"
                     "(?:\"([^\"]+)\"|`([^`]+)`|(" bare "))"
                     "\\s*$"))))

(def ^:private integer-literal-re #"(?s)^\s*\d+\s*$")
(def ^:private keyword-literal-re #"(?is)^\s*(?:true|false|null)\s*$")
(def ^:private wildcard-re #"(?s)^\s*\*\s*$")

(mr/def ::parsed-expr
  [:map
   [:kind  [:enum :column :literal :wildcard :sql]]
   [:name  {:optional true} :string]
   [:value {:optional true} :string]])

(mu/defn- parse-expr :- ::parsed-expr
  "What an IR `expr` is: a bare column name (`:name`, unquoted and unqualified), a literal (`:value`, as written, so
  the report can quote it), the wildcard `*`, or anything else, which is SQL."
  [expr :- :string]
  (cond
    (re-matches wildcard-re expr)
    {:kind :wildcard}

    (or (re-matches integer-literal-re expr)
        (re-matches keyword-literal-re expr))
    {:kind :literal, :value (str/trim expr)}

    :else
    (if-let [[_ quoted backticked bare] (re-matches identifier-re expr)]
      {:kind :column, :name (or quoted backticked bare)}
      {:kind :sql})))

(mu/defn- find-column :- [:maybe ::schemas.ir/column]
  "`columns` entry named `column-name`, exactly or ignoring case."
  [columns     :- [:map-of :string ::schemas.ir/column]
   column-name :- :string]
  (or (get columns column-name)
      (m/find-first #(= (u/lower-case-en (:name %)) (u/lower-case-en column-name)) (vals columns))))

(mr/def ::context
  "What resolving one metric's SQL needs: the query being built, the model and metric for filter references, the SQL
  dialect, and the callback that turns a column name into a Lib ref."
  [:map
   [:query          ::lib.schema/query]
   [:model          ::schemas.ir/semantic-model]
   [:metric         ::schemas.ir/metric]
   [:dialect        ::sql/dialect]
   [:resolve-column ::sql/resolve-column]])

(mu/defn- declared-base-type :- [:maybe :keyword]
  "The base type the project's declared `data_type` for `column-name` maps to, nil when it declares none. Throws
  [[sql/unsupported]] when it declares one the driver does not know."
  [config      :- ::schemas.resolved/config
   columns     :- [:map-of :string ::schemas.ir/column]
   column-name :- :string]
  (let [column    (find-column columns column-name)
        data-type (some-> (:data-type column) str/trim not-empty)]
    (when data-type
      (or (metadata/base-type (:driver config) (:base-types config) data-type)
          (sql/unsupported "no base type known for column %s of type %s; add it to :base-types"
                           (pr-str (:name column)) (pr-str data-type))))))

(mu/defn- column-ref :- ::lib.schema.ref/ref
  "Lib ref for `column-name` on `table-id`, by its documented spelling when the project documents it."
  [config      :- ::schemas.resolved/config
   provider    :- ::lib.schema.metadata/metadata-provider
   table-id    :- ::lib.schema.id/table
   columns     :- [:map-of :string ::schemas.ir/column]
   column-name :- :string]
  (declared-base-type config columns column-name)
  (lib/ref (metadata/column provider table-id (or (:name (find-column columns column-name)) column-name))))

(defn- known-type?
  "Is `base-type` a type, rather than the `:type/*` of a column the manifest does not type?"
  [base-type]
  (and base-type (not= base-type :type/*)))

(mu/defn- column-or-sql :- ::sql/value
  "The Lib expression for a dimension's or entity's `expr`: a bare column name, or a SQL expression."
  [{:keys [dialect resolve-column]} :- ::context
   expr                             :- :string]
  (let [{:keys [kind], column-name :name} (parse-expr expr)]
    (case kind
      :column (resolve-column column-name)
      :sql    (sql/expression->mbql dialect expr resolve-column)
      (sql/unsupported "%s is neither a column nor a SQL expression" (pr-str expr)))))

(mu/defn- measure-expression :- [:maybe ::sql/value]
  "The Lib expression the measure aggregates: nil for a row count (`1`, or `*` under `count`); for `sum_boolean` the
  condition to count rows by, a bare boolean column counting where it is true; otherwise a column or value
  expression. A measure over any other literal has no Metabase equivalent."
  [{:keys [query dialect resolve-column]} :- ::context
   agg                                    :- :keyword
   expr                                   :- :string]
  (let [{:keys [kind], column-name :name, literal :value} (parse-expr expr)
        literal-unsupported (fn [literal]
                              (sql/unsupported "%s over the literal %s has no Metabase equivalent" (name agg) literal))]
    (case kind
      ;; `count(*)`, like `count(1)`, is a row count
      :wildcard (when-not (= agg :count)
                  (sql/unsupported "%s over * has no Metabase equivalent" (name agg)))
      :literal  (when-not (and (= literal "1") (#{:sum :count} agg))
                  (literal-unsupported literal))
      :column   (let [column (resolve-column column-name)]
                  (if (= agg :sum_boolean)
                    (let [base-type (lib/type-of query column)]
                      ;; a column the project types as anything but boolean cannot be summed as one; an untyped one is trusted
                      (when (and (known-type? base-type) (not (isa? base-type :type/Boolean)))
                        (sql/unsupported "sum_boolean over the non-boolean column %s" (pr-str column-name)))
                      (lib/= column true))
                    column))
      :sql      (let [value (if (= agg :sum_boolean)
                              (sql/condition->mbql dialect expr resolve-column)
                              (sql/expression->mbql dialect expr resolve-column))]
                  (if (vector? value)
                    value
                    (literal-unsupported (pr-str value)))))))

(mu/defn- percentile-fraction :- number?
  "dbt writes the percentile as a fraction (`0.95`); tolerate a percentage (`95`) too."
  [p :- number?]
  (if (> p 1) (/ p 100.0) (double p)))

(mu/defn- aggregation :- ::lib.schema.aggregation/aggregation
  "The Lib aggregation clause for the metric over `expression`, nil being a row count."
  [{:keys [agg agg-params fill-nulls-with]} :- ::schemas.ir/metric
   expression                               :- [:maybe ::sql/value]]
  (let [f      expression
        clause (case agg
                 ;; SQL COUNT(col) skips nulls, COUNT(1) does not
                 :count          (if f (lib/count-where (lib/not-null f)) (lib/count))
                 ;; a sum of the literal 1 is a row count
                 :sum            (if f (lib/sum f) (lib/count))
                 :average        (lib/avg f)
                 :min            (lib/min f)
                 :max            (lib/max f)
                 :median         (lib/median f)
                 :count_distinct (lib/distinct f)
                 ;; the expression is already the condition to count rows by
                 :sum_boolean    (lib/count-where f)
                 :percentile     (lib/percentile f (percentile-fraction (:percentile agg-params))))]
    (if (some? fill-nulls-with)
      (lib/coalesce clause fill-nulls-with)
      clause)))

(mu/defn- local-dimension :- ::schemas.ir/dimension
  "The dimension `dimension-ref` names on `model`, when it is the model's own. dbt writes a dimension reference as
  `<entity>__<dimension>`: through the model's primary entity it is one of the model's own dimensions, through any
  other entity it lives on the semantic model that entity is primary for and needs a join (QRES-4). `metric_time` is
  the measure's `agg_time_dimension`."
  [{:keys [model metric]} :- ::context
   dimension-ref          :- :string]
  (b/cond
    (= dimension-ref "metric_time")
    (or (when-let [dimension-name (:agg-time-dimension metric)]
          (m/find-first #(= dimension-name (:name %)) (:dimensions model)))
        (sql/unsupported "metric_time: the measure has no agg_time_dimension"))

    :let [[prefix dimension-name & more] (str/split dimension-ref #"__")
          own-dimension (fn [dimension-name]
                          (or (m/find-first #(= dimension-name (:name %)) (:dimensions model))
                              (sql/unsupported "dimension %s is not on semantic model %s"
                                               (pr-str dimension-name) (pr-str (:name model)))))]

    ;; no entity prefix at all
    (nil? dimension-name)
    (own-dimension prefix)

    (seq more)
    (sql/unsupported "%s reaches a dimension through entity %s, which needs a join (QRES-4)"
                     (pr-str dimension-ref) (pr-str prefix))

    (= prefix (:primary-entity model))
    (own-dimension dimension-name)

    (m/find-first #(= prefix (:name %)) (:entities model))
    (sql/unsupported "%s is on the semantic model entity %s joins to, which needs a join (QRES-4)"
                     (pr-str dimension-ref) (pr-str prefix))

    :else
    (sql/unsupported "entity %s is not on semantic model %s" (pr-str prefix) (pr-str (:name model)))))

(def ^:private grain-aliases
  "dbt granularities read as a Metabase unit of another name. A fiscal quarter is a calendar quarter until custom
  calendars are supported."
  {"fiscal_quarter" "quarter"})

(mu/defn- time-dimension-clause :- ::lib.schema.ref/ref
  "`column`, the ref for `dimension`, bucketed by `grain`, a dbt granularity name; nil means the dimension's own. Lib
  says which buckets the column supports."
  [{:keys [query]}                        :- ::context
   {:keys [granularity expr] :as dimension} :- ::schemas.ir/dimension
   column                                 :- ::sql/value
   grain                                  :- [:maybe :string]]
  (b/cond
    (not= :time (:type dimension))
    (sql/unsupported "TimeDimension(%s): %s is not a time dimension" (pr-str (:name dimension)) (pr-str (:name dimension)))

    (not= :column (:kind (parse-expr expr)))
    (sql/unsupported "cannot bucket the SQL expression %s by time" (pr-str expr))

    :let [grain  (or grain (some-> granularity name))
          unit   (if-let [aliased (grain-aliases grain)]
                   (do (log/infof "Reading the %s granularity of %s as %s" grain (:name dimension) aliased)
                       (keyword aliased))
                   (keyword grain))
          bucket (m/find-first #(= unit (:unit %)) (lib/available-temporal-buckets query column))]

    (not bucket)
    (sql/unsupported "granularity %s has no Metabase temporal unit for %s" (pr-str grain) (pr-str (:name dimension)))

    :else
    (lib/with-temporal-bucket column bucket)))

(mu/defn- reference-clause :- ::sql/value
  "The Lib expression a filter template's reference stands for."
  [{:keys [model] :as context}         :- ::context
   {:keys [kind grain], ref-name :name} :- ::sql/reference]
  (case kind
    :metric
    (sql/unsupported "Metric(%s): filters on other metrics are not supported yet (QRES-5)" (pr-str ref-name))

    :entity
    (if-let [entity (m/find-first #(= ref-name (:name %)) (:entities model))]
      (column-or-sql context (:expr entity))
      (sql/unsupported "entity %s is not on semantic model %s" (pr-str ref-name) (pr-str (:name model))))

    (:dimension :time-dimension)
    (let [dimension (local-dimension context ref-name)
          column    (column-or-sql context (:expr dimension))]
      (if (= kind :time-dimension)
        (time-dimension-clause context dimension column grain)
        column))))

(mu/defn- filter-clause :- ::lib.schema.expression/boolean
  "The Lib filter clause for one `where_sql_template`."
  [{:keys [dialect resolve-column] :as context} :- ::context
   template                                     :- :string]
  (let [{:keys [sql references]} (sql/render-filter template)]
    (when (empty? references)
      (sql/unsupported "the filter references no dimension or entity"))
    (sql/condition->mbql dialect sql (fn [identifier]
                                       (if-let [reference (get references identifier)]
                                         (reference-clause context reference)
                                         (resolve-column identifier))))))

(defn- with-context
  "Run `thunk`; an [[sql/unsupported]] it throws is rethrown with `context` in front of its message."
  [context thunk]
  (try
    (thunk)
    (catch ExceptionInfo e
      (if (sql/unsupported? e)
        (sql/unsupported "%s: %s" context (ex-message e))
        (throw e)))))

(mu/defn resolve-metric :- [:or ::schemas.resolved/metric ::schemas.ir/unsupported]
  "Resolve one IR metric against the IR `semantic-models` (keyed by name), the metadata `providers` (keyed by Metabase
  database name, see [[metadata/providers]]) and `config`, or explain why it cannot be a Metabase metric yet."
  [config          :- ::schemas.resolved/config
   providers       :- [:map-of :string ::lib.schema.metadata/metadata-provider]
   semantic-models :- [:map-of :string ::schemas.ir/semantic-model]
   {:keys [agg expr agg-params non-additive-dimension filters semantic-model fill-nulls-with] :as metric}
   :- ::schemas.ir/metric]
  (let [unsupported (fn [reason]
                      {:name      (:name metric)
                       :unique-id (:unique-id metric)
                       :reason    reason})
        {:keys [relation columns] :as model} (get semantic-models semantic-model)]
    (b/cond
      (not model)
      (unsupported (format "semantic model %s not found" (pr-str semantic-model)))

      non-additive-dimension
      (unsupported "non-additive measures have no Metabase equivalent")

      :let [percentile (:percentile agg-params)]

      (and (= agg :percentile) (nil? percentile))
      (unsupported "percentile aggregation without a percentile value")

      ;; dbt documents the percentile as a fraction; emit tolerates a percentage, so allow up to 100
      (and (= agg :percentile) (not (<= 0 percentile 100)))
      (unsupported (format "percentile %s is out of range; dbt expects a fraction between 0 and 1" percentile))

      (and (= agg :percentile) (:use_discrete_percentile agg-params))
      (unsupported "discrete percentiles have no Metabase equivalent: Metabase percentiles are continuous")

      :let [database (get-in config [:databases (:database relation)])]

      (not database)
      (unsupported (format "no Metabase database configured for warehouse database %s; add it to :databases"
                           (pr-str (:database relation))))

      :let [provider  (get providers database)
            table     (metadata/table provider (:schema relation) (:table relation))
            query     (lib/query provider table)
            context   {:query          query
                       :model          model
                       :metric         metric
                       :dialect        (sql-tools/driver->dialect (:driver config))
                       :resolve-column (partial column-ref config provider (:id table) columns)}
            converted (try
                        {:expression (with-context (str "expr " (pr-str expr))
                                       #(measure-expression context agg expr))
                         :filters    (mapv (fn [template]
                                             (with-context (str "filter " (pr-str template))
                                               #(filter-clause context template)))
                                           filters)}
                        (catch ExceptionInfo e
                          (if (sql/unsupported? e)
                            {:reason (ex-message e)}
                            (throw e))))]

      (:reason converted)
      (unsupported (:reason converted))

      :let [{:keys [expression filters]} converted
            result-type (when (and (some? fill-nulls-with) (#{:min :max} agg) expression)
                          (lib/type-of query expression))]

      ;; COALESCE(MAX(text), 0) fails in the warehouse; every other aggregation has a numeric result
      (and (known-type? result-type) (not (isa? result-type :type/Number)))
      (unsupported (format "fill_nulls_with %s on a non-numeric aggregation: %s of %s, which is %s"
                           fill-nulls-with (name agg) (pr-str expr) result-type))

      :else
      {:metric            metric
       :entity-id         (metric-entity-id metric)
       :metadata-provider provider
       :query             (reduce lib/filter
                                  (lib/aggregate query (aggregation metric expression))
                                  filters)})))

(mu/defn resolve-manifest :- ::schemas.resolved/manifest
  "Resolve every metric in the IR. Unsupported metrics from the parse stage are carried over, so the result's
  `:unsupported` is the complete list for the run."
  [config                                                     :- ::schemas.resolved/config
   {:keys [semantic-models metrics unsupported source] :as ir} :- ::schemas.ir/manifest]
  (let [providers                     (metadata/providers config ir)
        {resolved false, failed true} (->> metrics
                                           (map #(resolve-metric config providers semantic-models %))
                                           (group-by #(contains? % :reason)))]
    {:collection  {:name      (:collection-name config "dbt metrics")
                   :entity-id (collection-entity-id (:project source))}
     :metrics     (vec resolved)
     :unsupported (into (vec unsupported) failed)}))
