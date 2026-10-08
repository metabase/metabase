(ns metabase.metabot.tools.sql.validation
  (:require
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.metabot.tools.shared :as shared]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.models.interface :as mi]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

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

(mr/def ::validation-result
  [:map
   [:valid? :boolean]
   [:dialect {:optional true} [:maybe :string]]
   [:error-message {:optional true} :string]
   [:transpiled-sql {:optional true} :string]
   [:warnings {:optional true} [:sequential :string]]
   ;; the same check already returned these warnings earlier in this turn
   [:repeated-warnings? {:optional true} :boolean]])

(mu/defn validate-sql :- ::validation-result
  "Validate sql query.

  Validation is short-circuited and query is considered valid for following cases:
  - sql string is empty,
  - dialect is `nil` or maps to `nil` (e.g. h2, vertica),
  - dialect is not in [[dialect-mapping]],
  - sql contains Metabase template tags.

  When that is not the case, the query is transpiled from and into the same dialect. If that action
  yields successfully, the query is considered valid.

  Returns the mapped dialect name in `:dialect` (not the raw driver name) for consistency
  with the Python ai-service."
  [dialect :- [:maybe :string]
   sql :- :string]
  (let [mapped-dialect (get dialect-mapping dialect)]
    (if (or (nil? mapped-dialect)
            (str/blank? sql)
            (contains-template-tags? sql))
      {:valid? true
       :dialect dialect
       :transpiled-sql sql}
      (let [{:keys [error-message transpiled-sql status]}
            (sql-tools/transpile-sql sql mapped-dialect mapped-dialect)]
        (merge
         {:dialect dialect}
         (case status
           :success {:valid? true
                     :transpiled-sql transpiled-sql}
           :skipped {:valid? true
                     :transpiled-sql transpiled-sql}
           :error   {:valid? false
                     :error-message error-message}))))))

;;;; Reference checks for SQL with template tags
;;;
;;; [[validate-sql]] can't parse SQL containing `{{...}}` or `[[...]]`. For such SQL we check that the referenced cards
;;; and snippets exist and are readable, then, for dialects [[validate-sql]] checks, compile the query (expanding those
;;; references into their SQL) and check its table and column references against metadata.
;;;
;;; Column/table problems are returned as warnings rather than errors: the checker reports false positives on a
;;; noticeable share of working queries, so a hard failure would leave the agent stuck on valid SQL.

(defn- error->warning
  "A human-readable warning for a [[driver/validate-native-query-fields]] error, or nil if it's not worth reporting."
  [{error-type :type error-name :name message :message}]
  (case (keyword error-type)
    :missing-column
    (tru "Column `{0}` was not found in any table, model, or question this query reads from." error-name)

    ;; Also reported for a table that doesn't exist, under its qualified name.
    :missing-table-alias
    (tru "Table or alias `{0}` was not found." error-name)

    :missing-table
    (tru "This query references a table that does not exist.")

    :missing-card
    (tru "This query references a model or question that does not exist.")

    ;; Metabase deduplicates repeated output column names (`id`, `id_2`), so these queries run fine.
    :duplicate-column
    nil

    :syntax-error
    (tru "The SQL could not be parsed once its model, question, and snippet references were expanded.")

    :validation-exception-error
    (tru "Validation failed: {0}" message)

    (tru "Validation problem: {0}" (pr-str error-type))))

(defn- readable-ids
  "The ids among `ids` of `model` instances matching `conditions` that the current user can read."
  [model ids & conditions]
  (if (empty? ids)
    #{}
    (into #{}
          (comp (filter mi/can-read?) (map :id))
          (apply t2/select model :id [:in ids] conditions))))

