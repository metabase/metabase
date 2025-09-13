(ns metabase-enterprise.dependencies.sql-query-test-cases
  "Test SQL queries for validating result metadata extraction.
   Progresses from simple to complex patterns to test macaw capabilities."
  (:require
   [clojure.test :refer [deftest is testing]]
   [macaw.core :as macaw]))

;; Could this kind of thing work? Mayyyyybe? At least some of the time? "Best effort"
(def type->aggregate-type
  "Map of base types to their aggregate result types.
   These are fuzzy types indicating the possible result of aggregation.
   In production, this could be database-driver specific."
  {:type/Integer :type/IntegerLike ; Could be int, bigint, etc.
   :type/BigInteger :type/IntegerLike
   :type/Decimal :type/NumericLike ; Could be decimal with different precision
   :type/Float :type/NumericLike ; AVG often promotes to float/double
   :type/Number :type/NumericLike
   :type/Text :type/Text ; String aggregates stay strings
   :type/Boolean :type/IntegerLike}) ; COUNT of booleans returns integer

(declare extract-result-metadata)

(defmulti analyze-table-item
  "Analyze a table item (FROM or JOIN) and return alias -> info mapping.
   Returns nil if the item cannot be analyzed."
  (fn [item _metadata-context] (type item)))

(defmethod analyze-table-item net.sf.jsqlparser.schema.Table
  [table _metadata-context]
  (let [table-name (.getName table)
        alias-obj (.getAlias table)
        alias-name (when alias-obj (.getName alias-obj))]
    {(or alias-name table-name)
     {:type :table
      :name table-name}}))

(defmethod analyze-table-item net.sf.jsqlparser.statement.select.ParenthesedSelect
  [subquery metadata-context]
  (let [alias-name (-> subquery .getAlias .getName)
        inner-select (.getSelect subquery)
        ;; RECURSIVELY extract subquery columns
        subquery-columns (extract-result-metadata inner-select metadata-context)]
    {alias-name
     {:type :subquery
      :columns subquery-columns}}))

(defmethod analyze-table-item :default
  [_item _metadata-context]
  {})

