(ns metabase.sql-tools.macaw.core
  (:require
   [clojure.string :as str]
   [macaw.ast :as macaw.ast]
   [macaw.core :as macaw]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.interface :as sql-tools]
   [metabase.sql-tools.macaw.references :as sql-tools.macaw.references]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
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
  (macaw/parsed-query sql (merge (macaw-options driver) opts)))

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

(mu/defn- referenced-tables
  [driver :- :keyword
   query  :- :metabase.lib.schema/native-only-query]
  (let [specs         (-> query
                          lib/raw-native-query
                          (parsed-query driver)
                          (macaw/query->components {:strip-contexts? true})
                          :tables
                          (->> (map :component))
                          (->> (map split-compound-table-spec))
                          (->> (mapv #(sql-tools.common/normalize-table-spec driver %))))
        table-ids     (sql-tools.common/table-ids-by-name (lib/database-id query) (keep :table specs))
        db-tables     (lib.metadata/bulk-metadata query :metadata/table table-ids)
        db-transforms (lib.metadata/transforms query)]
    (sql-tools.common/resolve-table-specs driver (lib.metadata/database query) db-tables db-transforms specs)))

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

(defmethod sql-tools/referenced-tables-raw-impl :macaw
  [_parser _driver sql-str _opts]
  (-> sql-str
      (macaw/parsed-query)
      (macaw/query->components {:strip-contexts? true})
      :tables
      (->> (map :component)
           (mapv (fn [{:keys [schema table]}]
                   (cond-> {:table table}
                     schema (assoc :schema schema)))))))

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
      (log/debugf "Failed to parse query: %s" (ex-message e))
      {:is_simple false})))

(defn- into-select
  "The SELECT of `select` that takes an INTO clause: `select` itself, or the first SELECT of a set operation. Nil for
  anything else, such as a parenthesized first query."
  ^net.sf.jsqlparser.statement.select.PlainSelect [select]
  (cond
    (instance? net.sf.jsqlparser.statement.select.PlainSelect select)
    select

    (instance? net.sf.jsqlparser.statement.select.SetOperationList select)
    (into-select (first (.getSelects ^net.sf.jsqlparser.statement.select.SetOperationList select)))))

(defmethod sql-tools/add-into-clause-impl :macaw
  [_parser driver sql table-name]
  (let [parsed-query (parsed-query sql driver)
        ^net.sf.jsqlparser.statement.select.PlainSelect
        select-body  (or (into-select parsed-query)
                         (throw (ex-info "SQL must be a SELECT statement, or a set operation whose first query is one"
                                         {:sql sql})))]
    (.setIntoTables select-body [(net.sf.jsqlparser.schema.Table. ^String table-name)])
    (str parsed-query)))

(defmethod sql-tools/add-insert-clause-impl :macaw
  [_parser _driver sql table-name]
  ;; Macaw does not move a `WITH` clause before `INSERT INTO`.
  (format "INSERT INTO %s %s" table-name sql))

(defmethod sql-tools/replace-names-impl :macaw
  [_parser driver sql-string replacements opts]
  ;; Note: :case-insensitive :agnostic causes ClassCastException in Macaw's replace-names
  ;; due to regex pattern handling. Omit it for now until Macaw is fixed.
  (macaw/replace-names sql-string replacements (merge (dissoc (macaw-options driver) :case-insensitive) opts)))

(defmethod sql-tools/transpile-sql-impl :macaw
  [_parser _sql _from-dialect _to-dialect]
  (throw (java.lang.UnsupportedOperationException.
          "sql-tools/transpile-sql :macaw is not implemented.")))

;;;; join-steps
;;; The Transform Inspector's step queries as it built them from Macaw's AST before sqlglot, so that the Macaw backend
;;; keeps them until it is retired.

