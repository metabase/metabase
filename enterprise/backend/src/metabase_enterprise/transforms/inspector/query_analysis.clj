(ns metabase-enterprise.transforms.inspector.query-analysis
  "Query analysis for Transform Inspector.

   Extracts structural information from MBQL and native SQL queries:
   - Join structure (strategy, alias, source table, conditions)
   - Visited fields (fields used in WHERE, JOIN, GROUP BY, ORDER BY)

   For native queries, SQL strings are pre-built during analysis to keep
   macaw AST details isolated to this namespace."
  (:require
   [clojure.string :as str]
   [macaw.ast :as macaw.ast]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- MBQL Analysis --------------------------------------------------

(defn- extract-mbql-join-structure
  "Extract join structure from preprocessed MBQL query."
  [preprocessed-query]
  (when-let [joins (get-in preprocessed-query [:stages 0 :joins])]
    (mapv (fn [join]
            {:strategy     (or (:strategy join) :left-join)
             :alias        (:alias join)
             :source-table (get-in join [:stages 0 :source-table])
             :conditions   (:conditions join)})
          joins)))

(defn- extract-mbql-visited-fields
  "Extract field IDs from semantically important MBQL clauses."
  [query]
  (let [stage (get-in query [:stages 0])
        filter-fields (when-let [filters (:filters stage)]
                        (into #{} (mapcat lib.walk.util/all-field-ids) filters))
        group-by-fields (when-let [breakout (:breakout stage)]
                          (into #{} (mapcat lib.walk.util/all-field-ids) breakout))
        order-by-fields (when-let [order-by (:order-by stage)]
                          (into #{} (mapcat lib.walk.util/all-field-ids) order-by))
        join-fields (when-let [joins (:joins stage)]
                      (into #{}
                            (mapcat (fn [join]
                                      (mapcat lib.walk.util/all-field-ids (:conditions join))))
                            joins))]
    {:join-fields      (or join-fields #{})
     :filter-fields    (or filter-fields #{})
     :group-by-fields  (or group-by-fields #{})
     :order-by-fields  (or order-by-fields #{})
     :all              (into #{} cat [join-fields filter-fields group-by-fields order-by-fields])}))

(defn analyze-mbql-query
  "Analyze an MBQL query for join structure and visited fields.
   Returns {:join-structure [...] :visited-fields {...}} or nil on failure."
  [transform]
  (try
    (let [preprocessed (-> transform :source :query
                           transforms.util/massage-sql-query
                           qp.preprocess/preprocess)]
      {:preprocessed-query preprocessed
       :join-structure     (extract-mbql-join-structure preprocessed)
       :visited-fields     (extract-mbql-visited-fields preprocessed)})
    (catch Exception e
      (log/warn e "Failed to analyze MBQL query")
      nil)))

;;; -------------------------------------------------- Native SQL Generation --------------------------------------------------
;;; These functions convert macaw AST to SQL strings, isolating macaw details to this namespace.

(defn- sql-quote
  "Quote an identifier for the given driver."
  [driver-kw s]
  (let [style (sql.qp/quote-style driver-kw)
        s (sql.normalize/normalize-name driver-kw (str s))]
    (case style
      :mysql (str "`" (str/replace s "`" "``") "`")
      :sqlserver (str "[" (str/replace s "]" "]]") "]")
      (str "\"" (str/replace s "\"" "\"\"") "\""))))

(defn- sql-table-ref
  "Build a SQL table reference with optional alias."
  [driver-kw {:keys [schema table table-alias]}]
  (str (when schema (str (sql-quote driver-kw schema) "."))
       (sql-quote driver-kw table)
       (when table-alias (str " " (sql-quote driver-kw table-alias)))))

(defn- sql-column-ref
  "Build a SQL column reference."
  [driver-kw {:keys [schema table column]}]
  (str/join "." (map (partial sql-quote driver-kw) (remove nil? [schema table column]))))

(defn- sql-literal
  "Convert a macaw literal to SQL."
  [{:keys [value]}]
  (cond
    (string? value) (str "'" (str/replace value "'" "''") "'")
    (nil? value) "NULL"
    :else (str value)))

(defn- sql-expr
  "Convert a macaw AST expression to SQL."
  [driver-kw node]
  (case (:type node)
    :macaw.ast/column (sql-column-ref driver-kw node)
    :macaw.ast/literal (sql-literal node)
    nil))

(defn- sql-condition
  "Convert a macaw AST condition to SQL. Handles AND/OR compound conditions recursively."
  [driver-kw condition]
  (when (= (:type condition) :macaw.ast/binary-expression)
    (let [{:keys [operator left right]} condition
          op-upper (str/upper-case (str operator))]
      (cond
        ;; Compound condition (AND/OR) - recurse into both sides
        (contains? #{"AND" "OR"} op-upper)
        (let [left-sql (sql-condition driver-kw left)
              right-sql (sql-condition driver-kw right)]
          (when (and left-sql right-sql)
            (str "(" left-sql " " op-upper " " right-sql ")")))

        ;; Binary comparison - handle columns, literals, etc.
        :else
        (let [left-sql (sql-expr driver-kw left)
              right-sql (sql-expr driver-kw right)]
          (when (and left-sql right-sql)
            (str left-sql " " operator " " right-sql)))))))

(def ^:private strategy->sql
  {:left-join  "LEFT JOIN"
   :right-join "RIGHT JOIN"
   :full-join  "FULL JOIN"
   :cross-join "CROSS JOIN"
   :inner-join "JOIN"})

(defn- rhs-column-from-ast
  "Extract the first RHS column from join conditions (for COUNT(rhs_field) in outer joins).
   Handles compound AND conditions by recursively searching."
  [conditions]
  (let [conditions-list (if (sequential? conditions) conditions [conditions])]
    (some (fn find-rhs [cond]
            (when (= (:type cond) :macaw.ast/binary-expression)
              (let [{:keys [operator left right]} cond
                    op-upper (str/upper-case (str operator))]
                (if (contains? #{"AND" "OR"} op-upper)
                  ;; Compound - recurse into left side first
                  (or (find-rhs left) (find-rhs right))
                  ;; Simple comparison - check if right is a column
                  (when (= (:type right) :macaw.ast/column)
                    right)))))
          conditions-list)))

(defn- build-join-clause-sql
  "Build a complete JOIN clause SQL string from a macaw join node."
  [driver-kw strategy ast-node]
  (let [table (sql-table-ref driver-kw (:source ast-node))
        ;; :condition may be a single node or a list - normalize to list
        conditions-raw (:condition ast-node)
        conditions-list (if (sequential? conditions-raw) conditions-raw [conditions-raw])
        ;; Each condition may be compound (with AND) - sql-condition handles that
        on-parts (keep (partial sql-condition driver-kw) conditions-list)
        on-clause (when (seq on-parts) (str/join " AND " on-parts))]
    (if on-clause
      (str (strategy->sql strategy) " " table " ON " on-clause)
      (str (strategy->sql strategy) " " table))))

;;; -------------------------------------------------- Native SQL Analysis --------------------------------------------------

(defn- ast-join-type->strategy
  "Map macaw AST join-type to metabase join strategy keyword."
  [join-type]
  (case join-type
    :left    :left-join
    :right   :right-join
    :full    :full-join
    :cross   :cross-join
    :natural :inner-join
    :inner   :inner-join
    :inner-join))

(defn- extract-native-join-structure
  "Extract join structure from macaw AST, prebuilding SQL strings.
   Returns join info with :join-clause-sql and :rhs-column-sql instead of raw AST."
  [ast sources driver-kw]
  (when-let [join-nodes (:join ast)]
    (let [table->id (into {} (map (fn [{:keys [table-name table-id]}]
                                    [(sql.normalize/normalize-name driver-kw table-name) table-id]))
                          sources)]
      (mapv (fn [join-node]
              (let [strategy (ast-join-type->strategy (:join-type join-node))
                    is-outer? (contains? #{:left-join :right-join :full-join} strategy)
                    rhs-col (when is-outer? (rhs-column-from-ast (:condition join-node)))]
                {:strategy        strategy
                 :alias           (sql.normalize/normalize-name
                                   driver-kw
                                   (or (get-in join-node [:source :table-alias])
                                       (get-in join-node [:source :table])))
                 :source-table    (table->id (sql.normalize/normalize-name
                                              driver-kw
                                              (get-in join-node [:source :table])))
                 :join-clause-sql (build-join-clause-sql driver-kw strategy join-node)
                 :rhs-column-sql  (when rhs-col (sql-column-ref driver-kw rhs-col))}))
            join-nodes))))

(defn- extract-columns-from-ast-node
  "Recursively extract column nodes from a Macaw AST expression."
  [node]
  (when node
    (case (:type node)
      :macaw.ast/column
      [{:column (:column node) :table (:table node)}]

      :macaw.ast/binary-expression
      (concat (extract-columns-from-ast-node (:left node))
              (extract-columns-from-ast-node (:right node)))

      :macaw.ast/unary-expression
      (extract-columns-from-ast-node (:expression node))

      :macaw.ast/function
      (mapcat extract-columns-from-ast-node (:args node))

      nil)))

(defn- extract-native-visited-columns
  "Extract columns from native SQL WHERE, GROUP BY, and JOIN clauses."
  [ast]
  (when (= (:type ast) :macaw.ast/select)
    {:where-columns    (extract-columns-from-ast-node (:where ast))
     :group-by-columns (mapcat extract-columns-from-ast-node (:group-by ast))
     :order-by-columns (mapcat extract-columns-from-ast-node (:order-by ast))
     :join-columns     (mapcat (fn [join]
                                 ;; :condition may be single node or list
                                 (let [conds (:condition join)
                                       cond-list (if (sequential? conds) conds [conds])]
                                   (mapcat extract-columns-from-ast-node cond-list)))
                               (:join ast))}))

(defn- resolve-column-to-field-id
  "Map a column name to a Metabase field ID using sources info."
  [driver-kw sources {:keys [column table]}]
  (let [norm-col (sql.normalize/normalize-name driver-kw column)
        norm-tbl (when table (sql.normalize/normalize-name driver-kw table))]
    (some (fn [{:keys [table-name fields]}]
            (when (or (nil? norm-tbl)
                      (= norm-tbl (sql.normalize/normalize-name driver-kw table-name)))
              (some (fn [field]
                      (when (= norm-col (sql.normalize/normalize-name driver-kw (:name field)))
                        (:id field)))
                    fields)))
          sources)))

(defn- resolve-native-visited-fields
  "Resolve native SQL column references to Metabase field IDs."
  [driver-kw sources {:keys [where-columns group-by-columns order-by-columns join-columns]}]
  (let [resolve-cols (fn [cols]
                       (into #{}
                             (keep (partial resolve-column-to-field-id driver-kw sources))
                             cols))
        filter-fields (resolve-cols where-columns)
        group-by-fields (resolve-cols group-by-columns)
        order-by-fields (resolve-cols order-by-columns)
        join-fields (resolve-cols join-columns)]
    {:join-fields     join-fields
     :filter-fields   filter-fields
     :group-by-fields group-by-fields
     :order-by-fields order-by-fields
     :all             (into #{} cat [join-fields filter-fields group-by-fields order-by-fields])}))

(defn analyze-native-query
  "Analyze a native SQL query for join structure and visited fields.
   Requires sources (with field info) for column resolution.
   Returns {:from-clause-sql :join-structure :visited-fields} or nil on failure.
   SQL strings are prebuilt to keep macaw AST details isolated to this namespace."
  [transform sources]
  (try
    (let [sql (get-in transform [:source :query :stages 0 :native])
          db-id (transforms.util/transform-source-database transform)
          database (t2/select-one :model/Database :id db-id)
          driver-kw (keyword (:engine database))
          parsed (driver.u/parsed-query sql driver-kw)
          ast (macaw.ast/->ast parsed {:with-instance? false})]
      (when (and ast (= (:type ast) :macaw.ast/select))
        (let [cols (extract-native-visited-columns ast)]
          {:from-clause-sql (sql-table-ref driver-kw (:from ast))
           :join-structure  (extract-native-join-structure ast sources driver-kw)
           :visited-fields  (resolve-native-visited-fields driver-kw sources cols)})))
    (catch Exception e
      (log/warn e "Failed to analyze native SQL query")
      nil)))

;;; -------------------------------------------------- Unified Analysis --------------------------------------------------

(defn analyze-query
  "Analyze a transform's query for join structure and visited fields.
   Dispatches to MBQL or native analysis based on source type.

   Arguments:
   - transform: the transform map
   - source-type: :mbql, :native, or :python
   - sources: source table info (with fields) for native column resolution

   Returns:
   {:preprocessed-query <pMBQL> (MBQL only)
    :from-clause-sql <string> (native only)
    :join-structure [{:strategy :alias :source-table
                      :conditions (MBQL) or :join-clause-sql/:rhs-column-sql (native)} ...]
    :visited-fields {:join-fields :filter-fields :group-by-fields :order-by-fields :all}}"
  [transform source-type sources]
  (case source-type
    :mbql   (analyze-mbql-query transform)
    :native (analyze-native-query transform sources)
    nil))
