(ns dev.dbt-import.resolve.columns
  "The first part of the resolve stage: binding a metric to its semantic model's table and columns.

  An [[env]] is what a run shares between all its metrics: the config, a metadata provider per Metabase database,
  the semantic models by name and the SQL dialect. A [[metric-context]] is that plus everything the rest of the stage
  needs to resolve one metric: a Lib query over its semantic model's table in the [[dev.dbt-import.metadata]] provider
  for its database, and a callback that turns a bare column name, as a measure's `expr` or a filter writes it, into a
  Lib ref ([[column-ref]]). The manifest's column list is documentation, not the warehouse schema: a project may
  declare no `data_type`, or not document the column at all. Such a column is a Field of unknown type in the provider
  (see [[metadata/column]]); the instance supplies the type when the serdes import binds the field. A column that does
  not exist does not fail the import, which makes up an inactive Field for it; [[dev.dbt-import.preflight/check]]
  reports it before the import, and the card fails when run otherwise. No emitted ref carries a type for the same
  reason: Lib merges a ref's options over the Field's own metadata, so a type guessed at convert time would override
  the instance's (see [[dev.dbt-import.resolve/without-ref-types]]).

  A dimension reached through another entity is on the semantic model that has the entity as its primary or a unique
  entity, and its column is reached by an implicit join through the entity's column on this semantic model.
  [[join-context]] is the context for that semantic model: the same metric, with the joined semantic model's columns
  resolving to refs that carry the join."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [dev.dbt-import.metadata :as metadata]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.schemas.resolved :as resolved]
   [dev.dbt-import.sql :as sql]
   [dev.dbt-import.unsupported :as unsupported]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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
  "What an IR `expr` is, see [[parse-expr]]."
  [:map {:closed true}
   [:kind  [:enum :column :literal :wildcard :sql]]
   [:name  {:optional true} :string]
   [:value {:optional true} :string]])