(defn extract-table-aliases
  "Extract table aliases from a parsed SQL query.
   Returns a map of alias -> table-info.
   For regular tables: {:type :table :name \"table_name\"}
   For subqueries: {:type :subquery :columns [...]}
   Note: metadata-context is needed for recursive subquery analysis."
  [parsed metadata-context]
  (let [;; Get alias from FROM clause
        from-item (.getFromItem parsed)
        from-aliases (when from-item
                       (analyze-table-item from-item metadata-context))
        ;; Get aliases from JOINs
        joins (.getJoins parsed)
        join-aliases (into {}
                           (comp
                            (keep #(.getRightItem %))
                            (map #(analyze-table-item % metadata-context)))
                           joins)]
    (merge from-aliases join-aliases)))

(defn find-column-type
  "Find the base_type for a column in the metadata context.
   Handles both qualified (table.column) and unqualified column references.
   Now also handles virtual tables created by subqueries."
  [column-ref table-aliases metadata-context]
  (let [[table-ref column-name] (if (clojure.string/includes? column-ref ".")
                                  (clojure.string/split column-ref #"\.")
                                  [nil column-ref])
        has-column-name? (fn [col] (= (:name col) column-name))
        table-info (some->> table-ref (get table-aliases))
        tables (:tables metadata-context)]
    (cond
      ;; Qualified reference to a subquery virtual table
      (and table-ref
           table-info
           (= (:type table-info) :subquery))
      (some->> (keyword table-ref) (get metadata-context) (filter has-column-name?) first :base_type)
      ;; Qualified reference to a regular table
      (and table-ref
           table-info
           (= (:type table-info) :table))
      (let [actual-table (:name table-info)]
        (some->> tables
                 (filter #(= (:name %) actual-table))
                 first
                 :columns
                 (filter has-column-name?)
                 first
                 :base_type))
      ;; Unqualified column - search all tables AND virtual tables
      :else
      (or
       ;; First check regular tables
       (some (fn [table]
               (:base_type (first (filter has-column-name? (:columns table)))))
             tables)
        ;; Then check virtual tables
       (some (fn [[k v]]
               (when (and (keyword? k) (vector? v))
                 (:base_type (first (filter has-column-name? v)))))
             metadata-context)))))

(defmulti expand-expression
  "Expand a SELECT expression into column metadata based on its type."
  (fn [expr _table-aliases _metadata-context] (type expr)))

(defmethod expand-expression net.sf.jsqlparser.statement.select.AllTableColumns
  [expr table-aliases metadata-context]
  (let [table-ref (-> expr .getTable str)
        table-info (get table-aliases table-ref)
        tables (:tables metadata-context)]
    (cond
      ;; Table reference is a subquery alias
      (and table-info (= (:type table-info) :subquery))
      (or (get metadata-context (keyword table-ref))
          [{:name (str expr)}])

      ;; Table reference is a regular table alias
      (and table-info (= (:type table-info) :table))
      (let [actual-table (:name table-info)]
        (if-let [table (some->> tables (filter #(= (:name %) actual-table)) first)]
          (mapv (fn [col]
                  {:name (:name col)
                   :base_type (:base_type col)})
                (:columns table))
          [{:name (str expr)}])))))

(defmethod expand-expression net.sf.jsqlparser.statement.select.AllColumns
  [_expr table-aliases metadata-context]
  ;; Check if we're selecting from a virtual table (subquery)
  ;; If there's only one table alias and it's a subquery, use its columns
  (if (and (= 1 (count table-aliases))
           (= :subquery (:type (first (vals table-aliases)))))
    ;; Use columns from the virtual table
    (let [alias (first (keys table-aliases))]
      (or (get metadata-context (keyword alias))
          [{:name "*"}]))
    ;; Otherwise use regular table expansion
    (if-let [tables (:tables metadata-context)]
      (into []
            (mapcat (fn [table]
                      (mapv (fn [col]
                              {:name (:name col)
                               :base_type (:base_type col)})
                            (:columns table))))
            tables)
      [{:name "*"}])))

;; I don't know if this is a good idea, but we could try doing something kind of like this?
;; It would need to be driver-specific.
(defmethod expand-expression net.sf.jsqlparser.expression.Function
  [func table-aliases metadata-context]
  (let [func-name (-> (.getName func) str .toUpperCase)
        func-str (str func)]
    (cond
      ;; Count always returns integer-like
      (= func-name "COUNT")
      [{:name func-str :base_type :type/IntegerLike}]

      ;; String aggregates always return text
      (#{"STRING_AGG" "GROUP_CONCAT" "LISTAGG"} func-name)
      [{:name func-str :base_type :type/Text}]

      ;; Statistical functions always return numeric (float-like)
      (#{"STDDEV" "STDDEV_POP" "STDDEV_SAMP"
         "VARIANCE" "VAR_POP" "VAR_SAMP"
         "CORR" "COVAR_POP" "COVAR_SAMP"} func-name)
      [{:name func-str :base_type :type/NumericLike}]

      ;; Standard aggregates that depend on input type
      (#{"SUM" "AVG" "MIN" "MAX" "MEDIAN"} func-name)
      (let [params (.getParameters func)]
        (if (and params (seq params))
          (let [first-param (first params)]
            (if (instance? net.sf.jsqlparser.schema.Column first-param)
              (let [col-ref (str first-param)
                    col-type (find-column-type col-ref table-aliases metadata-context)
                    aggregate-type (get type->aggregate-type col-type :type/NumericLike)]
                [{:name func-str :base_type aggregate-type}])
              [{:name func-str :base_type :type/NumericLike}]))
          [{:name func-str :base_type :type/NumericLike}]))

      ;; Array/JSON aggregates - can't determine Metabase base type
      (#{"ARRAY_AGG" "JSON_AGG" "JSONB_AGG" "XMLAGG"} func-name)
      [{:name func-str :base_type nil}]

      ;; Unknown functions
      :else
      [{:name func-str :base_type nil}])))

(defmethod expand-expression net.sf.jsqlparser.statement.select.ParenthesedSelect
  [subquery _table-aliases metadata-context]
  ;; ParenthesedSelect as an expression (not in FROM/JOIN) must be a scalar subquery
  (let [inner-select (.getSelect subquery)
        subquery-result (extract-result-metadata inner-select metadata-context)]
    ;; Scalar subqueries return exactly one value, so we use the first (only) column's type
    (if (seq subquery-result)
      [{:name (str subquery)
        :base_type (:base_type (first subquery-result))}]
      [{:name (str subquery) :base_type nil}])))

(defmethod expand-expression :default
  [expr table-aliases metadata-context]
  (let [expr-str (str expr)
        base-type (if (instance? net.sf.jsqlparser.schema.Column expr)
                    (find-column-type expr-str table-aliases metadata-context)
                    nil)]
    [{:name expr-str :base_type base-type}]))

(defn expand-select-item
  "Expand a single select item, applying alias if present"
  [item table-aliases metadata-context]
  (let [expression (.getExpression item)
        alias-obj (.getAlias item)
        alias-name (when alias-obj (.getName alias-obj))
        expanded (expand-expression expression table-aliases metadata-context)]
    (if (and alias-name (= 1 (count expanded)))
      [(assoc (first expanded) :name alias-name)]
      expanded)))

(defn extract-result-metadata
  "Extract result metadata from a SQL query given metadata context.
   Now handles subqueries recursively.
   Can be called with either a SQL string or a parsed query."
  [sql-or-parsed metadata-context]
  (let [;; Handle both SQL string and parsed query
        parsed (if (string? sql-or-parsed)
                 (macaw/parsed-query sql-or-parsed)
                 sql-or-parsed)
        ;; Step 1: Extract table aliases (including subqueries)
        table-aliases (extract-table-aliases parsed metadata-context)

        ;; Step 2: Add subquery columns as virtual tables to metadata
        enhanced-metadata (reduce-kv
                           (fn [ctx alias info]
                             (if (= (:type info) :subquery)
                               (assoc ctx (keyword alias) (:columns info))
                               ctx))
                           metadata-context
                           table-aliases)
        select-items (.getSelectItems parsed)]
    ;; Step 4: Process each SELECT item with enhanced metadata
    (into []
          (comp
           (mapcat #(expand-select-item % table-aliases enhanced-metadata))
           (map #(select-keys % [:name :base_type])))
          select-items)))

(def basic-queries
  "Simple SELECT queries with explicit columns"
  [{:name "single-column"
    :sql "SELECT id FROM users"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "email" :base_type :type/Text}]}]}
    :expected [{:name "id" :base_type :type/Integer}]}

   {:name "multiple-columns"
    :sql "SELECT id, name, email FROM users"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "email" :base_type :type/Text}]}]}
    :expected [{:name "id" :base_type :type/Integer}
               {:name "name" :base_type :type/Text}
               {:name "email" :base_type :type/Text}]}

   {:name "column-with-alias"
    :sql "SELECT id, name AS username FROM users"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "email" :base_type :type/Text}]}]}
    :expected [{:name "id" :base_type :type/Integer}
               {:name "username" :base_type :type/Text}]}

   {:name "all-columns-aliased"
    :sql "SELECT id AS user_id, name AS username, email AS contact FROM users"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "email" :base_type :type/Text}]}]}
    :expected [{:name "user_id" :base_type :type/Integer}
               {:name "username" :base_type :type/Text}
               {:name "contact" :base_type :type/Text}]}])

