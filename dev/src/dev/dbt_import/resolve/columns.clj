(ns dev.dbt-import.resolve.columns
  "The first part of the resolve stage: binding a metric to its semantic model's table and columns.

  A [[metric-context]] is everything the rest of the stage needs to resolve one metric: a Lib query over the model's
  table in the [[dev.dbt-import.metadata]] provider for its database, and a callback that turns a bare column name,
  as a measure's `expr` or a filter writes it, into a Lib ref ([[column-ref]]). The manifest's column list is
  documentation, not the warehouse schema: a project may declare no `data_type`, or not document the column at all.
  Such a column is a Field of unknown type in the provider (see [[metadata/column]]); the instance supplies the type
  when the serdes import binds the field, and a column that does not exist fails there, with the authoritative
  metadata.

  A dimension reached through another entity is on the semantic model that has the entity as its primary or a unique
  entity, and its column is reached by an implicit join through the entity's column on this model. [[join-context]]
  is the context for that model: the same metric, with the joined model's columns resolving to refs that carry the
  join."
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

(mr/def ::context
  "What resolving one metric's SQL needs: the query being built, the semantic model whose columns bare identifiers
  name, the SQL dialect, and the callback that turns one of that model's column names into a Lib ref. Of the metric
  itself, what the dimensions need: its unique id, which seeds their ids, its `agg_time_dimension`, which `metric_time`
  and the default dimension refer to, and its `time_granularity`. `config`, `provider` and `semantic-models` (every
  semantic model, by name) are what [[join-context]] needs to make the same kind of context for a semantic model a
  foreign entity joins to."
  [:map {:closed true}
   [:config             ::resolved/config]
   [:provider           ::lib.schema.metadata/metadata-provider]
   [:semantic-models    [:map-of :string ::ir/semantic-model]]
   [:query              ::lib.schema/query]
   [:model              ::ir/semantic-model]
   [:metric-unique-id   :string]
   [:agg-time-dimension [:maybe :string]]
   [:time-granularity   [:maybe :string]]
   [:dialect            ::sql/dialect]
   [:resolve-column     ::sql/resolve-column]])

(mu/defn- check-declared-type! :- :nil
  "[[unsupported/throw!]] when `column`, as the project documents it, declares a `data_type` the driver does not map
  to a base type; the fix is a mapping in the driver (see [[resolved/driver]]). No column, or no `data_type`, is fine:
  the column's type is unknown and the instance supplies it."
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
  [{:keys [dialect resolve-column]} :- ::context
   expr                             :- :string]
  (let [{:keys [kind], column-name :name} (parse-expr expr)]
    (case kind
      :column (resolve-column column-name)
      :sql    (sql/expression->mbql dialect expr resolve-column)
      (unsupported/throw! "%s is neither a column nor a SQL expression" (pr-str expr)))))

(mu/defn own-entity :- ::ir/entity
  "The entity named `entity-name` on `context`'s model."
  [{:keys [model]} :- ::context
   entity-name     :- :string]
  (or (m/find-first #(= entity-name (:name %)) (:entities model))
      (unsupported/throw! "entity %s is not on semantic model %s" (pr-str entity-name) (pr-str (:name model)))))

(mu/defn- entity-column-name :- [:maybe :string]
  "The column `entity`'s expr names; nil when the expr is SQL, which an implicit join has no use for: it needs a
  column on each side."
  [{:keys [expr]} :- ::ir/entity]
  (let [{:keys [kind], column-name :name} (parse-expr expr)]
    (when (= kind :column)
      column-name)))

(mu/defn- keyed-by? :- :boolean
  "Whether a reference through `entity-name` can join to `model`: the entity is the model's primary entity, or one of
  its `unique` entities. Either identifies one row of the model, which is what a join from another model needs; a
  `foreign` or `natural` entity does not."
  [{:keys [primary-entity entities]} :- ::ir/semantic-model
   entity-name                       :- :string]
  (boolean (or (= entity-name primary-entity)
               (m/find-first #(and (= entity-name (:name %)) (= :unique (:type %))) entities))))

(mu/defn join-targets :- [:sequential ::ir/semantic-model]
  "The semantic models a reference through `entity-name` from `context`'s model can join to: the other models that
  are [[keyed-by?]] it, by name. An entity joins to the one such model."
  [{:keys [semantic-models model]} :- ::context
   entity-name                     :- :string]
  (->> (vals semantic-models)
       (filter #(and (not= (:name %) (:name model)) (keyed-by? % entity-name)))
       (sort-by :name)))

(mu/defn join-context :- ::context
  "A context for the semantic model the `entity` of `context`'s model joins to (see [[join-targets]]): bare column
  names resolve to that model's columns, reached through the entity's column on this model. Metabase spells that
  `:source-field` on the ref and joins implicitly, so the instance's metadata has to know the foreign key for the query
  to run. [[unsupported/throw!]] when there is no such model, more than one that the config's `:entity-models` does
  not choose between, the join column on either side is SQL, or the model is in another Metabase database."
  [{:keys [config provider resolve-column] :as context} :- ::context
   {entity-name :name, :as entity}                      :- ::ir/entity]
  (b/cond
    :let [candidates (join-targets context entity-name)
          chosen     (get-in config [:entity-models entity-name])]

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

    :let [target        (if (next candidates)
                          (m/find-first #(= chosen (:name %)) candidates)
                          (first candidates))
          target-entity (m/find-first #(= entity-name (:name %)) (:entities target))]

    (not target-entity)
    (unsupported/throw! "semantic model %s names %s as its primary_entity but has no entity of that name to join on"
                        (pr-str (:name target)) (pr-str entity-name))

    :let [database (metadata/model-database config target)]

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
          table  (metadata/model-table provider target)]

    :else
    (assoc context
           :model          target
           :resolve-column (fn [column-name]
                             (-> (column-ref config provider (:id table) (:columns target) column-name)
                                 (lib/update-options assoc :source-field (lib/field-ref-id fk-ref)))))))

(mu/defn metric-context :- ::context
  "The context for resolving the metric `ir` against `model`: the provider for the model's database, a query over its
  table and a callback for its columns. `agg-time-dimension` is the metric's own for a simple metric; a ratio or
  derived metric takes its inputs' (see [[dev.dbt-import.resolve/resolve-composed]]). [[unsupported/throw!]] when the
  config maps the model's warehouse database to no Metabase database."
  [config                              :- ::resolved/config
   providers                           :- [:map-of :string ::lib.schema.metadata/metadata-provider]
   semantic-models                     :- [:map-of :string ::ir/semantic-model]
   {:keys [columns] :as model}         :- ::ir/semantic-model
   {:keys [unique-id time-granularity]} :- ::ir/metric
   agg-time-dimension                  :- [:maybe :string]]
  (let [database (metadata/model-database config model)]
    (when-not database
      (unsupported/throw! "no Metabase database configured for warehouse database %s; add it to :databases"
                          (pr-str (-> model :relation :database))))
    (let [provider (get providers database)
          table    (metadata/model-table provider model)]
      {:config             config
       :provider           provider
       :semantic-models    semantic-models
       :query              (lib/query provider table)
       :model              model
       :metric-unique-id   unique-id
       :agg-time-dimension agg-time-dimension
       :time-granularity   time-granularity
       :dialect            (sql-tools/driver->dialect (:driver config))
       :resolve-column     (partial column-ref config provider (:id table) columns)})))