(mu/defn parse-expr :- ::parsed-expr
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

(mr/def ::env
  "What one run of the resolve stage shares between all its metrics, built once by [[env]]: the config; a
  [[dev.dbt-import.metadata]] provider for every Metabase database the config maps to, by name (see
  [[metadata/providers]]), which the metrics' cards are added to as they are converted; every semantic model, by name;
  and the SQL dialect of the config's driver, which the measure and filter SQL is parsed in."
  [:map {:closed true}
   [:config          ::resolved/config]
   [:providers       [:map-of :string ::lib.schema.metadata/metadata-provider]]
   [:semantic-models [:map-of :string ::ir/semantic-model]]
   [:dialect         ::sql/dialect]])

(mr/def ::context
  "What resolving one metric's SQL needs, over the run's [[env]]: the provider for the metric's database, the query
  being built, the semantic model whose columns bare identifiers name, and the callback that turns one of that
  semantic model's column names into a Lib ref. Of the metric itself, what the dimensions need: its unique id, which
  seeds their ids, its `agg_time_dimension`, which `metric_time` and the default dimension refer to, and its
  `time_granularity`. [[join-context]] makes the same kind of context for a semantic model a foreign entity joins to."
  [:map {:closed true}
   [:env                ::env]
   [:provider           ::lib.schema.metadata/metadata-provider]
   [:query              ::lib.schema/query]
   [:semantic-model     ::ir/semantic-model]
   [:metric-unique-id   :string]
   [:agg-time-dimension [:maybe :string]]
   [:time-granularity   [:maybe :string]]
   [:resolve-column     ::sql/resolve-column]])

(mu/defn env :- ::env
  "The `::env` of a run of the resolve stage over the IR `ir` with `config`: built once, shared by every metric."
  [config :- ::resolved/config
   ir     :- ::ir/manifest]
  {:config          config
   :providers       (metadata/providers config ir)
   :semantic-models (:semantic-models ir)
   :dialect         (sql-tools/driver->dialect (:driver config))})

(mu/defn- check-declared-type! :- :nil
  "[[unsupported/throw!]] when `column`, as the project documents it, declares a `data_type` the driver does not map
  to a base type; the fix is a mapping in the driver (see [[metadata/base-type]] and the `::resolved/driver` schema).
  No column, or no `data_type`, is fine: the column's type is unknown and the instance supplies it."
  [config :- ::resolved/config
   column :- [:maybe ::ir/column]]
  (when-let [data-type (some-> (:data-type column) str/trim not-empty)]
    (when-not (metadata/base-type (:driver config) data-type)
      (unsupported/throw! "no base type known for column %s of type %s: the %s driver has no mapping for it"
                          (pr-str (:name column)) (pr-str data-type) (name (:driver config))))))

(mu/defn column-ref :- ::lib.schema.ref/ref
  "Lib ref for `column-name` on `table-id`, by its documented spelling when the project documents it in `columns`
  (see [[metadata/find-named]])."
  [config      :- ::resolved/config
   provider    :- ::lib.schema.metadata/metadata-provider
   table-id    :- ::lib.schema.id/table
   columns     :- [:map-of :string ::ir/column]
   column-name :- :string]
  (let [column (metadata/find-named (vals columns) column-name)]
    (check-declared-type! config column)
    (lib/ref (metadata/column provider table-id (or (:name column) column-name)))))

(mu/defn known-type? :- :boolean
  "Is `base-type` a type, rather than the `:type/*` of a column the manifest does not type?"
  [base-type :- [:maybe ::lib.schema.common/base-type]]
  (boolean (and base-type (not= base-type :type/*))))

(mu/defn column-or-sql :- ::sql/value
  "The Lib expression for a dimension's or entity's `expr`: a bare column name, or a SQL expression."
  [{:keys [env resolve-column]} :- ::context
   expr                         :- :string]
  (let [{:keys [kind], column-name :name} (parse-expr expr)]
    (case kind
      :column (resolve-column column-name)
      :sql    (sql/expression->mbql (:dialect env) expr resolve-column)
      (unsupported/throw! "%s is neither a column nor a SQL expression" (pr-str expr)))))

(mu/defn own-entity :- ::ir/entity
  "The entity named `entity-name` on `context`'s semantic model."
  [{:keys [semantic-model]} :- ::context
   entity-name              :- :string]
  (or (m/find-first #(= entity-name (:name %)) (:entities semantic-model))
      (unsupported/throw! "entity %s is not on semantic model %s"
                          (pr-str entity-name) (pr-str (:name semantic-model)))))

(mu/defn- entity-column-name :- [:maybe :string]
  "The column `entity`'s expr names; nil when the expr is SQL, which an implicit join has no use for: it needs a
  column on each side."
  [{:keys [expr]} :- ::ir/entity]
  (let [{:keys [kind], column-name :name} (parse-expr expr)]
    (when (= kind :column)
      column-name)))

(mu/defn- keyed-by? :- :boolean
  "Whether a reference through `entity-name` can join to `semantic-model`: the entity is the semantic model's primary
  entity, or one of its `unique` entities. Either identifies one row of the semantic model, which is what a join from
  another semantic model needs; a `foreign` or `natural` entity does not."
  [{:keys [primary-entity entities]} :- ::ir/semantic-model
   entity-name                       :- :string]
  (boolean (or (= entity-name primary-entity)
               (m/find-first #(and (= entity-name (:name %)) (= :unique (:type %))) entities))))

(mu/defn- other-semantic-models :- [:sequential ::ir/semantic-model]
  "The semantic models other than `context`'s that satisfy `pred`, by name."
  [{:keys [env semantic-model]} :- ::context
   pred                         :- [:=> [:cat ::ir/semantic-model] :any]]
  (->> (vals (:semantic-models env))
       (filter #(and (not= (:name %) (:name semantic-model)) (pred %)))
       (sort-by :name)))

(mu/defn join-targets :- [:sequential ::ir/semantic-model]
  "The semantic models a reference through `entity-name` from `context`'s semantic model can join to: the other
  semantic models that are [[keyed-by?]] it, by name. An entity joins to the one such semantic model."
  [context     :- ::context
   entity-name :- :string]
  (other-semantic-models context #(keyed-by? % entity-name)))

(mu/defn natural-targets :- [:sequential ::ir/semantic-model]
  "The semantic models other than `context`'s that have `entity-name` as a `natural` entity: slowly changing
  dimensions (dbt's SCD type II) whose rows are versions of one thing, told apart by the validity window of their
  time dimensions. MetricFlow joins to such a semantic model through the window; an implicit join cannot, so these are
  the semantic models a reference through `entity-name` would have reached (see [[join-target]])."
  [context     :- ::context
   entity-name :- :string]
  (other-semantic-models context (fn [{:keys [entities]}]
                                   (m/find-first #(and (= entity-name (:name %)) (= :natural (:type %))) entities))))

(mu/defn- join-target :- ::ir/semantic-model
  "The one semantic model a reference through `entity-name` from `context`'s semantic model joins to, among
  [[join-targets]]: the only one, or the one the config's `:entity-models` names when there are several.
  [[unsupported/throw!]] when there is none, when there are several that `:entity-models` does not choose between, or
  when the semantic model it names is not one of them. A natural entity is reported as such (see [[natural-targets]]),
  since the dimensions behind it exist and are not reached."
  [{:keys [env] :as context} :- ::context
   entity-name               :- :string]
  (b/cond
    :let [candidates (join-targets context entity-name)
          chosen     (get-in env [:config :entity-models entity-name])]

    (and (empty? candidates) (seq (natural-targets context entity-name)))
    (unsupported/throw! (str "entity %s is the natural entity of semantic model %s, a slowly changing dimension;"
                             " a join to it needs the validity window of its time dimensions, which an implicit"
                             " join cannot express")
                        (pr-str entity-name)
                        (str/join ", " (map (comp pr-str :name) (natural-targets context entity-name))))

    (empty? candidates)
    (unsupported/throw! "no semantic model has entity %s as its primary or a unique entity" (pr-str entity-name))

    (and (next candidates) (not chosen))
    (unsupported/throw! (str "more than one semantic model has entity %s as its primary or a unique entity: %s;"
                             " name the one to join to in :entity-models")
                        (pr-str entity-name) (str/join ", " (map (comp pr-str :name) candidates)))

    (and (next candidates) (not (some #(= chosen (:name %)) candidates)))
    (unsupported/throw! (str ":entity-models names semantic model %s for entity %s, but the models with it as their"
                             " primary or a unique entity are %s")
                        (pr-str chosen) (pr-str entity-name) (str/join ", " (map (comp pr-str :name) candidates)))

    (next candidates)
    (m/find-first #(= chosen (:name %)) candidates)

    :else
    (first candidates)))

(mu/defn join-context :- ::context
  "A context for the semantic model the `entity` of `context`'s semantic model joins to (see [[join-target]]): bare
  column names resolve to that semantic model's columns, reached through the entity's column on this one. Metabase
  spells that `:source-field` on the ref and joins implicitly, so the instance's metadata has to know the foreign key
  for the query to run. [[unsupported/throw!]] when there is no such semantic model, more than one that the config's
  `:entity-models` does not choose between, the join column on either side is SQL, or the semantic model is in another
  Metabase database. A semantic model whose `primary_entity` names no entity of its own (dbt's virtual primary entity)
  has no column to join on, and is reported too."
  [{:keys [env provider resolve-column] :as context} :- ::context
   {entity-name :name, :as entity}                   :- ::ir/entity]
  (b/cond
    :let [target        (join-target context entity-name)
          target-entity (m/find-first #(= entity-name (:name %)) (:entities target))]

    (not target-entity)
    (unsupported/throw! "semantic model %s names %s as its primary_entity but has no entity of that name to join on"
                        (pr-str (:name target)) (pr-str entity-name))

    :let [database (metadata/semantic-model-database (:config env) target)]

    (not= database (metadata/database-name provider))
    (unsupported/throw! "semantic model %s is in Metabase database %s, not %s; a join across databases is not supported"
                        (pr-str (:name target)) (pr-str database) (pr-str (metadata/database-name provider)))

    :let [fk-column (entity-column-name entity)]

    (not fk-column)
    (unsupported/throw! "entity %s is the SQL expression %s, not a column; an implicit join needs a column"
                        (pr-str entity-name) (pr-str (:expr entity)))

    (not (entity-column-name target-entity))
    (unsupported/throw! (str "entity %s on semantic model %s is the SQL expression %s, not a column; an implicit join"
                             " needs a column")
                        (pr-str entity-name) (pr-str (:name target)) (pr-str (:expr target-entity)))

    :let [fk-ref (resolve-column fk-column)
          table  (metadata/semantic-model-table provider target)]

    :else
    (assoc context
           :semantic-model target
           :resolve-column (fn [column-name]
                             (-> (column-ref (:config env) provider (:id table) (:columns target) column-name)
                                 (lib/update-options assoc :source-field (lib/field-ref-id fk-ref)))))))

(mu/defn metric-context :- ::context
  "The context for resolving the metric `ir` against `semantic-model` in `env`: the provider for the semantic model's
  database, a query over its table and a callback for its columns. `agg-time-dimension` is the metric's own for a
  simple metric; a ratio or derived metric takes its inputs' (see [[dev.dbt-import.resolve/resolve-composed]]).
  [[unsupported/throw!]] when the config maps the semantic model's warehouse database to no Metabase database."
  [{:keys [config providers] :as env}    :- ::env
   {:keys [columns] :as semantic-model}  :- ::ir/semantic-model
   {:keys [unique-id time-granularity]}  :- ::ir/metric
   agg-time-dimension                    :- [:maybe :string]]
  (let [database (metadata/semantic-model-database config semantic-model)]
    (when-not database
      (unsupported/throw! "no Metabase database configured for warehouse database %s; add it to :databases"
                          (pr-str (-> semantic-model :relation :database))))
    (let [provider (get providers database)
          table    (metadata/semantic-model-table provider semantic-model)]
      {:env                env
       :provider           provider
       :query              (lib/query provider table)
       :semantic-model     semantic-model
       :metric-unique-id   unique-id
       :agg-time-dimension agg-time-dimension
       :time-granularity   time-granularity
       :resolve-column     (partial column-ref config provider (:id table) columns)})))