(deftest basic-queries-result-metadata-test
  (testing "Extract result metadata from basic SELECT queries"
    (doseq [{:keys [name sql metadata expected]} basic-queries]
      (testing (str "Query: " name)
        (let [result (extract-result-metadata sql metadata)]
          (is (= expected result)
              (str "Failed for query: " name
                   "\nSQL: " sql
                   "\nExpected: " expected
                   "\nActual: " result)))))))

(def wildcard-queries
  "Queries with wildcard selections"
  [{:name "simple-wildcard"
    :sql "SELECT * FROM users"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "email" :base_type :type/Text}
                                   {:name "created_at" :base_type :type/DateTime}]}]}
    :expected [{:name "id" :base_type :type/Integer}
               {:name "name" :base_type :type/Text}
               {:name "email" :base_type :type/Text}
               {:name "created_at" :base_type :type/DateTime}]
    :note "Wildcard expands to all table columns"}

   {:name "table-qualified-wildcard"
    :sql "SELECT u.* FROM users u"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "email" :base_type :type/Text}]}]}
    :expected [{:name "id" :base_type :type/Integer}
               {:name "name" :base_type :type/Text}
               {:name "email" :base_type :type/Text}]
    :note "Qualified wildcard expands to aliased table columns"}

   {:name "mixed-wildcard-and-columns"
    :sql "SELECT *, active FROM users"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "active" :base_type :type/Boolean}]}]}
    :expected [{:name "id" :base_type :type/Integer}
               {:name "name" :base_type :type/Text}
               {:name "active" :base_type :type/Boolean}
               {:name "active" :base_type :type/Boolean}]
    :note "Wildcard plus explicit column (may have duplicate)"}

   {:name "multiple-table-wildcards"
    :sql "SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}]}
                        {:name "orders"
                         :schema nil
                         :columns [{:name "order_id" :base_type :type/Integer}
                                   {:name "user_id" :base_type :type/Integer}
                                   {:name "total" :base_type :type/Float}]}]}
    :expected [{:name "id" :base_type :type/Integer}
               {:name "name" :base_type :type/Text}
               {:name "order_id" :base_type :type/Integer}
               {:name "user_id" :base_type :type/Integer}
               {:name "total" :base_type :type/Float}]
    :note "Expands both table wildcards"}])

