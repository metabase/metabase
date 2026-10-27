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
  `metric_time`) is one of its columns; one reached through a foreign entity is on the semantic model that entity is
  primary for, and its column is reached by an implicit join through the entity's column on this model (see
  [[join-context]]).

  Each metric also gets its curated dimension set (see [[dimension-set]]): the dbt dimensions of its own semantic
  model, the dimensions of every semantic model its foreign entities join to, and the measure's `agg_time_dimension`
  as the default. A dimension mapping targets a column, so a dimension whose `expr` is SQL is reported per metric
  rather than written.

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
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
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
  "What resolving one metric's SQL needs: the query being built, the semantic model whose columns bare identifiers
  name, the metric, the SQL dialect, and the callback that turns one of that model's column names into a Lib ref.
  `config`, `provider` and `models` (every semantic model, by name) are what [[join-context]] needs to make the same
  kind of context for a semantic model a foreign entity joins to."
  [:map
   [:config         ::schemas.resolved/config]
   [:provider       ::lib.schema.metadata/metadata-provider]
   [:models         [:map-of :string ::schemas.ir/semantic-model]]
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

(mu/defn- entity-column :- :string
  "The column `entity`'s expr names. An implicit join needs a column on each side, so an entity whose expr is SQL is
  [[sql/unsupported]]."
  [{entity-name :name, :keys [expr]} :- ::schemas.ir/entity]
  (let [{:keys [kind], column-name :name} (parse-expr expr)]
    (if (= kind :column)
      column-name
      (sql/unsupported "entity %s is the SQL expression %s, not a column; an implicit join needs a column"
                       (pr-str entity-name) (pr-str expr)))))

(mu/defn- models-primary-for :- [:sequential ::schemas.ir/semantic-model]
  "The semantic models that have `entity-name` as their primary entity, by name. A foreign entity joins to the one
  such model."
  [{:keys [models]} :- ::context
   entity-name      :- :string]
  (->> (vals models)
       (filter #(= entity-name (:primary-entity %)))
       (sort-by :name)))

(mu/defn- join-context :- ::context
  "A context for the semantic model the foreign `entity` of `context`'s model joins to: bare column names resolve to
  that model's columns, reached through the entity's column on this model. Metabase spells that `:source-field` on
  the ref and joins implicitly, so the instance's metadata has to know the foreign key for the query to run.
  [[sql/unsupported]] when there is no such model, more than one, the join column on either side is SQL, or the model
  is in another Metabase database."
  [{:keys [config provider resolve-column] :as context} :- ::context
   {entity-name :name, :as entity}                      :- ::schemas.ir/entity]
  (b/cond
    :let [candidates (models-primary-for context entity-name)]

    (empty? candidates)
    (sql/unsupported "no semantic model has entity %s as its primary entity" (pr-str entity-name))

    (next candidates)
    (sql/unsupported "more than one semantic model has entity %s as its primary entity: %s"
                     (pr-str entity-name) (str/join ", " (map (comp pr-str :name) candidates)))

    :let [target        (first candidates)
          target-entity (m/find-first #(= entity-name (:name %)) (:entities target))]

    (not target-entity)
    (sql/unsupported "semantic model %s names %s as its primary_entity but has no entity of that name to join on"
                     (pr-str (:name target)) (pr-str entity-name))

    :let [{:keys [relation]} target
          database           (get-in config [:databases (:database relation)])]

    (not= database (metadata/database-name provider))
    (sql/unsupported "semantic model %s is in Metabase database %s, not %s; a join across databases is not supported"
                     (pr-str (:name target)) (pr-str database) (pr-str (metadata/database-name provider)))

    :let [fk-ref (resolve-column (entity-column entity))
          table  (metadata/table provider (:schema relation) (:table relation))]

    :do (entity-column target-entity)

    :else
    (assoc context
           :model          target
           :resolve-column (fn [column-name]
                             (-> (column-ref config provider (:id table) (:columns target) column-name)
                                 (lib/update-options assoc :source-field (nth fk-ref 2)))))))

(mr/def ::dimension-reference
  "A dbt dimension and the context whose columns its expr is written against."
  [:map
   [:dimension ::schemas.ir/dimension]
   [:context   ::context]])

(mu/defn- own-dimension :- ::dimension-reference
  "The dimension named `dimension-name` on `context`'s model."
  [{:keys [model] :as context} :- ::context
   dimension-name              :- :string]
  (if-let [dimension (m/find-first #(= dimension-name (:name %)) (:dimensions model))]
    {:dimension dimension, :context context}
    (sql/unsupported "dimension %s is not on semantic model %s" (pr-str dimension-name) (pr-str (:name model)))))

(mu/defn- dimension-reference :- ::dimension-reference
  "The dimension `dimension-ref` names and the context its expr is written against. dbt writes a dimension reference
  as `<entity>__<dimension>`: through the model's primary entity it is one of the model's own dimensions, through a
  foreign entity it is on the semantic model that entity is primary for (see [[join-context]]). `metric_time` is the
  measure's `agg_time_dimension`."
  [{:keys [model metric] :as context} :- ::context
   dimension-ref                      :- :string]
  (b/cond
    (= dimension-ref "metric_time")
    (if-let [dimension-name (:agg-time-dimension metric)]
      (own-dimension context dimension-name)
      (sql/unsupported "metric_time: the measure has no agg_time_dimension"))

    :let [[prefix dimension-name & more] (str/split dimension-ref #"__")]

    ;; no entity prefix at all
    (nil? dimension-name)
    (own-dimension context prefix)

    (seq more)
    (sql/unsupported "%s reaches a dimension through more than one entity, which is not supported" (pr-str dimension-ref))

    (= prefix (:primary-entity model))
    (own-dimension context dimension-name)

    :let [entity (m/find-first #(= prefix (:name %)) (:entities model))]

    entity
    (own-dimension (join-context context entity) dimension-name)

    :else
    (sql/unsupported "entity %s is not on semantic model %s" (pr-str prefix) (pr-str (:name model)))))

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
      unit)))

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
          unit   (grain->unit grain (:name dimension))
          bucket (when unit
                   (m/find-first #(= unit (:unit %)) (lib/available-temporal-buckets query column)))]

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
    (let [{:keys [dimension context]} (dimension-reference context ref-name)
          column                      (column-or-sql context (:expr dimension))]
      (if (= kind :time-dimension)
        (time-dimension-clause context dimension column grain)
        column))))

(mu/defn- dimension-id :- ::lib-metric.schema/dimension-id
  "The id of the curated dimension `reference` (`<entity>__<dimension>`, or a bare name for the model's own) of the
  metric `metric-unique-id`. Derived, not generated, so a re-run writes the same ids and a re-import updates the
  dimensions in place; scoped to the metric, as Metabase scopes the ids it computes (see
  `metabase.lib-metric.dimension.jvm/dimension-id`)."
  [metric-unique-id :- :string
   reference        :- :string]
  (u/name-uuid (str "dbt-import/dimension/" metric-unique-id "/" reference)))

(mu/defn- dimension-group :- ::lib.schema.metadata/dimension-group
  "The group of the dimensions of `model`: the metric's own table (`main`) or one joined to (`connection`), named
  after the model's label, or its table when it has none. The id is derived the way
  `metabase.lib-metric.dimension.jvm/group-id` derives it, so these are the groups the instance computes."
  [group-type               :- [:enum "main" "connection"]
   {:keys [label relation]} :- ::schemas.ir/semantic-model]
  (let [display-name (or label (:table relation))]
    {:id           (u/name-uuid (str group-type "/" display-name))
     :type         group-type
     :display-name display-name}))

(mu/defn- default-temporal-unit :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "The unit a time dimension's `granularity` names, when Lib can bucket `column` by it; nil otherwise."
  [{:keys [query]}                             :- ::context
   {:keys [granularity], dimension-name :name} :- ::schemas.ir/dimension
   column                                      :- ::lib.schema.ref/ref]
  (when granularity
    (when-let [unit (grain->unit (name granularity) dimension-name)]
      (when (m/find-first #(= unit (:unit %)) (lib/available-temporal-buckets query column))
        unit))))

(mr/def ::dimension-pair
  "A curated dimension and the mapping that binds it to a column."
  [:map
   [:dimension ::lib-metric.schema/persisted-dimension]
   [:mapping   ::lib-metric.schema/dimension-mapping]])

(mu/defn- dimension-pair :- ::dimension-pair
  "The curated dimension and mapping for the dbt `dimension` of `context`'s model, in `group`. `reference` is the
  dbt spelling of the dimension from the metric's model, which seeds the id. A dimension mapping targets a column, so
  a dimension whose expr is anything else is [[sql/unsupported]]."
  [{:keys [query provider metric resolve-column] :as context}                      :- ::context
   group                                                                           :- ::lib.schema.metadata/dimension-group
   reference                                                                       :- :string
   {dimension-name :name, dimension-type :type, :keys [expr label], :as dimension} :- ::schemas.ir/dimension]
  (let [{:keys [kind], column-name :name} (parse-expr expr)]
    (case kind
      :sql    (sql/unsupported "dimension %s is the SQL expression %s; a dimension mapping targets a column, not SQL"
                               (pr-str dimension-name) (pr-str expr))
      :column nil
      (sql/unsupported "dimension %s is %s, not a column" (pr-str dimension-name) (pr-str expr)))
    (let [column-ref (resolve-column column-name)
          field-id   (nth column-ref 2)
          field      (lib.metadata/field provider field-id)
          base-type  (lib/type-of query column-ref)
          unit       (when (= dimension-type :time)
                       (default-temporal-unit context dimension column-ref))
          id         (dimension-id (:unique-id metric) reference)]
      {:dimension (cond-> {:id           id
                           :name         dimension-name
                           :display-name (or label dimension-name)
                           :sources      [{:type :field, :field-id field-id}]
                           :group        group}
                    (known-type? base-type) (assoc :effective-type base-type)
                    unit                    (assoc :default-temporal-unit unit))
       :mapping   {:type         :table
                   :table-id     (:table-id field)
                   :dimension-id id
                   :target       column-ref}})))

(mr/def ::dimension-result
  "A [[dimension-pair]], or why a dbt dimension could not become one."
  [:or ::dimension-pair ::schemas.resolved/unsupported-dimension])

(mu/defn- model-dimensions :- [:sequential ::dimension-result]
  "A [[dimension-pair]] for every dimension of `context`'s model, or the reason it cannot be one. `entity-name`
  prefixes the dimensions' references; nil for the metric's own model."
  [{:keys [model] :as context} :- ::context
   group                       :- ::lib.schema.metadata/dimension-group
   entity-name                 :- [:maybe :string]]
  (vec (for [{dimension-name :name, :as dimension} (:dimensions model)
             :let [reference (if entity-name (str entity-name "__" dimension-name) dimension-name)]]
         (try
           (dimension-pair context group reference dimension)
           (catch ExceptionInfo e
             (if (sql/unsupported? e)
               {:name dimension-name, :reason (ex-message e)}
               (throw e)))))))

(mu/defn- joined-dimensions :- [:sequential ::dimension-result]
  "The dimensions reached through the foreign `entity` of `context`'s model, see [[join-context]]. When the join
  itself cannot be made, every dimension of the models the entity would join to is reported with the reason, so a
  dimension the project declares is never silently dropped; an entity no model is primary for has no dimensions
  behind it, and is just a key."
  [context                         :- ::context
   {entity-name :name, :as entity} :- ::schemas.ir/entity]
  (try
    (let [{:keys [model] :as join} (join-context context entity)]
      (model-dimensions join (dimension-group "connection" model) entity-name))
    (catch ExceptionInfo e
      (if (sql/unsupported? e)
        (vec (for [target    (models-primary-for context entity-name)
                   dimension (:dimensions target)]
               {:name (:name dimension), :reason (ex-message e)}))
        (throw e)))))

(mr/def ::dimension-set
  "A metric's curated dimensions, their mappings, and the dbt dimensions that could not become one."
  [:map
   [:dimensions             ::lib-metric.schema/persisted-dimensions]
   [:dimension-mappings     [:sequential ::lib-metric.schema/dimension-mapping]]
   [:unsupported-dimensions [:sequential ::schemas.resolved/unsupported-dimension]]])

(mu/defn- with-default-dimension :- [:sequential ::dimension-result]
  "`results` with the metric's `agg_time_dimension`, one of its own model's dimensions, marked as the default. An
  `agg_time_dimension` that is not a dimension of the model is reported; one that is but could not be converted
  already is."
  [{:keys [model metric]} :- ::context
   results                :- [:sequential ::dimension-result]]
  (b/cond
    :let [agg-time-dimension (:agg-time-dimension metric)]

    (nil? agg-time-dimension)
    results

    (not (m/find-first #(= agg-time-dimension (:name %)) (:dimensions model)))
    (conj results {:name   agg-time-dimension
                   :reason (format "agg_time_dimension %s is not a dimension of semantic model %s"
                                   (pr-str agg-time-dimension) (pr-str (:name model)))})

    :else
    (mapv (fn [result]
            (cond-> result
              (and (:dimension result)
                   (= agg-time-dimension (-> result :dimension :name))
                   (= "main" (-> result :dimension :group :type)))
              (assoc-in [:dimension :default] true)))
          results)))

(mu/defn- dimension-set :- ::dimension-set
  "The curated dimension set of the metric `context` is for: its own model's dimensions first, then those reached
  through each of its foreign entities, in the order the model declares them."
  [{:keys [model] :as context} :- ::context]
  (let [results (with-default-dimension
                 context
                 (into (model-dimensions context (dimension-group "main" model) nil)
                       (comp (filter #(= :foreign (:type %)))
                             (mapcat #(joined-dimensions context %)))
                       (:entities model)))
        pairs   (filter :mapping results)]
    {:dimensions             (mapv :dimension pairs)
     :dimension-mappings     (mapv :mapping pairs)
     :unsupported-dimensions (filterv :reason results)}))

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
            context   {:config         config
                       :provider       provider
                       :models         semantic-models
                       :query          query
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
      (merge {:metric            metric
              :entity-id         (metric-entity-id metric)
              :metadata-provider provider
              :query             (reduce lib/filter
                                         (lib/aggregate query (aggregation metric expression))
                                         filters)}
             (dimension-set context)))))

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
