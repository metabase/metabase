(ns metabase.metabot.tools.sql.validation
  (:require
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.shared :as shared]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.models.interface :as mi]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.quoting :as quoting]))

(def dialect-mapping
  "Maps query dialect (Metabase driver name) to parser dialect. Matches ai-service
  `SQLGLOT_DIALECT_MAP`. Values of `nil` mean the dialect is recognized but validation is skipped.
  Dialects absent from this map are also skipped."
  {;; PostgreSQL family
   "postgres" "postgres",
   "postgresql" "postgres",
   ;; MySQL family
   "mysql" "mysql",
   "mariadb" "mysql",
   ;; Cloud warehouses
   "bigquery-cloud-sdk" "bigquery",
   "bigquery" "bigquery",
   "snowflake" "snowflake",
   "redshift" "redshift",
   ;; Presto/Trino family (Athena uses Trino/Presto syntax)
   "athena" "trino",
   "presto" "presto",
   "presto-jdbc" "presto",
   "trino" "trino",
   "starburst" "trino",
   ;; Analytics engines
   "clickhouse" "clickhouse",
   "motherduck" "duckdb",
   ;; Spark family
   "databricks" "databricks",
   "sparksql" "spark",
   "spark" "spark",
   ;; Enterprise databases
   "oracle" "oracle",
   "sqlserver" "tsql",
   ;; Embedded/lightweight
   "sqlite" "sqlite",
   ;; sqlglot has no H2 dialect, and its nearest stand-in, postgres mode, folds the other
   ;; way (H2 folds unquoted identifiers to uppercase, postgres to lowercase), so anything
   ;; the transpiler folds or quotes comes out wrong for H2; skip validation. Vertica is
   ;; not supported by sqlglot.
   "h2" nil
   "vertica" nil})

(defn database-id->dialect
  "Get dialect for database id."
  [db-id]
  (some-> db-id driver.u/database->driver name))

