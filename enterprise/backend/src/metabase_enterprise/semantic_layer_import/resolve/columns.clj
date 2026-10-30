(ns metabase-enterprise.semantic-layer-import.resolve.columns
  "The first part of the resolve stage: binding a metric to its table and columns.

  An [[env]] is what a run shares between all its metrics: the config, the source, a metadata provider per Metabase
  database, the IR tables by name and the SQL dialect. A [[metric-context]] is that plus everything the rest of the
  stage needs to resolve one metric: a Lib query over its table in the
  [[metabase-enterprise.semantic-layer-import.metadata]] provider for its database, and a callback that turns a bare
  column name, as an aggregation's `expr` or a filter writes it, into a Lib ref ([[column-ref]]). The project's column
  list is documentation, not the warehouse schema: a project may declare no `data_type`, or not document the column at
  all. Such a column is a Field of unknown type in the provider (see [[metadata/column]]); the instance supplies the
  type when the serdes import binds the field. A column that does not exist does not fail the import, which makes up
  an inactive Field for it; [[metabase-enterprise.semantic-layer-import.preflight/check]] reports it before the
  import, and the card fails when run otherwise. No emitted ref carries a type for the same reason: Lib merges a ref's
  options over the Field's own metadata, so a type guessed at import time would override the instance's (see
  [[metabase-enterprise.semantic-layer-import.resolve.metrics/without-ref-types]]).

  A dimension reached through a join is on the table the join leads to, and its column is reached by an implicit join
  through the join's source column on the metric's table. [[join-context]] is the context for that table: the same
  metric, with the joined table's columns resolving to refs that carry the join."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.metadata :as metadata]
   [metabase-enterprise.semantic-layer-import.schemas.config :as config]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.sql :as sql]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.sql-to-mbql.core :as sql-to-mbql]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::env
  "What one run of the resolve stage shares between all its metrics, built once by [[env]]: the config; the source,
  whose tool prefixes the ids derived (see [[metabase-enterprise.semantic-layer-import.ids]]); a
  [[metabase-enterprise.semantic-layer-import.metadata]] provider for every Metabase database the config maps to, by
  name (see [[metadata/providers]]), which the metrics' cards are added to as they are converted; every IR table, by
  name; and the SQL dialect of the config's driver, which the SQL of aggregations and filters is parsed in."
  [:map {:closed true}
   [:config    ::config/config]
   [:source    ::ir/source]
   [:providers [:map-of :string ::lib.schema.metadata/metadata-provider]]
   [:tables    [:map-of :string ::ir/table]]
   [:dialect   ::sql-to-mbql/dialect]])

(mr/def ::context
  "What resolving one metric's SQL needs, over the run's [[env]]: the provider for the metric's database, the query
  being built, the table whose columns bare identifiers name, and the callback that turns one of that table's column
  names into a Lib ref. Of the metric itself, what the dimensions need: its unique id, which seeds their ids, its
  `time-dimension`, which a `:time-dimension` reference and the default dimension refer to, and its `time-grain`.
  [[join-context]] makes the same kind of context for a table a join leads to."
  [:map {:closed true}
   [:env              ::env]
   [:provider         ::lib.schema.metadata/metadata-provider]
   [:query            ::lib.schema/query]
   [:table            ::ir/table]
   [:metric-unique-id :string]
   [:time-dimension   [:maybe :string]]
   [:time-grain       [:maybe ::ir/grain]]
   [:resolve-column   ::sql-to-mbql/resolve-column]])

(mu/defn env :- ::env
  "The `::env` of a run of the resolve stage over the IR `ir` with `config`: built once, shared by every metric."
  [config :- ::config/config
   ir     :- ::ir/semantic-layer]
  {:config    config
   :source    (:source ir)
   :providers (metadata/providers config ir)
   :tables    (:tables ir)
   :dialect   (sql-tools/driver->dialect (:driver config))})

(mu/defn- check-declared-type :- :nil
  "[[unsupported/throw-reason]] when `column`, as the project documents it, declares a `data_type` the driver does not
  map to a base type; the fix is a mapping in the driver (see [[metadata/base-type]] and the `::config/driver` schema).
  No column, or no `data_type`, is fine: the column's type is unknown and the instance supplies it."
  [config :- ::config/config
   column :- [:maybe ::ir/column]]
  (when-let [data-type (some-> (:data-type column) str/trim not-empty)]
    (when-not (metadata/base-type (:driver config) data-type)
      (unsupported/throw-reason "no base type known for column %s of type %s: the %s driver has no mapping for it"
                                (pr-str (:name column)) (pr-str data-type) (name (:driver config))))))