(deftest wildcard-queries-result-metadata-test
  (testing "Extract result metadata from queries with wildcards"
    (doseq [{:keys [name sql metadata expected]} wildcard-queries]
      (testing (str "Query: " name)
        (let [result (extract-result-metadata sql metadata)]
          (is (= expected result)
              (str "Failed for query: " name
                   "\nSQL: " sql
                   "\nExpected: " expected
                   "\nActual: " result)))))))

(def join-queries
  "Queries with various JOIN patterns"
  [{:name "simple-inner-join"
    :sql "SELECT u.id, u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "email" :base_type :type/Text}]}
                        {:name "orders"
                         :schema nil
                         :columns [{:name "order_id" :base_type :type/Integer}
                                   {:name "user_id" :base_type :type/Integer}
                                   {:name "total" :base_type :type/Float}
                                   {:name "status" :base_type :type/Text}]}]}
    :expected [{:name "u.id" :base_type :type/Integer}
               {:name "u.name" :base_type :type/Text}
               {:name "o.total" :base_type :type/Float}]}

   {:name "join-with-table-prefix"
    :sql "SELECT users.id, orders.status FROM users JOIN orders ON users.id = orders.user_id"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}]}
                        {:name "orders"
                         :schema nil
                         :columns [{:name "user_id" :base_type :type/Integer}
                                   {:name "status" :base_type :type/Text}]}]}
    :expected [{:name "users.id" :base_type :type/Integer}
               {:name "orders.status" :base_type :type/Text}]}

   {:name "multiple-joins"
    :sql "SELECT u.name, o.total, p.price
          FROM users u
          JOIN orders o ON u.id = o.user_id
          JOIN products p ON o.product_id = p.id"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}]}
                        {:name "orders"
                         :schema nil
                         :columns [{:name "user_id" :base_type :type/Integer}
                                   {:name "product_id" :base_type :type/Integer}
                                   {:name "total" :base_type :type/Float}]}
                        {:name "products"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "price" :base_type :type/Decimal}]}]}
    :expected [{:name "u.name" :base_type :type/Text}
               {:name "o.total" :base_type :type/Float}
               {:name "p.price" :base_type :type/Decimal}]}

   {:name "self-join"
    :sql "SELECT e1.name AS employee, e2.name AS manager
          FROM employees e1
          LEFT JOIN employees e2 ON e1.manager_id = e2.id"
    :metadata {:tables [{:name "employees"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "manager_id" :base_type :type/Integer}]}]}
    :expected [{:name "employee" :base_type :type/Text}
               {:name "manager" :base_type :type/Text}]}

   {:name "unqualified-unambiguous-columns"
    :sql "SELECT email, status, price FROM users JOIN orders ON users.id = orders.user_id JOIN products ON orders.product_id = products.id"
    :metadata {:tables [{:name "users"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "email" :base_type :type/Text}]} ; only in users
                        {:name "orders"
                         :schema nil
                         :columns [{:name "user_id" :base_type :type/Integer}
                                   {:name "product_id" :base_type :type/Integer}
                                   {:name "status" :base_type :type/Text}]} ; only in orders
                        {:name "products"
                         :schema nil
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "price" :base_type :type/Decimal}]}]} ; only in products
    :expected [{:name "email" :base_type :type/Text}
               {:name "status" :base_type :type/Text}
               {:name "price" :base_type :type/Decimal}]
    :note "Unqualified columns that exist in only one table each"}])

(deftest join-queries-result-metadata-test
  (testing "Extract result metadata from JOIN queries"
    (doseq [{:keys [name sql metadata expected]} join-queries]
      (testing (str "Query: " name)
        (let [result (extract-result-metadata sql metadata)]
          (is (= expected result)
              (str "Failed for query: " name
                   "\nSQL: " sql
                   "\nExpected: " expected
                   "\nActual: " result)))))))

