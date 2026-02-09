(ns metabase.sql-tools.macaw.core
  (:require
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.interface :as sql-tools]
   [metabase.sql-tools.macaw.references :as sql-tools.macaw.references]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;;; Macaw options and parsing

(def ^:private considered-drivers
  "The set of drivers for which we configure non-trivial macaw options."
  #{:h2 :mysql :postgres :redshift :sqlite :sqlserver})

(defn- macaw-options
  "Generate the options expected by Macaw based on the nature of the given driver."
  [driver]
  (merge
   ;; If this isn't a driver we've considered, fallback to Macaw's conservative defaults.
   (when (contains? considered-drivers driver)
     {;; According to the SQL-92 specification, non-quoted identifiers should be case-insensitive, and the majority of
      ;; engines are implemented this way.
      ;;
      ;; In practice there are exceptions, notably MySQL and SQL Server, where case sensitivity is a property of the
      ;; underlying resource referenced by the identifier, and the case-sensitivity does not depend on whether the
      ;; reference is quoted.
      ;;
      ;; For MySQL the case sensitivity of databases and tables depends on both the underlying file system, and a system
      ;; variable used to initialize the database. For SQL Server it depends on the collation settings of the collection
      ;; where the corresponding schema element is defined.
      ;;
      ;; For MySQL, columns and aliases can never be case-sensitive, and for SQL Server the default collation is case-
      ;; insensitive too, so it makes sense to just treat all databases as case-insensitive as a whole.
      ;;
      ;; In future, Macaw may support discriminating on the identifier type, in which case we could be more precise for
      ;; these databases. Being 100% correct would require querying system variables and schema configuration however,
      ;; which is likely a step too far in complexity.
      ;;
      ;; Currently, we go with :agnostic, as it is the most relaxed semantics (the case of both the identifiers and the
      ;; underlying schema is totally ignored, and correspondence is non-deterministic), but Macaw supports more nuanced
      ;; :lower and :upper configuration values which coerce the query identifiers to a given case then do an exact
      ;; comparison with the schema.
      :case-insensitive      :agnostic
      ;; For both MySQL and SQL Server, whether identifiers are case-sensitive depends on database configuration only,
      ;; and quoting has no effect on this, so we disable this option for consistency with `:case-insensitive`.
      :quotes-preserve-case? (not (contains? #{:mysql :sqlserver} driver))
      :features              {:postgres-syntax        (isa? driver/hierarchy driver :postgres)
                              :square-bracket-quotes  (= :sqlserver driver)
                              :unsupported-statements false
                              :backslash-escape-char  true
                              ;; This will slow things down, but until we measure the difference, opt for correctness.
                              :complex-parsing        true}
      ;; 10 seconds
      :timeout               10000})
   {;; There is no plan to be exhaustive yet.
    ;; Note that while an allowed list would be more conservative, at the time of writing only 1 of the bundled
    ;; drivers use FINAL as a reserved word, and mentioning them all would be prohibitive.
    ;; In the future, we will use multimethods to define this explicitly per driver, or even discover it automatically
    ;; through the JDBC connection, where possible.
    :non-reserved-words    (vec (remove nil? [(when-not (contains? #{:clickhouse} driver)
                                                :final)]))}))

(defn- parsed-query
  "Parse SQL using Macaw with driver-specific options."
  [sql driver & {:as opts}]
  (let [result (macaw/parsed-query sql (merge (macaw-options driver) opts))]
    ;; TODO (lbrdnk 2026-01-23): In follow-up work we should ensure that failure to parse is not silently swallowed.
    ;;                           I'm leaving that off at the moment to avoid potential log flooding.
    #_(when (and (map? result) (some? (:error result)))
        (throw (ex-info "SQL parsing failed."
                        {:macaw-error (:error result)}
                        (-> result :context :cause))))
    result))

;;;; referenced-tables

(defn split-compound-table-spec
  "Macaw doesn't understand multi-part identifiers like BigQuery's `dataset.table` or
   `project.dataset.table`, returning them as a single compound `:table` value.
   This splits such compound names into separate `:schema` and `:table` parts.

   - `table`                 → `{:table \"table\"}`
   - `schema.table`          → `{:schema \"schema\", :table \"table\"}`
   - `catalog.schema.table`  → `{:schema \"schema\", :table \"table\"}`"
  [{:keys [table schema] :as table-spec}]
  (if (and table (nil? schema) (str/includes? table "."))
    (let [parts (str/split table #"\.")]
      (case (count parts)
        1 table-spec
        2 {:schema (first parts) :table (second parts)}
        ;; 3+ parts: take last two as schema.table (drop catalog/project prefix)
        {:schema (nth parts (- (count parts) 2))
         :table  (last parts)}))
    table-spec))

(mu/defn referenced-tables
  "WIP"
  [driver :- :keyword
   query  :- :metabase.lib.schema/native-only-query]
  (let [db-tables (lib.metadata/tables query)
        db-transforms (lib.metadata/transforms query)]
    (-> query
        lib/raw-native-query
        (parsed-query driver)
        (macaw/query->components {:strip-contexts? true})
        :tables
        (->> (map :component))
        (->> (map split-compound-table-spec))
        (->> (into #{} (keep #(->> (sql-tools.common/normalize-table-spec driver %)
                                   (sql-tools.common/find-table-or-transform driver db-tables db-transforms))))))))

(defmethod sql-tools/referenced-tables-impl :macaw
  [_parser driver query]
  (referenced-tables driver query))

;;;; field-references

(defmethod sql-tools/field-references-impl :macaw
  [_parser driver sql-string]
  (-> sql-string
      (parsed-query driver)
      macaw/->ast
      (->> (sql-tools.macaw.references/field-references driver))))

;;;; returned-columns

(defmethod sql-tools/returned-columns-impl :macaw
  [parser driver query]
  (sql-tools.common/returned-columns parser driver query))

;;;; referenced-fields

(defmethod sql-tools/referenced-fields-impl :macaw
  [parser driver query]
  (sql-tools.common/referenced-fields parser driver query))

(defmethod sql-tools/validate-query-impl :macaw
  [parser driver query]
  (sql-tools.common/validate-query parser driver query))

;; TODO: Following previously implmented as:
;;(mapv split-compound-table-spec (:tables (macaw/query->tables sql-str {:mode :compound-select})))
;; To fix the test old implementation was resurrected.
;; We should ensure the bigquery differences again.
(defmethod sql-tools/referenced-tables-raw-impl :macaw
  [_parser driver sql-str]
  (-> sql-str
      (macaw/parsed-query)
      (macaw/query->components {:strip-contexts? true})
      :tables
      (->> (map :component)
           (map #(sql-tools.common/normalize-table-spec driver %)))))

(defmethod sql-tools/simple-query?-impl :macaw
  [_parser sql-string]
  (try
    ;; BEWARE: No driver available, so we pass nil. This means macaw-options will be minimal.
    (let [^net.sf.jsqlparser.statement.select.PlainSelect parsed (parsed-query sql-string nil)]
      (cond
        (not (instance? net.sf.jsqlparser.statement.select.PlainSelect parsed))
        {:is_simple false
         :reason "Not a simple SELECT"}

        (.getLimit parsed)
        {:is_simple false
         :reason "Contains a LIMIT"}

        (.getOffset parsed)
        {:is_simple false
         :reason "Contains an OFFSET"}

        (seq (.getWithItemsList parsed))
        {:is_simple false
         :reason "Contains a CTE"}

        :else
        {:is_simple true}))
    (catch Exception e
      (log/debugf e "Failed to parse query: %s" (ex-message e))
      {:is_simple false})))

(defmethod sql-tools/add-into-clause-impl :macaw
  [_parser driver sql table-name]
  (let [^net.sf.jsqlparser.statement.select.Select parsed-query (parsed-query sql driver)
        ^net.sf.jsqlparser.statement.select.PlainSelect select-body (.getSelectBody parsed-query)]
    (.setIntoTables select-body [(net.sf.jsqlparser.schema.Table. ^String table-name)])
    (str parsed-query)))

(defmethod sql-tools/replace-names-impl :macaw
  [_parser driver sql-string replacements opts]
  ;; Note: :case-insensitive :agnostic causes ClassCastException in Macaw's replace-names
  ;; due to regex pattern handling. Omit it for now until Macaw is fixed.
  (macaw/replace-names sql-string replacements (merge (dissoc (macaw-options driver) :case-insensitive) opts)))
