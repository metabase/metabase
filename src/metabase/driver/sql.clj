(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [potemkin :as p]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(comment sql.params.substitution/keep-me) ; this is so `cljr-clean-ns` and the linter don't remove the `:require`

(driver/register! :sql, :abstract? true)

(doseq [feature [:advanced-math-expressions
                 :binning
                 :expression-aggregations
                 :expressions
                 :full-join
                 :inner-join
                 :left-join
                 :native-parameters
                 :nested-queries
                 :parameterized-sql
                 :percentile-aggregations
                 :regex
                 :right-join
                 :standard-deviation-aggregations
                 :metadata/key-constraints
                 :window-functions/cumulative
                 :window-functions/offset
                 :distinct-where
                 :native-temporal-units
                 :expressions/datetime
                 :expressions/date
                 :expressions/text
                 :expressions/today
                 :distinct-where
                 :database-routing
                 :dependencies/native]]
  (defmethod driver/database-supports? [:sql feature] [_driver _feature _db] true))

(defmethod driver/database-supports? [:sql :persist-models-enabled]
  [driver _feat db]
  (and
   (driver/database-supports? driver :persist-models db)
   (-> db :settings :persist-models-enabled)))

(defmethod driver/mbql->native :sql
  [driver query]
  (sql.qp/mbql->native driver query))

(defmethod driver/prettify-native-form :sql
  [driver native-form]
  (sql.u/format-sql-and-fix-params driver native-form))

(mu/defmethod driver/substitute-native-parameters :sql
  [_driver {:keys [query] :as inner-query} :- [:and [:map-of :keyword :any] [:map {:query driver-api/schema.common.non-blank-string}]]]
  (let [params-map          (params.values/query->params-map inner-query)
        referenced-card-ids (params.values/referenced-card-ids params-map)
        [query params]      (-> query
                                params.parse/parse
                                (sql.params.substitute/substitute params-map))]
    (cond-> (assoc inner-query
                   :query  query
                   :params params)
      (seq referenced-card-ids)
      (update :query-permissions/referenced-card-ids set/union referenced-card-ids))))

(defmulti json-field-length
  "Return a HoneySQL expression that calculates the number of characters in a JSON field for a given driver.
  `json-field-identifier` is the Identifier ([[metabase.util.honey-sql-2/Identifier]]) for a JSON field."
  {:added "0.49.22", :arglists '([driver json-field-identifier])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod json-field-length :default
  [_driver _native-form]
  ;; we rely on this to tell if the method is implemented for this driver or not
  ::nyi)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Connection Impersonation                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti set-role-statement
  "SQL for setting the active role for a connection, such as USE ROLE or equivalent, for the given driver."
  {:added "0.47.0" :arglists '([driver role])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod set-role-statement :default
  [_ _ _]
  nil)

(defmulti default-database-role
  "The name of the default role for a given database, used for queries that do not have custom user
  impersonation rules configured for them. This must be implemented for each driver that supports user impersonation."
  {:added "0.47.0" :arglists '(^String [driver database])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod default-database-role :default
  [_ _database]
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Transforms                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/run-transform! [:sql :table]
  [driver {:keys [conn-spec output-table] :as transform-details} {:keys [overwrite?]}]
  (let [queries (cond->> [(driver/compile-transform driver transform-details)]
                  overwrite? (cons (driver/compile-drop-table driver output-table)))]
    {:rows-affected (last (driver/execute-raw-queries! driver conn-spec queries))}))

(defn qualified-name
  "Return the name of the target table of a transform as a possibly qualified symbol."
  [{schema :schema, table-name :name}]
  (if schema
    (keyword schema table-name)
    (keyword table-name)))

(defmethod driver/drop-transform-target! [:sql :table]
  [driver database target]
  ;; driver/drop-table! takes table-name as a string, but the :sql-jdbc implementation uses
  ;; honeysql, and accepts a keyword too. This way we delegate proper escaping and qualification to honeysql.
  (driver/drop-table! driver (:id database) (qualified-name target)))

(defmulti normalize-unquoted-name
  "Normalize an unquoted table/column name according to the database's rules."
  {:arglists '([driver name-str])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod normalize-unquoted-name :sql
  [_ name-str]
  (u/lower-case-en name-str))

(defn normalize-name
  "Normalizes the (primarily table/column) name passed in.
  Should return a value that matches the name listed in the appdb."
  [driver name-str]
  (let [quote-style (sql.qp/quote-style driver)
        quote-char (if (= quote-style :mysql) \` \")]
    (if (and (= (first name-str) quote-char)
             (= (last name-str) quote-char))
      (let [quote-quote (str quote-char quote-char)
            quote (str quote-char)]
        (-> name-str
            (subs 1 (dec (count name-str)))
            (str/replace quote-quote quote)))
      (normalize-unquoted-name driver name-str))))

(defmulti default-schema
  "Returns the default schema for a given database driver.

  Drivers that support any of the `:transforms/...` features must implement this method."
  {:added "0.57.0" :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod default-schema :sql
  [_]
  "public")

(defn find-table-or-transform
  "Given a table and schema that has been parsed out of a native query, finds either a matching table or a matching transform.
   It will return either {:table table-id} or {:transform transform-id}, or nil if neither is found."
  [driver tables transforms {:keys [table schema]}]
  (let [normalized-table (normalize-name driver table)
        normalized-schema (or (some->> schema (normalize-name driver))
                              (default-schema driver))
        matches? (fn [db-table db-schema]
                   (and (= normalized-table db-table)
                        (= normalized-schema db-schema)))]
    (or (some (fn [{:keys [name schema id]}]
                (when (matches? name schema)
                  {:table id}))
              tables)
        (some (fn [{:keys [id] {:keys [name schema]} :target}]
                (when (matches? name schema)
                  {:transform id}))
              transforms))))

(defmethod driver/native-query-deps :sql
  ([driver query]
   (driver/native-query-deps driver query
                             (driver-api/metadata-provider)
                             (t2/select [:model/Transform :id :target])))
  ([driver query metadata-provider transforms]
   (let [db-tables (driver-api/tables metadata-provider)]
     (->> query
          macaw/parsed-query
          macaw/query->components
          :tables
          (map :component)
          (into #{} (keep #(find-table-or-transform driver db-tables transforms %)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Transforms                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- table-key [entity]
  (select-keys entity [:table :schema]))

;; POC implementation for native SQL validation with subquery support

(declare extract-result-metadata)

(defmulti analyze-table-item
  "Analyze a table item (table or subquery) and extract its alias and metadata."
  {:arglists '([item driver metadata-provider db-tables tables-map])}
  (fn [item _driver _metadata-provider _db-tables _tables-map]
    (type item)))

(defmethod analyze-table-item net.sf.jsqlparser.schema.Table
  [^net.sf.jsqlparser.schema.Table table _driver _metadata-provider _db-tables _tables-map]
  (let [alias (or (when-let [alias (.getAlias table)]
                    (.getName alias))
                  (.getName table))]
    {alias {:type :table
            :name (.getName table)}}))

(defmethod analyze-table-item net.sf.jsqlparser.statement.select.ParenthesedSelect
  [subquery driver metadata-provider db-tables _tables-map]
  (let [;; Use the provided alias or generate a unique one
        alias                (or (when-let [alias-obj (.getAlias subquery)]
                                   (.getName alias-obj))
                                 (str "subquery_" (hash subquery)))
        inner-select         (.getSelect subquery)
        ;; Build tables-map for this subquery level
        source-columns       (->> inner-select
                                  macaw/query->components
                                  :source-columns)
        source-tables        (into #{} (map table-key) source-columns)
        ;; Normalize db-tables for matching
        normalized-db-tables (map (fn [table]
                                    (-> table
                                        (update :name #(normalize-name driver %))
                                        (update :schema #(normalize-name driver %))))
                                  db-tables)
        inner-tables-map     (into {}
                                   (keep (fn [current]
                                           (let [with-default-schema (if (:schema current)
                                                                       current
                                                                       (assoc current :schema (default-schema driver)))]
                                             (when-let [table (find-table-or-transform driver normalized-db-tables #{} with-default-schema)]
                                               [current (:table table)]))))
                                   source-tables)
        ;; RECURSIVELY extract subquery columns
        subquery-columns     (extract-result-metadata driver metadata-provider inner-select db-tables inner-tables-map)
        ;; Check if any columns in the subquery are invalid
        has-invalid-columns? (some #(false? (:valid-select %)) subquery-columns)]
    ;; If the subquery has invalid columns, mark all its output columns as invalid
    {alias
     {:type    :subquery
      :columns (if has-invalid-columns?
                 (mapv #(assoc % :valid-select false) subquery-columns)
                 subquery-columns)}}))

(defmethod analyze-table-item :default
  [_item _driver _metadata-provider _db-tables _tables-map]
  nil)

(defn- extract-table-aliases
  "Extract table aliases from FROM and JOIN clauses.
   Returns a map of {alias-string {:type :table/:subquery :name table-name}}
   or {alias-string {:type :subquery :columns [...]}} for subqueries."
  [parsed driver metadata-provider db-tables tables-map]
  (let [from-item    (when parsed
                       (.getFromItem parsed))
        from-items   (if from-item [from-item] [])
        from-aliases (into {}
                           (keep #(analyze-table-item % driver metadata-provider db-tables tables-map))
                           from-items)
        ;; Process JOINs - handle null case
        joins        (when parsed
                       (or (.getJoins parsed) []))
        join-aliases (into {}
                           (keep (fn [join]
                                   (when-let [right (.getFromItem join)]
                                     (analyze-table-item right driver metadata-provider db-tables tables-map))))
                           joins)]
    (merge from-aliases join-aliases)))

(defn- validate-source-column
  [driver metadata-provider tables-map {:keys [column] :as source-column}]
  (let [table-key-val (table-key source-column)
        table-id      (get tables-map table-key-val)]
    (if table-id
      ;; Real table - check if column exists
      (let [fields                 (driver-api/fields metadata-provider table-id)
            ;; Normalize all field names for comparison
            normalized-field-names (set (map #(normalize-name driver (:name %)) fields))
            normalized-column      (normalize-name driver column)]
        (contains? normalized-field-names normalized-column))
      ;; Not a real table (probably subquery) - we can't validate
      false)))

(defn- parse-column-reference
  "Parse a column reference that may include schema, table, and column parts.
   Returns a map with :schema (optional), :table-ref (optional), and :column-name.

   Examples:
   - 'column' -> {:column-name 'column'}
   - 'table.column' -> {:table-ref 'table', :column-name 'column'}
   - 'schema.table.column' -> {:schema 'schema', :table-ref 'table', :column-name 'column'}"
  [column-ref]
  (if (str/includes? column-ref ".")
    (let [parts (str/split column-ref #"\.")]
      (case (count parts)
        2 {:table-ref   (first parts)
           :column-name (second parts)}
        3 {:schema      (first parts)
           :table-ref   (second parts)
           :column-name (nth parts 2)}
        ;; More than 3 parts or 1 part shouldn't happen but handle gracefully
        {:column-name (last parts)}))
    {:column-name column-ref}))

(defn- validate-column-reference
  "Validate that a column reference exists in the appropriate context.
   Returns true if the column exists in:
   - A real table (via validate-source-column)
   - A subquery's result set (virtual table)
   Returns false if the column doesn't exist."
  [driver metadata-provider column-ref table-aliases tables-map metadata-context]
  ;; TODO: use schema
  (let [{:keys [_schema table-ref column-name]} (parse-column-reference column-ref)
        has-column-name?                        (fn [col] (= (normalize-name driver (:name col))
                                                             (normalize-name driver column-name)))
        find-column                             (fn [cols] (first (filter has-column-name? cols)))
        ;; For schema.table.column, use just table part for alias lookup
        table-info                              (some->> table-ref (get table-aliases))
        ;; Check if we're in a subquery-only context (no regular tables in FROM)
        only-subqueries?                        (and (seq table-aliases)
                                                     (every? #(= (:type %) :subquery) (vals table-aliases)))]
    (cond
      ;; Qualified reference to a subquery virtual table
      (and table-ref
           table-info
           (= (:type table-info) :subquery))
      (if-let [col (find-column (get metadata-context (keyword table-ref)))]
        (:valid-select col)
        false)

      ;; Qualified reference to a regular table
      (and table-ref
           table-info
           (= (:type table-info) :table))
      ;; Call the real validate-source-column
      (let [actual-table  (:name table-info)
            ;; Need to find the full table-key with schema if present
            matching-key  (first (filter #(= (:table %) actual-table) (keys tables-map)))
            source-column (if matching-key
                            (assoc matching-key :column column-name)
                            {:table actual-table :column column-name})]
        (validate-source-column driver metadata-provider tables-map source-column))

      ;; Unqualified column - search scope depends on context
      :else
      (if only-subqueries?
        ;; ONLY search virtual tables when we have only subqueries in FROM
        (if-let [col (some (fn [[k v]]
                             (when-not (= :tables k)
                               (find-column v)))
                           metadata-context)]
          (:valid-select col)
          false)
        ;; Otherwise check both real tables AND virtual tables
        (or
         ;; First check real tables via validate-source-column
         (some (fn [table-key]
                 (let [source-column (assoc table-key :column column-name)]
                   (validate-source-column driver metadata-provider tables-map source-column)))
               (keys tables-map))
         ;; Then check virtual tables - also check valid-select
         (if-let [col (some (fn [[k v]]
                              (when (and (keyword? k) (vector? v))
                                (find-column v)))
                            metadata-context)]
           (:valid-select col)
           false))))))

(defmulti expand-expression
  "Expand a SELECT expression into column metadata based on its type."
  {:arglists '([expr table-aliases driver metadata-provider tables-map metadata-context])}
  (fn [expr _table-aliases _driver _metadata-provider _tables-map _metadata-context]
    (type expr)))

(defmethod expand-expression net.sf.jsqlparser.statement.select.AllTableColumns
  [expr table-aliases _driver metadata-provider tables-map metadata-context]
  (let [table-ref (-> expr .getTable str)
        table-info (get table-aliases table-ref)]
    (cond
      ;; Table reference is a subquery alias
      (and table-info (= (:type table-info) :subquery))
      (or (get metadata-context (keyword table-ref))
          [{:name (str expr) :valid-select false}])

      ;; Table reference is a regular table alias
      (and table-info (= (:type table-info) :table))
      (let [actual-table (:name table-info)
            ;; Find the matching table-key with schema if present
            matching-key (first (filter #(= (:table %) actual-table) (keys tables-map)))
            table-key (or matching-key {:table actual-table})]
        (if-let [table-id (get tables-map table-key)]
          (mapv (fn [field]
                  {:name (:name field)
                   :valid-select true})
                (driver-api/fields metadata-provider table-id))
          [{:name (str expr) :valid-select false}])))))

(defmethod expand-expression net.sf.jsqlparser.statement.select.AllColumns
  [_expr table-aliases _driver metadata-provider tables-map metadata-context]
  ;; Check if we're selecting from a virtual table (subquery)
  ;; If there's only one table alias and it's a subquery, use its columns
  (if (and (= 1 (count table-aliases))
           (= :subquery (:type (first (vals table-aliases)))))
    ;; Use columns from the virtual table - they're always valid
    (let [alias (first (keys table-aliases))]
      (or (mapv (fn [col] {:name (:name col) :valid-select true})
                (get metadata-context (keyword alias)))
          [{:name "*" :valid-select false}]))
    ;; Otherwise use regular table expansion
    (if (seq tables-map)
      ;; We have tables-map, use it
      (into []
            (mapcat (fn [[_table-key table-id]]
                      (mapv (fn [field]
                              {:name         (:name field)
                               :valid-select true})
                            (driver-api/fields metadata-provider table-id))))
            tables-map)
      ;; No tables-map but we might have table aliases from FROM clause
      (if (seq table-aliases)
        ;; Try to expand using table aliases
        (let [real-tables (filter #(= :table (:type %)) (vals table-aliases))]
          (if (seq real-tables)
            ;; We have real tables, but need to find them in db-tables
            ;; Return false for now since we can't look them up without db-tables
            [{:name "*" :valid-select false}]
            [{:name "*" :valid-select false}]))
        [{:name "*" :valid-select false}]))))

(defmethod expand-expression net.sf.jsqlparser.expression.Function
  [func table-aliases driver metadata-provider tables-map metadata-context]
  (let [func-str (str func)
        params   (.getParameters func)]
    ;; Functions are always valid selections (they produce computed values)
    ;; But we need to validate any column references within them
    (if (and params (seq params))
      (let [first-param  (first params)
            valid-select (if (instance? net.sf.jsqlparser.schema.Column first-param)
                           (validate-column-reference driver metadata-provider (str first-param)
                                                      table-aliases tables-map metadata-context)
                           true)]
        [{:name func-str :valid-select valid-select}])
      ;; No parameters or not a column reference - always valid
      [{:name func-str :valid-select true}])))

(defn- create-tables-map
  [driver db-tables parsed-query]
  (let [source-columns       (->> parsed-query
                                  macaw/query->components
                                  :source-columns)
        source-tables        (into #{} (map table-key) source-columns)
        ;; Normalize the db-tables for matching
        normalized-db-tables (map (fn [table]
                                    (-> table
                                        (update :name #(normalize-name driver %))
                                        (update :schema #(normalize-name driver %))))
                                  db-tables)]
    (into {}
          (keep (fn [current]
                  ;; If current doesn't have a schema, try with the default schema
                  (let [with-default-schema (if (:schema current)
                                              current
                                              (assoc current :schema (default-schema driver)))
                        result              (find-table-or-transform driver normalized-db-tables #{} with-default-schema)]
                    (when result
                      [current (:table result)]))))
          source-tables)))

(defmethod expand-expression net.sf.jsqlparser.statement.select.ParenthesedSelect
  [subquery _table-aliases driver metadata-provider db-tables _metadata-context]
  ;; ParenthesedSelect as an expression (not in FROM/JOIN) must be a scalar subquery
  ;; Scalar subqueries are always valid as they produce a computed value
  (let [inner-select     (.getSelect subquery)
        inner-tables-map (create-tables-map driver db-tables inner-select)
        subquery-result  (extract-result-metadata driver metadata-provider inner-select db-tables inner-tables-map)]
    ;; Check if the subquery itself has valid column references
    (if (seq subquery-result)
      [{:name         (str subquery)
        :valid-select (every? :valid-select subquery-result)}]
      [{:name (str subquery) :valid-select true}])))

(defmethod expand-expression :default
  [expr table-aliases driver metadata-provider tables-map metadata-context]
  (let [expr-str     (str expr)
        valid-select (if (instance? net.sf.jsqlparser.schema.Column expr)
                       (validate-column-reference driver metadata-provider expr-str
                                                  table-aliases tables-map metadata-context)
                       true)]
    [{:name expr-str :lib/type :metadata/column :base-type :type/* :valid-select valid-select}]))

(defn- expand-select-item
  "Expand a single select item, applying alias if present"
  [item table-aliases driver metadata-provider tables-map metadata-context]
  (let [expr     (.getExpression item)
        alias    (when-let [alias-obj (.getAlias item)]
                   (.getName alias-obj))
        expanded (expand-expression expr table-aliases driver metadata-provider tables-map metadata-context)]
    (if (and alias (= 1 (count expanded)))
      [(assoc (first expanded) :name alias)]
      expanded)))

(defn- extract-result-metadata
  "Extract result metadata from a SQL SELECT query.
   Returns a vector of column metadata maps with {:name ... :valid-select true/false}"
  [driver metadata-provider sql-or-parsed db-tables tables-map]
  (let [parsed        (if (string? sql-or-parsed)
                        (macaw/parsed-query sql-or-parsed)
                        sql-or-parsed)
        ;; Build table aliases map WITH subquery column metadata
        table-aliases (extract-table-aliases parsed driver metadata-provider db-tables tables-map)
        ;; If tables-map is empty but we have table aliases, try to build it from the aliases
        tables-map    (if (and (empty? tables-map) (seq table-aliases))
                        (let [;; Normalize the db-tables for matching
                              normalized-db-tables (map (fn [table]
                                                          (-> table
                                                              (update :name #(normalize-name driver %))
                                                              (update :schema #(normalize-name driver %))))
                                                        db-tables)]
                          (into {}
                                (keep (fn [[_alias info]]
                                        (when (= (:type info) :table)
                                          (let [table-name          (:name info)
                                                with-default-schema {:table table-name :schema (default-schema driver)}
                                                result              (find-table-or-transform driver normalized-db-tables #{} with-default-schema)]
                                            (when result
                                              [{:table table-name} (:table result)])))))
                                table-aliases))
                        tables-map)
        ;; Store subquery columns in context for reference
        metadata-context-with-subqueries
        (reduce (fn [ctx [alias info]]
                  (if (= (:type info) :subquery)
                    (assoc ctx (keyword alias) (:columns info))
                    ctx))
                {:tables db-tables}
                table-aliases)
        select-items  (when parsed
                        (.getSelectItems parsed))]
    (if select-items
      (into []
            (mapcat #(expand-select-item % table-aliases driver metadata-provider tables-map metadata-context-with-subqueries))
            select-items)
      [])))

(defmethod driver/native-result-metadata :sql
  [driver metadata-provider native-query]
  (let [parsed     (macaw/parsed-query native-query)
        db-tables  (driver-api/tables metadata-provider)
        tables-map (create-tables-map driver db-tables parsed)]
    (extract-result-metadata driver metadata-provider parsed db-tables tables-map)))

(defmethod driver/validate-native-query-fields :sql
  [driver metadata-provider query]
  (let [result (driver/native-result-metadata driver metadata-provider query)]
    ;; Return true if all selected columns are valid
    (every? :valid-select result)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [sql.params.substitution ->prepared-substitution PreparedStatementSubstitution])