(defn- identifier
  "The HoneySQL identifier of `kind` for the name parts `parts`, each normalized for `driver`, leaving out nil ones."
  [driver kind & parts]
  (apply h2x/identifier kind (keep #(some->> % (sql.normalize/normalize-name driver)) parts)))

(defn- table->hsql
  "The Macaw table node `node` as a HoneySQL FROM or JOIN entry: `[identifier alias]`, or `[identifier]` unaliased."
  [driver {:keys [schema table table-alias]}]
  (cond-> [(identifier driver :table schema table)]
    table-alias (conj (keyword (sql.normalize/normalize-name driver table-alias)))))

(defn- expr->hsql
  "The Macaw column or literal `node` as HoneySQL, or nil for anything else."
  [driver {:keys [schema table column value] :as node}]
  (case (:type node)
    :macaw.ast/column  (identifier driver :field schema table column)
    ;; Inlined, because the steps are returned as SQL alone, with no parameters.
    :macaw.ast/literal (when (some? value) [:inline value])
    nil))

(defn- condition->hsql
  "The Macaw binary expression `condition` as HoneySQL, or nil if any operand is not a column or literal."
  [driver {:keys [operator left right] :as condition}]
  (when (= :macaw.ast/binary-expression (:type condition))
    (let [op (u/upper-case-en (str operator))]
      (if (#{"AND" "OR"} op)
        (let [left  (condition->hsql driver left)
              right (condition->hsql driver right)]
          (when (and left right)
            ;; HoneySQL reads only the lower-case keyword as the operator, and an upper-case one as a function.
            [(keyword (u/lower-case-en op)) left right]))
        (let [left  (expr->hsql driver left)
              right (expr->hsql driver right)]
          (when (and left right)
            [(keyword operator) left right]))))))

(defn- join-condition->hsql
  "The ON clause of the Macaw join node `join` as one HoneySQL condition, or nil when no part of it converts."
  [driver join]
  (let [parts (keep #(condition->hsql driver %) (:condition join))]
    (case (count parts)
      0 nil
      1 (first parts)
      (into [:and] parts))))

(def ^:private join-type->strategy
  {:left    :left-join
   :right   :right-join
   :full    :full-join
   :cross   :cross-join
   :natural :inner-join
   :inner   :inner-join})

(def ^:private strategy->hsql-join
  ;; HoneySQL's :join is INNER JOIN.
  {:inner-join :join
   :left-join  :left-join
   :right-join :right-join
   :full-join  :full-join
   :cross-join :cross-join})

(defn- join-step-source
  "The Macaw table node `node` as a [[metabase.sql-tools.core/join-steps]] source without its `:sql`."
  [driver {:keys [table table-alias]}]
  {:source :table
   :table  (sql.normalize/normalize-name driver table)
   :alias  (sql.normalize/normalize-name driver (or table-alias table))})

(defn- join-steps-sql
  "The `ok` result of [[metabase.sql-tools.core/join-steps]] for the Macaw SELECT node `ast`, whose sources are all
  tables."
  [driver ast]
  (let [count-sql #(first (sql.qp/format-honeysql driver %))
        from      [(table->hsql driver (:from ast))]
        joins     (mapv (fn [join]
                          (let [node      (:source join)
                                strategy  (get join-type->strategy (:join-type join) :inner-join)
                                condition (join-condition->hsql driver join)]
                            {:source    (join-step-source driver node)
                             :strategy  strategy
                             :condition condition
                             :join-by   [(strategy->hsql-join strategy) [(table->hsql driver node) condition]]}))
                        (:join ast))]
    {:from  (assoc (join-step-source driver (:from ast)) :sql (count-sql {:select [[[:count :*]]], :from from}))
     :steps (vec (for [chain (rest (reductions conj [] joins))
                       :let  [{:keys [source strategy condition]} (peek chain)]]
                   (assoc source
                          :strategy strategy
                          :sql      (count-sql {:select  (if (and condition
                                                                  (#{:left-join :right-join :full-join} strategy))
                                                           [[[:count :*]] [[:count [:case condition [:inline 1]]]]]
                                                           [[[:count :*]]])
                                                :from    from
                                                :join-by (into [] (mapcat :join-by) chain)}))))}))

(defmethod sql-tools/join-steps-impl :macaw
  [_parser driver query]
  (let [parsed (parsed-query (lib/raw-native-query query) driver)
        ast    (when-not (:error parsed)
                 (macaw.ast/->ast parsed {:with-instance? false}))]
    (cond
      (:error parsed)
      {:unsupported :unparseable}

      (not= :macaw.ast/select (:type ast))
      {:unsupported :not-a-select}

      ;; A subquery source has no table name to build an identifier from.
      (not-every? :table (cons (:from ast) (map :source (:join ast))))
      {:unsupported :unsupported-source}

      :else
      (join-steps-sql driver ast))))
