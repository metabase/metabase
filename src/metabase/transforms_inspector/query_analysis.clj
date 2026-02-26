(ns metabase.transforms-inspector.query-analysis
  "Query analysis for Transform Inspector.

   Extracts structural information from MBQL and native SQL queries:
   - Join structure (strategy, alias, source table, conditions)
   - Visited fields (fields used in WHERE, JOIN, GROUP BY, ORDER BY)

   For native queries, HoneySQL data structures are produced during analysis
   to keep macaw AST details isolated to this namespace. Consumers format
   these with [[metabase.driver.sql.query-processor/format-honeysql]]."
  (:require
   ;; TODO (Bronsa 16/02/26): get rid of macaw
   [macaw.ast :as macaw.ast]
   [macaw.core :as macaw]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.lib.core :as lib]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; TODO (Bronsa 16/02/26): copied from metabase.sql-tools.macaw.core, until we can port everything to sql-tools

(def ^:private considered-drivers
  "The set of drivers for which we configure non-trivial macaw options."
  #{:h2 :mysql :postgres :redshift :sqlite :sqlserver})

(defn- macaw-options
  "Generate the options expected by Macaw based on the nature of the given driver."
  [driver]
  (merge
   (when (contains? considered-drivers driver)
     {:case-insensitive      :agnostic
      :quotes-preserve-case? (not (contains? #{:mysql :sqlserver} driver))
      :features              {:postgres-syntax        (isa? driver/hierarchy driver :postgres)
                              :square-bracket-quotes  (= :sqlserver driver)
                              :unsupported-statements false
                              :backslash-escape-char  true
                              :complex-parsing        true}
      :timeout               10000})
   {:non-reserved-words    (vec (remove nil? [(when-not (contains? #{:clickhouse} driver)
                                                :final)]))}))

(defn- macaw-parsed-query
  "Parse SQL using Macaw with driver-specific options."
  [sql driver & {:as opts}]
  (macaw/parsed-query sql (merge (macaw-options driver) opts)))

;;; -------------------------------------------------- MBQL Analysis --------------------------------------------------

(defn- extract-mbql-join-structure
  "Extract join structure from preprocessed MBQL query."
  [preprocessed-query]
  (when-let [joins (lib/joins preprocessed-query 0)]
    (mapv (fn [join]
            {:strategy     (or (:strategy join) :left-join)
             :alias        (:alias join)
             :source-table (-> join :stages first :source-table)
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
  (let [preprocessed (-> transform :source :query
                         transforms.util/massage-sql-query
                         qp.preprocess/preprocess)]
    (when (<= (count (:stages preprocessed)) 1)
      {:preprocessed-query preprocessed
       :from-table-id      (lib/primary-source-table-id preprocessed)
       :join-structure     (extract-mbql-join-structure preprocessed)
       :visited-fields     (extract-mbql-visited-fields preprocessed)})))

;;; -------------------------------------------------- Macaw AST → HoneySQL --------------------------------------------------
;;; These functions convert macaw AST nodes to HoneySQL data structures,
;;; isolating macaw details to this namespace.

(defn- macaw-table->hsql
  "Convert a macaw table node to a HoneySQL table reference.
   Returns `[table-identifier :alias]` when aliased, or `table-identifier` when not.
   The alias is a plain keyword since HoneySQL expects that in FROM/JOIN position."
  [driver {:keys [schema table table-alias]}]
  (let [table-id (apply h2x/identifier :table
                        (remove nil? [(some->> schema (sql.normalize/normalize-name driver))
                                      (sql.normalize/normalize-name driver table)]))]
    (if table-alias
      [table-id (keyword (sql.normalize/normalize-name driver table-alias))]
      table-id)))

(defn- macaw-column->hsql
  "Convert a macaw column node to a HoneySQL column identifier."
  [driver {:keys [schema table column]}]
  (apply h2x/identifier :field
         (remove nil? [(some->> schema (sql.normalize/normalize-name driver))
                       (some->> table (sql.normalize/normalize-name driver))
                       (sql.normalize/normalize-name driver column)])))

(defn- macaw-expr->hsql
  "Convert a macaw AST expression node to a HoneySQL form."
  [driver node]
  (case (:type node)
    :macaw.ast/column  (macaw-column->hsql driver node)
    :macaw.ast/literal (let [{:keys [value]} node]
                         (cond
                           (nil? value) nil
                           :else        [:inline value]))
    nil))

(defn- macaw-condition->hsql
  "Convert a macaw AST condition to a HoneySQL condition form.
   Handles AND/OR compound conditions recursively."
  [driver condition]
  (when (= (:type condition) :macaw.ast/binary-expression)
    (let [{:keys [operator left right]} condition
          op-upper (u/upper-case-en (str operator))]
      (cond
        (contains? #{"AND" "OR"} op-upper)
        (let [left-hsql  (macaw-condition->hsql driver left)
              right-hsql (macaw-condition->hsql driver right)]
          (when (and left-hsql right-hsql)
            [(keyword op-upper) left-hsql right-hsql]))

        :else
        (let [left-hsql  (macaw-expr->hsql driver left)
              right-hsql (macaw-expr->hsql driver right)]
          (when (and left-hsql right-hsql)
            [(keyword operator) left-hsql right-hsql]))))))

(defn- column-from-ast
  "Extract the column on `side` (:left or :right) from a single equality join condition.
   Returns nil for compound (AND/OR) or multi-condition joins — we only analyze
   simple single-condition joins."
  [side conditions]
  (let [conditions-list (if (sequential? conditions) conditions [conditions])
        condition       (when (= 1 (count conditions-list)) (first conditions-list))]
    (when (and condition
               (= (:type condition) :macaw.ast/binary-expression)
               (not (contains? #{"AND" "OR"} (u/upper-case-en (str (:operator condition))))))
      (let [node (case side :left (:left condition) :right (:right condition))]
        (when (= (:type node) :macaw.ast/column)
          node)))))

(defn- build-join-condition-hsql
  "Build a HoneySQL condition form from a macaw join node's conditions."
  [driver ast-node]
  (let [conditions-raw (:condition ast-node)
        conditions-list (if (sequential? conditions-raw) conditions-raw [conditions-raw])
        parts (keep (partial macaw-condition->hsql driver) conditions-list)]
    (case (count parts)
      0 nil
      1 (first parts)
      (into [:and] parts))))

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

(defn- sources->table-id-lookup
  "Build a normalized table name → table_id lookup map from sources."
  [driver sources]
  (into {} (map (fn [{:keys [table_name table_id]}]
                  [(sql.normalize/normalize-name driver table_name) table_id]))
        sources))

(defn- extract-native-join-structure
  "Extract join structure from macaw AST as HoneySQL data.
   Returns join info with :join-table, :join-condition, :lhs-column, :rhs-column as HoneySQL forms."
  [ast table->id driver]
  (when-let [join-nodes (:join ast)]
    (mapv (fn [join-node]
            (let [strategy (ast-join-type->strategy (:join-type join-node))
                  is-outer? (contains? #{:left-join :right-join :full-join} strategy)
                  lhs-col (when is-outer? (column-from-ast :left (:condition join-node)))
                  rhs-col (when is-outer? (column-from-ast :right (:condition join-node)))]
              {:strategy       strategy
               :alias          (sql.normalize/normalize-name
                                driver
                                (or (get-in join-node [:source :table-alias])
                                    (get-in join-node [:source :table])))
               :source-table   (table->id (sql.normalize/normalize-name
                                           driver
                                           (get-in join-node [:source :table])))
               :join-table     (macaw-table->hsql driver (:source join-node))
               :join-condition (build-join-condition-hsql driver join-node)
               :lhs-column     (when lhs-col (macaw-column->hsql driver lhs-col))
               :rhs-column     (when rhs-col (macaw-column->hsql driver rhs-col))}))
          join-nodes)))

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
   Returns HoneySQL data structures for table/column/condition references.
   Uses sql-tools for visited field resolution, macaw directly for join structure."
  [transform sources]
  (try
    (let [native-query (-> (get-in transform [:source :query])
                           transforms.util/massage-sql-query
                           qp.preprocess/preprocess)
          sql (lib/raw-native-query native-query)
          db-id (transforms.util/transform-source-database transform)
          driver (t2/select-one-fn (comp keyword :engine) :model/Database :id db-id)
          parsed (macaw-parsed-query sql driver)
          ast (macaw.ast/->ast parsed {:with-instance? false})]
      (when (and ast (= (:type ast) :macaw.ast/select))
        (let [table->id (sources->table-id-lookup driver sources)]
          {:driver         driver
           :from-table-id  (table->id (sql.normalize/normalize-name
                                       driver (:table (:from ast))))
           :from-table     (macaw-table->hsql driver (:from ast))
           :join-structure (extract-native-join-structure ast table->id driver)
           :visited-fields (resolve-native-visited-fields driver native-query)})))
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
    :driver <keyword> (native only)
    :from-table-id <int> (native only)
    :from-table <honeysql> (native only)
    :join-structure [{:strategy :alias :source-table
                      :conditions (MBQL) or :join-table/:join-condition/:lhs-column/:rhs-column (native)} ...]
    :visited-fields {:all <set of field IDs>}}"
  [transform source-type sources]
  (case source-type
    :mbql   (analyze-mbql-query transform)
    :native (analyze-native-query transform sources)
    nil))