(mu/defn column-ref :- ::lib.schema.ref/ref
  "Lib ref for `column-name` on `table-id`, by its documented spelling when the project documents it in `columns`
  (see [[metadata/find-named]])."
  [config      :- ::config/config
   provider    :- ::lib.schema.metadata/metadata-provider
   table-id    :- ::lib.schema.id/table
   columns     :- [:map-of :string ::ir/column]
   column-name :- :string]
  (let [column (metadata/find-named (vals columns) column-name)]
    (check-declared-type config column)
    (lib/ref (metadata/column provider table-id (or (:name column) column-name)))))

(mu/defn known-type? :- :boolean
  "Is `base-type` a type, rather than the `:type/*` of a column the project does not type?"
  [base-type :- [:maybe ::lib.schema.common/base-type]]
  (boolean (and base-type (not= base-type :type/*))))

(mu/defn column-or-sql :- ::sql-to-mbql/expression
  "The Lib expression for a dimension's or key's `expr`: a bare column name, or a SQL expression."
  [{:keys [env resolve-column]} :- ::context
   expr                         :- :string]
  (let [{:keys [kind], column-name :name} (sql/parse-expr expr)]
    (case kind
      :column (resolve-column column-name)
      :sql    (sql/expression->mbql (:dialect env) expr resolve-column)
      (unsupported/throw-reason "%s is neither a column nor a SQL expression" (pr-str expr)))))

(mu/defn table-key :- ::ir/key
  "The key named `key-name` on `context`'s table."
  [{:keys [table]} :- ::context
   key-name        :- :string]
  (or (m/find-first #(= key-name (:name %)) (:keys table))
      (unsupported/throw-reason "key %s is not on table %s" (pr-str key-name) (pr-str (:name table)))))

(mu/defn table-join :- ::ir/join
  "The join named `join-name` on `context`'s table."
  [{:keys [table]} :- ::context
   join-name       :- :string]
  (or (m/find-first #(= join-name (:name %)) (:joins table))
      (unsupported/throw-reason "join %s is not on table %s" (pr-str join-name) (pr-str (:name table)))))

(mu/defn join-context :- ::context
  "A context for the table `join` from `context`'s table leads to: bare column names resolve to that table's columns,
  reached through the join's source column on this one. Metabase spells that `:source-field` on the ref and joins
  implicitly, so the instance's metadata has to know the foreign key for the query to run. [[unsupported/throw-reason]]
  with the reason of a join the source could not make, or when the joined table is in another Metabase database."
  [{:keys [env provider resolve-column] :as context} :- ::context
   join                                              :- ::ir/join]
  (b/cond
    (:reason join)
    (unsupported/throw-reason (:reason join))

    :let [target (get-in env [:tables (:table join)])]

    (not target)
    (unsupported/throw-reason "join %s leads to table %s, which is not in the semantic layer"
                              (pr-str (:name join)) (pr-str (:table join)))

    :let [database (metadata/table-database (:config env) target)]

    (not= database (metadata/database-name provider))
    (unsupported/throw-reason "table %s is in Metabase database %s, not %s; a join across databases is not supported"
                              (pr-str (:name target)) (pr-str database) (pr-str (metadata/database-name provider)))

    :let [fk-ref (resolve-column (:source-column join))
          table  (metadata/table-metadata provider target)]

    :else
    (assoc context
           :table          target
           :resolve-column (fn [column-name]
                             (-> (column-ref (:config env) provider (:id table) (:columns target) column-name)
                                 (lib/update-options assoc :source-field (lib/field-ref-id fk-ref)))))))

(mu/defn metric-context :- ::context
  "The context for resolving the metric `ir` against `table` in `env`: the provider for the table's database, a query
  over it and a callback for its columns. `time-dimension` is the metric's own for a simple metric; a ratio or derived
  metric takes its inputs' (see [[metabase-enterprise.semantic-layer-import.resolve.metrics/resolve-composed]]).
  [[unsupported/throw-reason]] when the config maps the table's warehouse database to no Metabase database."
  [{:keys [config providers] :as env} :- ::env
   {:keys [columns] :as table}        :- ::ir/table
   {:keys [unique-id time-grain]}     :- ::ir/metric
   time-dimension                     :- [:maybe :string]]
  (let [database (metadata/table-database config table)]
    (when-not database
      (unsupported/throw-reason "no Metabase database configured for warehouse database %s; add it to :databases"
                                (pr-str (-> table :relation :database))))
    (let [provider       (get providers database)
          table-metadata (metadata/table-metadata provider table)]
      {:env              env
       :provider         provider
       :query            (lib/query provider table-metadata)
       :table            table
       :metric-unique-id unique-id
       :time-dimension   time-dimension
       :time-grain       time-grain
       :resolve-column   (partial column-ref config provider (:id table-metadata) columns)})))