(defn- contains-template-tags?
  "Predicate that checks whether sql string contains"
  [sql]
  (boolean (and (string? sql)
                (re-find #"\{\{|\[\[" sql))))

(defn- template-syntax-error
  "The parser message for `{{...}}` or `[[...]]` syntax in `sql` that Metabase rejects, or `nil`.

  Metabase cannot make a query when the lax parse of [[lib/recognize-template-tags]] throws. It does the strict parse
  of SQL drivers before a run only when the query has template tags; it sends other SQL, for example
  `ARRAY[[1,2],[3,4]]`, to the database as it is. This check uses the same two rules. The strict parse marks its
  syntax errors with `:type :invalid-query`. Other exceptions are not about the SQL, so they propagate."
  [sql]
  (when (and (contains-template-tags? sql)
             (try
               (seq (lib/recognize-template-tags sql))
               (catch clojure.lang.ExceptionInfo _
                 true)))
    (try
      ;; Model-facing: the parser builds its messages with `tru`, so get them in English, never in the user's locale.
      (binding [i18n/*user-locale* "en"]
        (lib/parse-parameters sql))
      nil
      (catch clojure.lang.ExceptionInfo e
        (if (= :invalid-query (:type (ex-data e)))
          (ex-message e)
          (throw e))))))

(mr/def ::validation-result
  [:map
   [:valid? :boolean]
   [:dialect {:optional true} [:maybe :string]]
   [:error-message {:optional true} :string]
   [:reason {:optional true} :keyword]
   [:transpiled-sql {:optional true} :string]
   ;; with `:reason :missing-references`
   [:missing-card-ids {:optional true} [:sequential :int]]
   [:missing-snippet-names {:optional true} [:sequential :string]]
   ;; table and column references that did not resolve, on valid SQL
   [:warnings {:optional true} [:sequential :string]]
   ;; this turn has already shown each of the warnings
   [:repeated-warnings? {:optional true} :boolean]])

(mu/defn validate-sql :- ::validation-result
  "Validate sql query.

  For every dialect, sql with `{{...}}` or `[[...]]` syntax that Metabase rejects is not valid, with `:reason`
  `:invalid-template-syntax` and the parser message in `:error-message`. Metabase cannot run such sql.

  Otherwise validation is short-circuited and query is considered valid for following cases:
  - sql string is empty,
  - dialect is `nil` or maps to `nil` (e.g. h2, vertica),
  - dialect is not in [[dialect-mapping]],
  - sql contains Metabase template tags.

  When that is not the case, the query is transpiled from and into the same dialect. If that action
  yields successfully, the query is considered valid. Otherwise `:reason` says why, when the parser
  knows (`:multiple-statements`).

  Returns the mapped dialect name in `:dialect` (not the raw driver name) for consistency
  with the Python ai-service."
  [dialect :- [:maybe :string]
   sql :- :string]
  (let [mapped-dialect (get dialect-mapping dialect)
        template-error (template-syntax-error sql)]
    (cond
      template-error
      {:valid? false
       :dialect dialect
       :reason :invalid-template-syntax
       :error-message template-error}

      (or (nil? dialect)
          (str/blank? sql)
          (not (contains? dialect-mapping dialect))
          (nil? mapped-dialect)
          (contains-template-tags? sql))
      {:valid? true
       :dialect dialect
       :transpiled-sql sql}

      :else
      (let [{:keys [error-message reason transpiled-sql status]}
            (sql-tools/transpile-sql sql mapped-dialect mapped-dialect)]
        (merge
         {:dialect dialect}
         (case status
           :success {:valid? true
                     :transpiled-sql transpiled-sql}
           :skipped {:valid? true
                     :transpiled-sql transpiled-sql}
           :error   (cond-> {:valid? false
                             :error-message error-message}
                      reason (assoc :reason reason))))))))

;;;; Reference checks
;;;
;;; [[validate-sql]] checks syntax only. [[validate-database-sql]] also checks that the cards and snippets the SQL
;;; references exist and can be read, and checks its table and column names against the database metadata.
;;;
;;; Table and column problems are warnings, not errors: the checker reports false positives on some working queries,
;;; so an error would leave the agent stuck on valid SQL. Design from github.com/metabase/metabase/pull/83035.

(mr/def ::query-template-tags
  "The template tags of every native stage of a query, as [[lib/all-template-tags]] returns them."
  [:maybe [:set {:min 1} ::lib.schema.template-tag/template-tag]])

(mr/def ::missing-references
  [:map
   [:missing-card-ids      [:sequential :int]]
   [:missing-snippet-names [:sequential :string]]])

(mr/def ::reference-check
  [:map
   [:status   [:enum :ran :skipped :failed]]
   [:warnings [:sequential :string]]
   [:missing  {:optional true} ::missing-references]])

(defn- error->warning
  "The model-facing warning for a [[driver/validate-native-query-fields]] error, or nil when it is not worth reporting."
  [{error-type :type error-name :name}]
  (case (keyword error-type)
    :missing-column
    (str "Column " (quoting/quoted error-name) " was not found in any table, model, or question this query reads from.")

    ;; Also reported for a table that does not exist, under the name the SQL uses.
    :missing-table-alias
    (str "Table or alias " (quoting/quoted error-name) " was not found.")

    :missing-table
    "This query references a table that does not exist."

    :missing-card
    "This query references a model or question that does not exist."

    ;; Metabase renames repeated output columns (`id`, `id_2`), so these queries run.
    :duplicate-column
    nil

    :syntax-error
    "The reference check could not parse the SQL after expanding its model, question, and snippet references."

    (str "The reference check reported a problem of type " (quoting/quoted (str error-type)) ".")))

(defn- checker-failure?
  "Whether the field checker `error` says that the check itself failed, not that the SQL is wrong."
  [templated? {error-type :type}]
  (case (keyword error-type)
    ;; For example a parse timeout.
    :validation-exception-error true
    ;; [[validate-sql]] has already parsed SQL without template tags, so here the two parsers disagree.
    :syntax-error               (not templated?)
    false))

(defn- readable-ids
  "The `:id` of each of `rows` that the current user can read."
  [rows]
  (into #{} (comp (filter mi/can-read?) (map :id)) rows))

(defn- missing-card-ids
  "The ids of the cards that `tags` reference and that are not readable cards of `database-id`, sorted."
  [database-id tags]
  (let [card-ids (lib/template-tags->card-ids (vec tags))
        readable (if card-ids (readable-ids (metabot.db/database-card-read-rows database-id (vec card-ids))) #{})]
    (vec (sort (remove readable card-ids)))))

(defn- missing-snippet-names
  "The names of the snippets that `tags` reference and that do not exist or are not readable, sorted."
  [tags]
  (let [snippet-tags (filter #(= :snippet (:type %)) tags)
        snippet-ids  (into #{} (keep :snippet-id) snippet-tags)
        readable     (if (seq snippet-ids) (readable-ids (metabot.db/snippet-read-rows (vec snippet-ids))) #{})]
    (vec (sort (keep #(when-not (readable (:snippet-id %)) (:snippet-name %)) snippet-tags)))))

(mu/defn- missing-references :- [:maybe ::missing-references]
  "The cards and snippets that `tags` reference and that the current user cannot use on `database-id`, or nil.

  A card that does not exist, is on another database, or is not readable counts as missing, so the answer does not
  tell which of these is true."
  [database-id :- ::lib.schema.id/database
   tags        :- ::query-template-tags]
  (let [card-ids      (missing-card-ids database-id tags)
        snippet-names (missing-snippet-names tags)]
    (when (or (seq card-ids) (seq snippet-names))
      {:missing-card-ids card-ids :missing-snippet-names snippet-names})))

(defn- templated-query
  "A native query of `sql` against `mp`. A tag with the name of one of `existing-tags` keeps that definition, so the
  table tags, field filters and renamed snippets of a stored query are checked as they were saved."
  [mp sql existing-tags]
  (cond-> (lib/native-query mp sql)
    (seq existing-tags) (lib/with-template-tags (lib/extract-template-tags mp sql existing-tags))))

(defn- compile-templated-query
  "`query` compiled to plain SQL, with its references expanded and dummy parameter values, or nil when it does not
  compile. The result is for parsing only, not to run."
  [query]
  (try
    ;; A persisted model's cache table is not synced, so the checker could not resolve its columns: expand the model.
    (model-persistence/with-persisted-substituion-disabled
      (let [with-params (lib/add-parameters-for-template-tags query)]
        (lib/native-query with-params (:query (qp.compile/compile-with-inline-parameters with-params)))))
    (catch Exception e
      ;; Log the message only: QP ex-data can hold values.
      (log/debugf "Skipping the reference check of SQL that does not compile: %s" (ex-message e))
      nil)))

(defn- checkable-query
  "`query` in a form the field checker can read, or nil when the check must be skipped.

  A table tag names its table only when the query runs, so a query with one is not checked."
  [query tags]
  (cond
    (empty? tags)                     query
    (some #(= :table (:type %)) tags) nil
    :else                             (compile-templated-query query)))

(defn- table-warning
  "The model-facing warning for the table that the SQL names `table-name` and that does not resolve."
  [table-name]
  ;; The table can still exist in the warehouse, for example when it was created after the last sync.
  (str "Table " (quoting/quoted table-name) " was not found in the table metadata that Metabase has synced. If you "
       "meant a synced table, refer to it by its schema-qualified name, the `fully_qualified_name` in the table "
       "metadata."))

(defn- system-schemas
  "The lower-case names of the schemas that hold the catalog tables of `driver`, such as `pg_catalog` on Postgres.
  Sync skips them, so their tables never resolve, but SQL can read them."
  [driver]
  ;; `information_schema` is the SQL standard name, so keep it for drivers whose sync does not list it.
  (into #{"information_schema"}
        (map u/lower-case-en)
        (when (isa? driver/hierarchy driver :sql-jdbc)
          (sql-jdbc.sync/excluded-schemas driver))))

(def ^:private system-tables
  "Per driver, the pattern of a table reference, as the SQL writes it, that names a catalog table outside the
  [[system-schemas]] of the driver."
  {;; pg_catalog is on the search path before the default schema.
   :postgres           #"(?i)pg_\w+"
   :oracle             #"(?i)dual"
   ;; The parser keeps `INFORMATION_SCHEMA` in the table name, after an optional dataset or region.
   :bigquery-cloud-sdk #"(?i)(?:.+\.)?information_schema\..+"
   :mysql              #"(?i)(?:mysql|performance_schema|sys)\..+"})

(defn- written-name
  "The table name of `spec` as the SQL writes it, such as `core.account` or `account`."
  [{:keys [schema table]}]
  (str/join "." (remove nil? [schema table])))

(defn- names-table?
  "Whether the table reference `written` in the SQL is the table `spec`.

  A name without a schema, on either side, is in `default-schema`. A `spec` that is then still without a schema is in
  a database that has no schemas, such as MySQL: it matches whatever qualifier `written` has, because that qualifier
  names the database."
  [default-schema written spec]
  (let [schema-of   #(some-> (or (:schema %) default-schema) u/lower-case-en)
        spec-schema (schema-of spec)]
    (and (= (u/lower-case-en (:table written)) (u/lower-case-en (:table spec)))
         (or (nil? spec-schema)
             (= (schema-of written) spec-schema)))))

(defn- wildcard-prefix
  "The name prefix of the table reference `written` when it has the shape of a wildcard table, or nil.

    (wildcard-prefix {:schema \"analytics\" :table \"events_*\"})
    ;; => \"events_\"

  Only BigQuery has wildcard tables. A wildcard table reads every table of its dataset whose name starts with the
  prefix, such as the daily `events_20240101` shards of a Google Analytics export."
  [{table :table}]
  (second (re-matches #"(?s)(.*)\*" table)))

(defn- known-tables
  "The active Tables of `database-id` that the table references `written` can name, as `{:schema :table}` specs:
  those with the name of a reference, and, for a reference with the shape of a wildcard table, those whose name can
  start with its prefix. Hidden Tables are included."
  [database-id written]
  (let [prefixes (vec (keep wildcard-prefix written))]
    (for [{:keys [schema name]} (concat (metabot.db/database-table-names database-id (mapv :table written))
                                        (when (seq prefixes)
                                          (metabot.db/database-table-names-like database-id prefixes)))]
      {:schema schema :table name})))

(defn- system-table?
  "Whether the table reference `written` names a catalog table of `driver`."
  [driver default-schema written]
  (boolean
   (or (contains? (system-schemas driver) (some-> (or (:schema written) default-schema) u/lower-case-en))
       (some (fn [[system-driver pattern]]
               (and (isa? driver/hierarchy driver system-driver)
                    (re-matches pattern (written-name written))))
             system-tables))))

(defn- matches-table?
  "Whether the table reference `written` is the table `spec`, or is a wildcard table of `driver` that reads it."
  [driver default-schema written spec]
  (if-let [prefix (when (isa? driver/hierarchy driver :bigquery-cloud-sdk)
                    (wildcard-prefix written))]
    (and (str/starts-with? (u/lower-case-en (:table spec)) (u/lower-case-en prefix))
         (names-table? default-schema (assoc written :table (:table spec)) spec))
    (names-table? default-schema written spec)))

(defn- existing-table?
  "Whether the unresolved table reference `written` names a table that exists: a catalog table of `driver`, one of
  the `known` Tables, which do not resolve because they are hidden, or a wildcard table that reads one of them.

  A wildcard table never resolves, so this is also where a wildcard that matches no table, such as one with a typo,
  is told apart."
  [driver default-schema known written]
  (or (system-table? driver default-schema written)
      (some #(matches-table? driver default-schema written %) known)))

(defn- table-names
  "The sorted, distinct names of the table references `written`, as the SQL writes them."
  [written]
  (->> written (map written-name) distinct sort))

(mu/defn- unresolved-tables :- [:maybe [:map
                                        [:missing  [:sequential :string]]
                                        [:existing [:sequential ::sql-tools/table-spec]]]]
  "The tables that `query` reads and that do not resolve. `:missing` lists the names, as the SQL writes them, of the
  tables that do not exist. `:existing` lists the references, as the SQL writes them, of the tables that exist but do
  not resolve."
  [driver :- :keyword
   query  :- ::lib.schema/query]
  ;; A resolved spec can carry the default schema of an unqualified name, so take the names from the raw references.
  (when-let [unresolved (seq (keep :unresolved-table (sql-tools/referenced-tables driver query)))]
    (let [{database-id :id :keys [default-schema]} (lib.metadata/database query)
          written (filter (fn [written] (some #(names-table? default-schema written %) unresolved))
                          (sql-tools/referenced-tables-raw driver (lib/raw-native-query query)))
          known   (when (seq written) (known-tables database-id written))
          {existing true missing false} (group-by #(boolean (existing-table? driver default-schema known %)) written)]
      {:missing (table-names missing) :existing (vec existing)})))

(defn- same-table?
  "Whether the table references `a` and `b` in the SQL name the same table. An unqualified name is in
  `default-schema`."
  [default-schema a b]
  (names-table? default-schema a (update b :schema #(or % default-schema))))

(defn- source-tables
  "The table references that the field reference `field-ref` of [[sql-tools/field-references]] can read from."
  [field-ref]
  (->> (tree-seq coll? seq field-ref)
       (filter #(= :all-columns (:type %)))
       (map :table)))

(defn- existing-table-columns
  "The lower-cased names of the columns of `query` that can come from one of the table references `existing`. These
  tables do not resolve, so the field checker cannot tell whether they have the column."
  [driver query existing]
  (when (seq existing)
    (let [default-schema (:default-schema (lib.metadata/database query))
          existing?      (fn [table] (some #(same-table? default-schema table %) existing))
          {:keys [used-fields returned-fields]} (sql-tools/field-references driver (lib/raw-native-query query))]
      ;; Walk the whole tree: a column can sit inside a custom field, such as `upper(name)`.
      (->> (tree-seq coll? seq [used-fields returned-fields])
           (filter #(= :single-column (:type %)))
           (filter #(some existing? (source-tables %)))
           (into #{} (map (comp u/lower-case-en :column)))))))

(defn- ignored-error?
  "Whether the field checker `error` is about one of the lower-cased `table-names`, or is a missing column with one of
  the lower-cased `column-names`."
  [table-names column-names {error-type :type error-name :name}]
  (let [names (case (keyword error-type)
                :missing-table-alias table-names
                :missing-column      column-names
                #{})]
    (contains? names (some-> error-name u/lower-case-en))))

(defn- field-warnings
  "The sorted, distinct warnings for the field checker `errors`. A table alias with one of `table-names` is left
  out: its table warning covers it, or its table exists. A missing column with one of `column-names` is left out: it
  can come from a table that exists but does not resolve."
  [errors table-names column-names]
  (let [lower-names (into #{} (map u/lower-case-en) table-names)]
    (->> errors
         (remove #(ignored-error? lower-names column-names %))
         (keep error->warning)
         distinct
         sort)))

(mu/defn- field-check :- ::reference-check
  "The check of the table and column references of `query` against `mp`. The warnings for tables that do not exist
  come first. A checker failure gives `:status :failed` and no warnings."
  [mp         :- ::lib.schema.metadata/metadata-provider
   query      :- ::lib.schema/query
   templated? :- :boolean]
  (let [driver (:engine (lib.metadata/database mp))
        errors (driver/validate-native-query-fields driver query)]
    (if (some #(checker-failure? templated? %) errors)
      {:status :failed, :warnings []}
      (let [{:keys [missing existing]} (unresolved-tables driver query)
            alias-names  (concat missing (table-names existing))
            column-names (existing-table-columns driver query existing)]
        {:status   :ran
         :warnings (into (mapv table-warning missing) (field-warnings errors alias-names column-names))}))))

(mu/defn- run-reference-check :- ::reference-check
  "The [[check-references]] result for `query`, with template `tags`, against `mp`."
  [database-id   :- ::lib.schema.id/database
   mp            :- ::lib.schema.metadata/metadata-provider
   query         :- ::lib.schema/query
   tags          :- ::query-template-tags
   check-fields? :- :boolean]
  (if-let [missing (missing-references database-id tags)]
    {:status :ran, :warnings [], :missing missing}
    (if-let [checkable (when check-fields? (checkable-query query tags))]
      (field-check mp checkable (boolean (seq tags)))
      {:status :skipped, :warnings []})))

(defn- check-key
  "The key of a reference check in the turn cache."
  [database-id sql tags check-fields?]
  ;; Each parse gives a tag that the SQL defines a new random `:id`, so the same tags differ only in it.
  [database-id sql check-fields? (into #{} (map #(dissoc % :id)) tags)])

(defn- cached-in-turn
  "The value of `k` in this turn's reference check cache, or the result of `f`, which is then cached."
  [k f]
  (or (get-in (shared/current-memory) [::reference-checks k])
      (let [v (f)]
        (when shared/*memory-atom*
          (swap! shared/*memory-atom* assoc-in [::reference-checks k] v))
        v)))

(defn- counted
  "`check`, after it is counted in the reference check metric."
  [check]
  (analytics/inc! :metabase-metabot/sql-reference-checks {:status (name (:status check))})
  check)

(mu/defn- check-references :- ::reference-check
  "Check the references of `sql` against the metadata of `database-id`.

  `:missing` lists the cards and snippets that cannot be used. `:warnings` lists table and column problems; they are
  checked only when `check-fields?`. A check that throws gives `:status :failed` and no findings. The same check
  again in this turn gives the cached result."
  [database-id   :- :int
   sql           :- :string
   existing-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   check-fields? :- :boolean]
  (try
    (lib-be/with-metadata-provider-cache
      (let [mp    (lib-be/application-database-metadata-provider database-id)
            query (templated-query mp sql existing-tags)
            tags  (lib/all-template-tags query)]
        (cached-in-turn (check-key database-id sql tags check-fields?)
                        #(counted (run-reference-check database-id mp query tags check-fields?)))))
    (catch Exception e
      ;; Fail open: the check must never block SQL. Message only, as in [[compile-templated-query]].
      (log/warnf "Reference check failed for database %d: %s" database-id (ex-message e))
      (counted {:status :failed, :warnings []}))))

(defn- shown-before!
  "Whether this turn has already returned each of `warnings` in a validation result. Records them as returned."
  [warnings]
  (let [shown (get (shared/current-memory) ::shown-reference-warnings #{})]
    (when shared/*memory-atom*
      (swap! shared/*memory-atom* update ::shown-reference-warnings (fnil into #{}) warnings))
    (every? shown warnings)))

(defn- with-reference-check
  "The valid [[validate-sql]] `result`, with the findings of the reference `check` added."
  [result {:keys [missing warnings]}]
  (cond
    missing        (merge {:valid? false :dialect (:dialect result) :reason :missing-references} missing)
    (seq warnings) (cond-> (assoc result :warnings warnings)
                     (shown-before! warnings) (assoc :repeated-warnings? true))
    :else          result))

(mu/defn validate-database-sql :- ::validation-result
  "[[validate-sql]] for `sql` against `database-id`, then a check of its references.

    (validate-database-sql 1 \"SELECT v.nme FROM {{#5}} AS v\")
    ;; => {:valid? true, :dialect \"postgres\", :transpiled-sql \"…\",
    ;;     :warnings [\"Column \\\"nme\\\" was not found in any table, model, or question this query reads from.\"]}

  A card or snippet that does not exist or that the current user cannot read makes the result invalid, with
  `:reason :missing-references`. Unresolved tables and columns are `:warnings` on a valid result; they are checked
  only for dialects that [[dialect-mapping]] parses, and only when `check-fields?` (default true). `existing-tags` are
  the template tags of the stored query whose SQL `sql` replaces, if any. `:repeated-warnings?` is set when this turn
  has already shown each of the warnings."
  ([database-id :- :int
    sql         :- :string]
   (validate-database-sql database-id sql nil))
  ([database-id   :- :int
    sql           :- :string
    existing-tags :- [:maybe ::lib.schema.template-tag/template-tags]]
   (validate-database-sql database-id sql existing-tags true))
  ([database-id   :- :int
    sql           :- :string
    existing-tags :- [:maybe ::lib.schema.template-tag/template-tags]
    check-fields? :- :boolean]
   (let [dialect                                    (database-id->dialect database-id)
         {:keys [valid? transpiled-sql] :as result} (validate-sql dialect sql)]
     (if valid?
       (with-reference-check result (check-references database-id (or transpiled-sql sql) existing-tags
                                                      (and check-fields? (some? (get dialect-mapping dialect)))))
       result))))