(defn- check-references-exist!
  "Throw an agent error when `template-tags` reference a card of `database-id` or a snippet that doesn't exist or that
  the current user can't read. A card from another database counts as missing."
  [database-id template-tags]
  (let [card-ids         (into #{} (keep #(when (= :card (:type %)) (:card-id %))) template-tags)
        readable-cards   (readable-ids :model/Card card-ids :database_id database-id)
        missing-cards    (vec (sort (remove readable-cards card-ids)))
        snippet-tags     (filter #(= :snippet (:type %)) template-tags)
        readable-snippet (readable-ids :model/NativeQuerySnippet (into #{} (keep :snippet-id) snippet-tags))
        missing-snippets (vec (sort (keep #(when-not (readable-snippet (:snippet-id %))
                                             (:snippet-name %))
                                          snippet-tags)))
        messages         (cond-> []
                           (seq missing-cards)
                           (conj (tru "Card {0} does not exist, is from a different Database, or can''t be read by you."
                                      (str/join ", " missing-cards)))
                           (seq missing-snippets)
                           (conj (tru "Snippet {0} does not exist, or you don''t have permission to read it."
                                      (str/join ", " (map pr-str missing-snippets)))))]
    (when (seq messages)
      (throw (ex-info (str/join " " messages)
                      {:agent-error?  true
                       :card-ids      missing-cards
                       :snippet-names missing-snippets})))))

(defn- templated-query
  "A native query of `sql` against `mp`. Tags sharing a name with one of `existing-tags` keep its definition, as when
  the SQL of a stored query is updated, so its table and field-filter tags and renamed snippets are checked as saved."
  [mp sql existing-tags]
  (cond-> (lib/native-query mp sql)
    (seq existing-tags) (lib/with-template-tags (lib/extract-template-tags mp sql existing-tags))))

(defn- compile-templated-query
  "Compile `query` with its template tags expanded and dummy values filled in for its parameters, so the result can be
  parsed but not run. Returns nil when it can't be compiled."
  [query]
  (try
    ;; Nothing is executed, so there is no destination database to route to. Persisted models stay expanded: their
    ;; cache tables aren't synced, so the checker couldn't resolve any of their columns.
    (database-routing/with-database-routing-off
      (model-persistence/with-persisted-substituion-disabled
        (let [with-params (lib/add-parameters-for-template-tags query)]
          (lib/native-query with-params (:query (qp.compile/compile-with-inline-parameters with-params))))))
    (catch Exception e
      ;; Log the message only: ex-data from the QP can hold values that fail to print.
      (log/debugf "Skipping reference check for SQL that can't be compiled: %s" (ex-message e))
      nil)))

(mr/def ::reference-check
  [:map
   [:status   [:enum :ran :skipped :failed]]
   [:warnings [:sequential :string]]])

(mu/defn- check-templated-sql-references :- ::reference-check
  "Check the references of `sql`, a query with template tags, against `database-id`'s metadata. `:warnings` are
  human-readable, and empty unless `:status` is `:ran`. Checks table and column references only when `check-fields?`,
  and skips them for queries with table tags, whose table isn't known until they run. Throws an agent error when `sql`
  references a card or snippet that doesn't exist or can't be read."
  [database-id   :- :int
   sql           :- :string
   existing-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   check-fields? :- :boolean]
  (try
    (lib-be/with-metadata-provider-cache
      (let [mp    (lib-be/application-database-metadata-provider database-id)
            query (templated-query mp sql existing-tags)
            tags  (lib/all-template-tags query)]
        (check-references-exist! database-id tags)
        (if-let [compiled (when (and check-fields?
                                     (not-any? #(= :table (:type %)) tags))
                            (compile-templated-query query))]
          {:status   :ran
           :warnings (->> (driver/validate-native-query-fields (:engine (lib.metadata/database mp)) compiled)
                          (keep error->warning)
                          distinct
                          sort
                          vec)}
          {:status :skipped, :warnings []})))
    (catch Exception e
      (when (:agent-error? (ex-data e))
        (throw e))
      ;; Message only, as in [[compile-templated-query]].
      (log/warnf "Reference check failed for database %d: %s" database-id (ex-message e))
      {:status :failed, :warnings []})))

(defn- cached-reference-check
  "[[check-templated-sql-references]], cached in agent memory for the rest of the turn so retrying the same SQL doesn't
  repeat the work. `:repeated?` is true on a cache hit."
  [database-id sql existing-tags check-fields?]
  (let [k [database-id sql existing-tags check-fields?]]
    (if-let [cached (get-in (shared/current-memory) [::reference-checks k])]
      (assoc cached :repeated? true)
      (let [{:keys [status] :as check} (check-templated-sql-references database-id sql existing-tags check-fields?)]
        (analytics/inc! :metabase-metabot/sql-reference-checks {:status (name status)})
        (when shared/*memory-atom*
          (swap! shared/*memory-atom* assoc-in [::reference-checks k] check))
        check))))

(mu/defn validate-database-sql :- ::validation-result
  "[[validate-sql]] for `sql` against `database-id`, plus reference `:warnings` when `sql` has template tags (which
  [[validate-sql]] can't parse). `existing-tags` are the template tags of the stored query whose SQL `sql` replaces, if
  any. Throws an agent error when `sql` references a card or snippet that doesn't exist or that the current user can't
  read. Like [[validate-sql]], checks no table or column references for dialects that [[dialect-mapping]] skips.
  `:repeated-warnings?` is set when this turn already returned the same warnings for the same SQL."
  ([database-id :- :int
    sql         :- :string]
   (validate-database-sql database-id sql nil))
  ([database-id   :- :int
    sql           :- :string
    existing-tags :- [:maybe ::lib.schema.template-tag/template-tags]]
   (let [dialect (database-id->dialect database-id)
         result  (validate-sql dialect sql)]
     (if (contains-template-tags? sql)
       (let [{:keys [warnings repeated?]} (cached-reference-check database-id sql existing-tags
                                                                  (some? (get dialect-mapping dialect)))]
         (cond-> result
           (seq warnings)                 (assoc :warnings warnings)
           (and (seq warnings) repeated?) (assoc :repeated-warnings? true)))
       result))))
