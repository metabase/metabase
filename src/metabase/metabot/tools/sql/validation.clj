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
   [metabase.util.quoting :as quoting])
  (:import
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

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
   ;; table references that did not resolve, on valid SQL
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
;;; references exist and can be read, and checks its table names against the database metadata.
;;;
;;; A table that does not resolve is a warning, not an error: it can exist in the warehouse but not be synced yet, so
;;; an error would leave the agent stuck on valid SQL. Design from github.com/metabase/metabase/pull/83035. Only the
;;; tables that the model wrote get a warning, not those that the SQL of a referenced card or snippet reads.
;;;
;;; Column names are not checked. The field checker of [[driver/validate-native-query-fields]] reports false positives
;;; on working SQL, such as the column list of a CTE, a column alias list, a qualifier in another letter case, or a
;;; BigQuery struct field, and each false warning costs the agent a turn.

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
    ;; A persisted model's cache table is not synced, so the check would report it as missing: expand the model.
    (model-persistence/with-persisted-substituion-disabled
      (let [with-params (lib/add-parameters-for-template-tags query)]
        (lib/native-query with-params (:query (qp.compile/compile-with-inline-parameters with-params)))))
    (catch Exception e
      ;; Log the message only: QP ex-data can hold values.
      (log/debugf "Skipping the reference check of SQL that does not compile: %s" (ex-message e))
      nil)))

(defn- checkable-query
  "`query` in a form the table check can read, or nil when the check must be skipped.

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

(defn- written-in?
  "Whether `sql` names the table of the table reference `written` outside its template tags.

    (written-in? \"SELECT * FROM {{#5-events}} AS e JOIN account a ON TRUE\" {:table \"account\"})
    ;; => true
    (written-in? \"SELECT * FROM {{#5-events}} AS e\" {:table \"events\"})
    ;; => false"
  [sql {:keys [table]}]
  (let [outside-tags (str/replace sql #"(?s)\{\{.*?\}\}" " ")
        identifier   (re-pattern (str "(?iu)(?<![\\p{L}\\p{N}_$])" (Pattern/quote table)
                                      "(?![\\p{L}\\p{N}_$])"))]
    (boolean (re-find identifier outside-tags))))

(mu/defn- missing-tables :- [:sequential :string]
  "The sorted names, as the SQL writes them, of the tables that `query` reads and that do not exist. A table that
  exists but does not resolve, such as a hidden or catalog table, or a wildcard table that reads a synced table, is
  not missing: [[existing-table?]] decides.

  With `model-sql`, the SQL before its references were expanded, a table that only a referenced card or snippet
  reads is not missing either: the model did not write it, so it cannot fix it."
  [driver    :- :keyword
   query     :- ::lib.schema/query
   model-sql :- [:maybe :string]]
  ;; A resolved spec can carry the default schema of an unqualified name, so take the names from the raw references.
  (if-let [unresolved (seq (keep :unresolved-table (sql-tools/referenced-tables driver query)))]
    (let [{database-id :id :keys [default-schema]} (lib.metadata/database query)
          written (cond->> (filter (fn [written] (some #(names-table? default-schema written %) unresolved))
                                   (sql-tools/referenced-tables-raw driver (lib/raw-native-query query)))
                    model-sql (filter #(written-in? model-sql %)))
          known   (when (seq written) (known-tables database-id written))]
      (table-names (remove #(existing-table? driver default-schema known %) written)))
    []))

(mu/defn- table-check :- ::reference-check
  "The check of the table references of `query`: a warning for each table that does not exist and that `model-sql`
  names, when it is given."
  [query     :- ::lib.schema/query
   model-sql :- [:maybe :string]]
  {:status   :ran
   :warnings (mapv table-warning (missing-tables (:engine (lib.metadata/database query)) query model-sql))})

(mu/defn- run-reference-check :- ::reference-check
  "The [[check-references]] result for `query`, with template `tags`."
  [database-id   :- ::lib.schema.id/database
   query         :- ::lib.schema/query
   tags          :- ::query-template-tags
   check-tables? :- :boolean]
  (if-let [missing (missing-references database-id tags)]
    {:status :ran, :warnings [], :missing missing}
    (if-let [checkable (when check-tables? (checkable-query query tags))]
      ;; The compiled SQL of `checkable` also holds the SQL of the cards and snippets that `query` references.
      (table-check checkable (when (seq tags) (lib/raw-native-query query)))
      {:status :skipped, :warnings []})))

(defn- check-key
  "The key of a reference check in the turn cache."
  [database-id sql tags check-tables?]
  ;; Each parse gives a tag that the SQL defines a new random `:id`, so the same tags differ only in it.
  [database-id sql check-tables? (into #{} (map #(dissoc % :id)) tags)])

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

  `:missing` lists the cards and snippets that cannot be used. `:warnings` lists the tables that do not exist; they
  are checked only when `check-tables?`. A check that throws gives `:status :failed` and no findings. The same check
  again in this turn gives the cached result."
  [database-id   :- :int
   sql           :- :string
   existing-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   check-tables? :- :boolean]
  (try
    (lib-be/with-metadata-provider-cache
      (let [mp    (lib-be/application-database-metadata-provider database-id)
            query (templated-query mp sql existing-tags)
            tags  (lib/all-template-tags query)]
        (cached-in-turn (check-key database-id sql tags check-tables?)
                        #(counted (run-reference-check database-id query tags check-tables?)))))
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

    (validate-database-sql 1 \"SELECT a.name FROM {{#5}} AS v JOIN account a ON a.id = v.id\")
    ;; => {:valid? true, :dialect \"postgres\", :transpiled-sql \"…\",
    ;;     :warnings [\"Table \\\"account\\\" was not found in the table metadata that Metabase has synced. …\"]}

  A card or snippet that does not exist or that the current user cannot read makes the result invalid, with
  `:reason :missing-references`. Tables that do not exist are `:warnings` on a valid result; they are checked only
  for dialects that [[dialect-mapping]] parses, and only when `check-tables?` (default true). Column names are not
  checked. `existing-tags` are the template tags of the stored query whose SQL `sql` replaces, if any.
  `:repeated-warnings?` is set when this turn has already shown each of the warnings."
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
    check-tables? :- :boolean]
   (let [dialect                                    (database-id->dialect database-id)
         {:keys [valid? transpiled-sql] :as result} (validate-sql dialect sql)]
     (if valid?
       (with-reference-check result (check-references database-id (or transpiled-sql sql) existing-tags
                                                      (and check-tables? (some? (get dialect-mapping dialect)))))
       result))))