(def aggregate-queries
  "Queries with aggregate functions"
  [{:name "simple-count"
    :sql "SELECT COUNT(*) AS total FROM users"
    :metadata {:tables [{:name "users"
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}]}]}
    :expected [{:name "total" :base_type :type/IntegerLike}]}

   {:name "count-without-alias"
    :sql "SELECT COUNT(*) FROM users"
    :metadata {:tables [{:name "users"
                         :columns [{:name "id" :base_type :type/Integer}]}]}
    :expected [{:name "COUNT(*)" :base_type :type/IntegerLike}]
    :note "Should generate default name"}

   {:name "multiple-aggregates"
    :sql "SELECT COUNT(*) AS cnt, SUM(amount) AS total, AVG(amount) AS average FROM orders"
    :metadata {:tables [{:name "orders"
                         :columns [{:name "amount" :base_type :type/Decimal}]}]}
    :expected [{:name "cnt" :base_type :type/IntegerLike}
               {:name "total" :base_type :type/NumericLike}
               {:name "average" :base_type :type/NumericLike}]}

   {:name "group-by-with-aggregates"
    :sql "SELECT category, COUNT(*) AS cnt, SUM(price) AS total
          FROM products
          GROUP BY category"
    :metadata {:tables [{:name "products"
                         :columns [{:name "category" :base_type :type/Text}
                                   {:name "price" :base_type :type/Decimal}]}]}
    :expected [{:name "category" :base_type :type/Text}
               {:name "cnt" :base_type :type/IntegerLike}
               {:name "total" :base_type :type/NumericLike}]}

   {:name "having-clause"
    :sql "SELECT user_id, COUNT(*) AS order_count
          FROM orders
          GROUP BY user_id
          HAVING COUNT(*) > 5"
    :metadata {:tables [{:name "orders"
                         :columns [{:name "user_id" :base_type :type/Integer}]}]}
    :expected [{:name "user_id" :base_type :type/Integer}
               {:name "order_count" :base_type :type/IntegerLike}]}])

(deftest aggregate-queries-result-metadata-test
  (testing "Aggregate query result metadata extraction"
    (doseq [{:keys [name sql metadata expected]} aggregate-queries]
      (testing (str "Test: " name)
        (let [result (extract-result-metadata sql metadata)]
          (is (= expected result)))))))

(def advanced-aggregate-queries
  "Queries with advanced aggregate functions that challenge type inference"
  [{:name "string-aggregation"
    :sql "SELECT STRING_AGG(name, ', ') AS names FROM users"
    :metadata {:tables [{:name "users"
                         :columns [{:name "name" :base_type :type/Text}]}]}
    :expected [{:name "names" :base_type :type/Text}]
    :note "String aggregates always return text"}

   {:name "statistical-functions"
    :sql "SELECT STDDEV(amount) AS std, VARIANCE(amount) AS var FROM orders"
    :metadata {:tables [{:name "orders"
                         :columns [{:name "amount" :base_type :type/Integer}]}]}
    :expected [{:name "std" :base_type :type/NumericLike}
               {:name "var" :base_type :type/NumericLike}]
    :note "Statistical functions promote to float/double"}

   {:name "json-aggregation"
    :sql "SELECT JSON_AGG(data) AS json_result FROM events"
    :metadata {:tables [{:name "events"
                         :columns [{:name "data" :base_type :type/Text}]}]}
    :expected [{:name "json_result" :base_type nil}]
    :note "JSON_AGG type is ambiguous - could be JSON type or Text"}

   {:name "array-aggregation"
    :sql "SELECT ARRAY_AGG(id) AS id_array FROM users"
    :metadata {:tables [{:name "users"
                         :columns [{:name "id" :base_type :type/Integer}]}]}
    :expected [{:name "id_array" :base_type nil}]
    :note "ARRAY types don't map to Metabase base types"}

   {:name "unknown-aggregate"
    :sql "SELECT CUSTOM_AGG(value) AS result FROM data"
    :metadata {:tables [{:name "data"
                         :columns [{:name "value" :base_type :type/Decimal}]}]}
    :expected [{:name "result" :base_type nil}]
    :note "Unknown aggregate functions return nil type"}])

