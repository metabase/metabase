(ns metabase.transforms-inspector.query-analysis
  "Query analysis for Transform Inspector.

   Extracts structural information from MBQL and native SQL queries:
   - Join structure (strategy, alias, source table, conditions)
   - Visited fields (fields used in WHERE, JOIN, GROUP BY, ORDER BY)

   For native queries, SQL strings are pre-built during analysis to keep
   macaw AST details isolated to this namespace."
  ;; TODO: we need to port this to sql-tools
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [clojure.string :as str]
   [macaw.ast :as macaw.ast]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.macaw.core :as macaw]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- MBQL Analysis --------------------------------------------------

(defn- extract-mbql-join-structure
  "Extract join structure from preprocessed MBQL query."
  [preprocessed-query]
  (when-let [joins (lib/joins preprocessed-query 0)]
    (mapv (fn [join]
            {:strategy     (or (:strategy join) :left-join)
             :alias        (:alias join)
             :source-table (lib/source-table-id join)
             :conditions   (:conditions join)})
          joins)))

(defn- extract-mbql-visited-fields
  "Extract field IDs from semantically important MBQL clauses."
  [query]
  (let [extract-ids (fn [clauses] (into #{} (mapcat lib/all-field-ids) clauses))
        filter-fields   (some-> (lib/filters query 0) extract-ids)
        group-by-fields (some-> (lib/breakouts query 0) extract-ids)
        order-by-fields (some-> (lib/order-bys query 0) extract-ids)
        join-fields     (some->> (lib/joins query 0)
                                 (into #{} (mapcat #(mapcat lib/all-field-ids (:conditions %)))))]
    {:all (into #{} cat [join-fields filter-fields group-by-fields order-by-fields])}))

(defn analyze-mbql-query
  "Analyze an MBQL query for join structure and visited fields.
   Returns {:join-structure [...] :visited-fields {...}} or nil on failure."
  [transform]
  (try
    (let [preprocessed (-> transform :source :query
                           transforms.util/massage-sql-query
                           qp.preprocess/preprocess)]
      (when (<= (count (:stages preprocessed)) 1)
        {:preprocessed-query preprocessed
         :join-structure     (extract-mbql-join-structure preprocessed)
         :visited-fields     (extract-mbql-visited-fields preprocessed)}))
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
          op-upper (u/upper-case-en (str operator))]
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
                    op-upper (u/upper-case-en (str operator))]
                (if (contains? #{"AND" "OR"} op-upper)
                  ;; Compound - recurse into left side first
                  (or (find-rhs left) (find-rhs right))
                  ;; Simple comparison - check if right is a column
                  (when (= (:type right) :macaw.ast/column)
                    right)))))
          conditions-list)))

(defn- lhs-column-from-ast
  "Extract the first LHS column from join conditions (for WHERE lhs IS NOT NULL filter).
   Handles compound AND conditions by recursively searching."
  [conditions]
  (let [conditions-list (if (sequential? conditions) conditions [conditions])]
    (some (fn find-lhs [cond]
            (when (= (:type cond) :macaw.ast/binary-expression)
              (let [{:keys [operator left right]} cond
                    op-upper (u/upper-case-en (str operator))]
                (if (contains? #{"AND" "OR"} op-upper)
                  ;; Compound - recurse into left side first
                  (or (find-lhs left) (find-lhs right))
                  ;; Simple comparison - check if left is a column
                  (when (= (:type left) :macaw.ast/column)
                    left)))))
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
   Returns join info with :join-clause-sql, :lhs-column-sql, and :rhs-column-sql instead of raw AST."
  [ast sources driver-kw]
  (when-let [join-nodes (:join ast)]
    (let [table->id (into {} (map (fn [{:keys [table_name table_id]}]
                                    [(sql.normalize/normalize-name driver-kw table_name) table_id]))
                          sources)]
      (mapv (fn [join-node]
              (let [strategy (ast-join-type->strategy (:join-type join-node))
                    is-outer? (contains? #{:left-join :right-join :full-join} strategy)
                    lhs-col (when is-outer? (lhs-column-from-ast (:condition join-node)))
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
                 :lhs-column-sql  (when lhs-col (sql-column-ref driver-kw lhs-col))
                 :rhs-column-sql  (when rhs-col (sql-column-ref driver-kw rhs-col))}))
            join-nodes))))

(defn- resolve-native-visited-fields
  "Resolve native SQL column references to Metabase field IDs using sql-tools.
   Returns a visited-fields map with all referenced field IDs in :all.
   Per-clause breakdown (filter/group-by/order-by/join) is not available through
   sql-tools, but is currently unused by consumers."
  [driver-kw native-query]
  (let [referenced (sql-tools/referenced-fields driver-kw native-query)
        all-ids (into #{} (keep :id) referenced)]
    {:all all-ids}))

(defn analyze-native-query
  "Analyze a native SQL query for join structure and visited fields.
   Requires sources (with field info) for column resolution.
   Returns {:from-clause-sql :join-structure :visited-fields} or nil on failure.
   SQL strings are prebuilt to keep macaw AST details isolated to this namespace.
   Uses sql-tools for visited field resolution, macaw directly for join structure."
  [transform sources]
  (try
    (let [native-query (get-in transform [:source :query])
          sql (lib/raw-native-query native-query)
          db-id (transforms.util/transform-source-database transform)
          database (t2/select-one :model/Database :id db-id)
          driver-kw (keyword (:engine database))
          ;; Join structure still requires direct macaw AST access
          parsed (#'macaw/parsed-query sql driver-kw)
          ast (macaw.ast/->ast parsed {:with-instance? false})]
      (when (and ast (= (:type ast) :macaw.ast/select))
        {:from-clause-sql (sql-table-ref driver-kw (:from ast))
         :join-structure  (extract-native-join-structure ast sources driver-kw)
         :visited-fields  (resolve-native-visited-fields driver-kw native-query)}))
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
                      :conditions (MBQL) or :join-clause-sql/:rhs-column-sql/:lhs-column-sql (native)} ...]
    :visited-fields {:all <set of field IDs>}}"
  [transform source-type sources]
  (case source-type
    :mbql   (analyze-mbql-query transform)
    :native (analyze-native-query transform sources)
    nil))