(deftest advanced-aggregate-queries-result-metadata-test
  (testing "Advanced aggregate query result metadata extraction"
    (doseq [{:keys [name sql metadata expected note]} advanced-aggregate-queries]
      (testing (str "Test: " name " - " note)
        (let [result (extract-result-metadata sql metadata)]
          (is (= expected result)))))))

(def subquery-queries
  "Queries with subqueries"
  [{:name "subquery-in-from"
    :sql "SELECT * FROM (SELECT id, name FROM users WHERE active = true) AS active_users"
    :metadata {:tables [{:name "users"
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}
                                   {:name "active" :base_type :type/Boolean}]}]}
    :expected [{:name "id" :base_type :type/Integer}
               {:name "name" :base_type :type/Text}]}

   {:name "subquery-with-alias"
    :sql "SELECT sub.user_id, sub.total
          FROM (SELECT user_id, SUM(amount) AS total FROM orders GROUP BY user_id) sub"
    :metadata {:tables [{:name "orders"
                         :columns [{:name "user_id" :base_type :type/Integer}
                                   {:name "amount" :base_type :type/Decimal}]}]}
    :expected [{:name "sub.user_id" :base_type :type/Integer}
               {:name "sub.total" :base_type :type/NumericLike}]
    :note "Subquery aliases create virtual tables - type inference now works!"}

   {:name "scalar-subquery-in-select"
    :sql "SELECT name,
                 (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id) AS order_count
          FROM users"
    :metadata {:tables [{:name "users"
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}]}
                        {:name "orders"
                         :columns [{:name "user_id" :base_type :type/Integer}]}]}
    :expected [{:name "name" :base_type :type/Text}
               {:name "order_count" :base_type :type/IntegerLike}]
    :note "Scalar subqueries are recursively analyzed"}

   {:name "correlated-subquery"
    :sql "SELECT u.name, u.email
          FROM users u
          WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)"
    :metadata {:tables [{:name "users"
                         :columns [{:name "name" :base_type :type/Text}
                                   {:name "email" :base_type :type/Text}
                                   {:name "id" :base_type :type/Integer}]}
                        {:name "orders"
                         :columns [{:name "user_id" :base_type :type/Integer}]}]}
    :expected [{:name "u.name" :base_type :type/Text}
               {:name "u.email" :base_type :type/Text}]}

   {:name "join-with-subquery"
    :sql "SELECT u.name, sub.total
          FROM users u
          JOIN (SELECT user_id, SUM(amount) AS total
                FROM orders
                GROUP BY user_id) sub
          ON u.id = sub.user_id"
    :metadata {:tables [{:name "users"
                         :columns [{:name "id" :base_type :type/Integer}
                                   {:name "name" :base_type :type/Text}]}
                        {:name "orders"
                         :columns [{:name "user_id" :base_type :type/Integer}
                                   {:name "amount" :base_type :type/Decimal}]}]}
    :expected [{:name "u.name" :base_type :type/Text}
               {:name "sub.total" :base_type :type/NumericLike}]
    :note "JOIN with subquery creates virtual table"}])

(deftest subquery-queries-result-metadata-test
  (testing "Subquery result metadata extraction"
    (doseq [{:keys [name sql metadata expected note]} subquery-queries]
      (testing (str "Test: " name (when note (str " - " note)))
        (let [result (extract-result-metadata sql metadata)]
          (is (= expected result)))))))

(def cte-queries
  "Queries with Common Table Expressions (WITH clauses)"
  [{:name "simple-cte"
    :sql "WITH active_users AS (SELECT id, name FROM users WHERE active = true)
          SELECT * FROM active_users"
    :expected [{:name "id"} {:name "name"}]}

   {:name "multiple-ctes"
    :sql "WITH
            recent_orders AS (SELECT * FROM orders WHERE created_at > '2024-01-01'),
            user_totals AS (SELECT user_id, SUM(amount) AS total FROM recent_orders GROUP BY user_id)
          SELECT u.name, ut.total
          FROM users u
          JOIN user_totals ut ON u.id = ut.user_id"
    :expected [{:name "name"} {:name "total"}]}

   {:name "recursive-cte"
    :sql "WITH RECURSIVE emp_hierarchy AS (
            SELECT id, name, manager_id, 0 AS level
            FROM employees
            WHERE manager_id IS NULL
            UNION ALL
            SELECT e.id, e.name, e.manager_id, h.level + 1
            FROM employees e
            JOIN emp_hierarchy h ON e.manager_id = h.id
          )
          SELECT name, level FROM emp_hierarchy"
    :expected [{:name "name"} {:name "level"}]}])

(def union-queries
  "Queries with UNION operations"
  [{:name "simple-union"
    :sql "SELECT id, name FROM users
          UNION
          SELECT id, name FROM archived_users"
    :expected [{:name "id"} {:name "name"}]}

   {:name "union-all"
    :sql "SELECT 'active' AS status, id, name FROM users
          UNION ALL
          SELECT 'archived' AS status, id, name FROM archived_users"
    :expected [{:name "status"} {:name "id"} {:name "name"}]}

   {:name "union-with-different-aliases"
    :sql "SELECT id AS user_id, name AS username FROM users
          UNION
          SELECT customer_id AS user_id, customer_name AS username FROM customers"
    :expected [{:name "user_id"} {:name "username"}]
    :note "Column names from first SELECT"}])

(def window-function-queries
  "Queries with window functions"
  [{:name "simple-row-number"
    :sql "SELECT name, salary, ROW_NUMBER() OVER (ORDER BY salary DESC) AS rank
          FROM employees"
    :expected [{:name "name"} {:name "salary"} {:name "rank"}]}

   {:name "partition-by"
    :sql "SELECT department, name, salary,
                 RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank
          FROM employees"
    :expected [{:name "department"} {:name "name"} {:name "salary"} {:name "dept_rank"}]}

   {:name "multiple-window-functions"
    :sql "SELECT name, salary,
                 ROW_NUMBER() OVER (ORDER BY salary) AS row_num,
                 RANK() OVER (ORDER BY salary) AS rank,
                 DENSE_RANK() OVER (ORDER BY salary) AS dense_rank
          FROM employees"
    :expected [{:name "name"} {:name "salary"} {:name "row_num"} {:name "rank"} {:name "dense_rank"}]}])

(def case-expression-queries
  "Queries with CASE expressions"
  [{:name "simple-case"
    :sql "SELECT name,
                 CASE WHEN age < 18 THEN 'minor'
                      WHEN age >= 65 THEN 'senior'
                      ELSE 'adult'
                 END AS age_group
          FROM users"
    :expected [{:name "name"} {:name "age_group"}]}

   {:name "case-with-column-value"
    :sql "SELECT product_id,
                 CASE status
                      WHEN 'active' THEN 'Available'
                      WHEN 'discontinued' THEN 'No longer available'
                      ELSE 'Check status'
                 END AS availability
          FROM products"
    :expected [{:name "product_id"} {:name "availability"}]}

   {:name "multiple-case-expressions"
    :sql "SELECT name,
                 CASE WHEN score >= 90 THEN 'A'
                      WHEN score >= 80 THEN 'B'
                      ELSE 'C'
                 END AS grade,
                 CASE WHEN attendance > 0.9 THEN 'Good'
                      ELSE 'Needs Improvement' 
                 END AS attendance_status
          FROM students"
    :expected [{:name "name"} {:name "grade"} {:name "attendance_status"}]}])

(def metabase-specific-queries
  "Queries with Metabase-specific features"
  [{:name "card-reference"
    :sql "SELECT * FROM {{#123}}"
    :expected :requires-card-metadata
    :note "Needs card 123's result metadata"}

   {:name "card-with-columns"
    :sql "SELECT id, name FROM {{#456}}"
    :expected [{:name "id"} {:name "name"}]
    :note "Selecting specific columns from card"}

   {:name "snippet-usage"
    :sql "SELECT * FROM users WHERE {{snippet: active-users-filter}}"
    :expected :requires-snippet-expansion
    :note "Snippet doesn't affect SELECT clause"}

   {:name "parameter-in-where"
    :sql "SELECT id, name FROM users WHERE created_at > {{start_date}}"
    :expected [{:name "id"} {:name "name"}]
    :note "Parameters in WHERE don't affect columns"}

   {:name "optional-column-parameter"
    :sql "SELECT id, name [[, {{extra_column}}]] FROM users"
    :expected :depends-on-parameters
    :note "Optional clause can add columns"}

   {:name "complex-metabase-query"
    :sql "WITH base AS (SELECT * FROM {{#789}})
          SELECT b.id, b.name, u.email
          FROM base b
          JOIN users u ON b.user_id = u.id
          WHERE {{snippet: date-filter}}"
    :expected :complex-resolution-needed
    :note "Combines cards, snippets, and joins"}])
