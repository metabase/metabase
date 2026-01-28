(ns metabase-enterprise.transforms.inspector
  "Transform Inspector: Provides visibility into what data transformations are doing
   before and after they run. Generates a dashboard-like structure with visualization
   cards for inspection purposes."
  (:require
   [clojure.string :as str]
   [macaw.ast :as macaw.ast]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.schema :as transforms.schema]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Source Extraction ---------------------------------------------------

;; TODO: this is likely duplicated

(defmulti extract-sources
  "Extract source table information for a transform.
   Returns a seq of maps with :table-id, :table-name, :schema, and :db-id."
  (fn [transform] (transforms.util/transform-source-type (:source transform))))

(defmethod extract-sources :mbql
  [{:keys [source]}]
  (try
    (let [query (-> (:query source)
                    transforms.util/massage-sql-query
                    qp.preprocess/preprocess)
          table-ids (lib/all-source-table-ids query)]
      (when (seq table-ids)
        (let [tables (t2/select :model/Table :id [:in table-ids])]
          (mapv (fn [table]
                  {:table-id   (:id table)
                   :table-name (:name table)
                   :schema     (:schema table)
                   :db-id      (:db_id table)})
                tables))))
    (catch Exception e
      (log/warn e "Failed to extract sources from MBQL transform")
      nil)))

(defmethod extract-sources :native
  [{:keys [source] :as transform}]
  (try
    (let [query (:query source)
          db-id (transforms.util/transform-source-database transform)
          database (t2/select-one :model/Database :id db-id)
          driver-kw (keyword (:engine database))
          deps (driver/native-query-deps driver-kw query)]
      (when (seq deps)
        (let [table-ids (keep :table deps)
              tables (when (seq table-ids)
                       (t2/select :model/Table :id [:in table-ids]))]
          (mapv (fn [table]
                  {:table-id   (:id table)
                   :table-name (:name table)
                   :schema     (:schema table)
                   :db-id      (:db_id table)})
                tables))))
    (catch Exception e
      (log/warn e "Failed to extract sources from native transform")
      nil)))

(defmethod extract-sources :python
  [transform]
  (try
    (let [source-tables (get-in transform [:source :source-tables])
          normalized (transforms.util/normalize-source-tables source-tables)]
      (for [[_alias {:keys [table_id database_id schema table]}] normalized
            :when table_id]
        {:table-id   table_id
         :table-name table
         :schema     schema
         :db-id      database_id}))
    (catch Exception e
      (log/warn e "Failed to extract sources from Python transform")
      nil)))

;;; -------------------------------------------------- Join Extraction & Statistics ---------------------------------------------------

(defn- get-rhs-field-from-condition
  "Extract the RHS field reference from a join condition.
   The RHS field is the one with :join-alias, representing the joined table's field."
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts _lhs rhs] condition]
        (when (and (vector? rhs)
                   (= :field (first rhs))
                   (:join-alias (second rhs)))
          rhs)))))

(defn- get-join-key-field-ids
  "Extract both LHS and RHS field IDs from join conditions.
   Returns {:lhs-field-id <id> :rhs-field-id <id>} or nil."
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts lhs rhs] condition
            lhs-id (when (and (vector? lhs) (= :field (first lhs)) (>= (count lhs) 3))
                     (nth lhs 2))
            rhs-id (when (and (vector? rhs) (= :field (first rhs)) (>= (count rhs) 3))
                     (nth rhs 2))]
        (when (and (int? lhs-id) (int? rhs-id))
          {:lhs-field-id lhs-id
           :rhs-field-id rhs-id})))))

(defn- run-pmbql-query
  "Execute a pMBQL query and return the first value from the first row."
  [query]
  (-> query qp/process-query :data :rows first first))

(defn- count-null-in-field
  "Count NULL values in a specific field of a table.
   Returns {:null-count <n> :total-count <n> :null-percent <0.0-1.0>}."
  [mp table-id field-id]
  (try
    (let [table-metadata (lib.metadata/table mp table-id)
          field-metadata (lib.metadata/field mp field-id)

          ;; Total count
          total-query (-> (lib/query mp table-metadata)
                          (lib/aggregate (lib/count)))
          total-count (run-pmbql-query total-query)

          ;; Non-null count (COUNT(field) excludes NULLs)
          non-null-query (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count (lib/ref field-metadata))))
          non-null-count (run-pmbql-query non-null-query)

          null-count (- total-count non-null-count)
          null-percent (if (pos? total-count)
                         (double (/ null-count total-count))
                         0.0)]
      {:null-count null-count
       :total-count total-count
       :null-percent null-percent})
    (catch Exception e
      (log/warnf e "Failed to count nulls for field %d in table %d" field-id table-id)
      nil)))

(defn- query-with-n-joins
  "Return a copy of query with only the first n joins from the first stage.
   When n=0, removes all joins."
  [query n]
  (if (zero? n)
    (update-in query [:stages 0] dissoc :joins)
    (update-in query [:stages 0 :joins] #(vec (take n %)))))

(defn- strip-join-to-essentials
  "Strip a join clause down to just the essential parts for counting."
  [join]
  (-> join
      (select-keys [:lib/type :strategy :alias :conditions :stages])
      ;; Also strip down the join's inner stages
      (update :stages (fn [stages]
                        (mapv #(select-keys % [:lib/type :source-table]) stages)))))

(defn- strip-stage-to-joins
  "Strip a stage down to just source-table and joins, removing all other clauses."
  [stage]
  (let [base (-> stage
                 (select-keys [:lib/type :source-table])
                 (assoc :aggregation [[:count {:lib/uuid (str (random-uuid))}]]))]
    (if-let [joins (seq (:joins stage))]
      (assoc base :joins (mapv strip-join-to-essentials joins))
      base)))

(defn- make-count-query
  "Transform a pMBQL query into a COUNT(*) query with only FROM and JOINs.
   Removes filters, group-by, order-by, fields, etc."
  [query]
  (-> query
      (update-in [:stages 0] strip-stage-to-joins)))

(defn- fresh-uuid-field-ref
  "Copy a field reference with a fresh :lib/uuid to avoid duplicate UUID errors."
  [field-ref]
  (when field-ref
    (if (and (vector? field-ref) (= :field (first field-ref)) (map? (second field-ref)))
      (assoc-in field-ref [1 :lib/uuid] (str (random-uuid)))
      field-ref)))

(defn- make-count-field-query
  "Transform a pMBQL query into a COUNT(field) query with only FROM and JOINs.
   Removes filters, group-by, order-by, fields, etc."
  [query field-ref]
  (-> query
      (update-in [:stages 0]
                 (fn [stage]
                   (let [base (-> stage
                                  (select-keys [:lib/type :source-table])
                                  (assoc :aggregation [[:count {:lib/uuid (str (random-uuid))}
                                                        (fresh-uuid-field-ref field-ref)]]))]
                     (if-let [joins (seq (:joins stage))]
                       (assoc base :joins (mapv strip-join-to-essentials joins))
                       base))))))

(defn- compute-derived-join-stats
  "Compute derived statistics for a single join step from raw counts.
   Maps to existing field names for FE compatibility:
   - left-row-count = count before this join
   - right-row-count = count of the joined table
   - output-row-count = count after this join"
  [strategy prev-count row-count source-count null-stats rhs-null-key-stats]
  (cond-> {:left-row-count prev-count
           :right-row-count source-count
           :output-row-count row-count}
    null-stats
    (merge null-stats)

    rhs-null-key-stats
    (assoc :rhs-null-key-count (:null-count rhs-null-key-stats)
           :rhs-null-key-percent (:null-percent rhs-null-key-stats))

    (#{:inner-join :cross-join} strategy)
    (assoc :expansion-factor
           (when (and prev-count (pos? prev-count))
             (double (/ row-count prev-count))))

    (and (= :left-join strategy) (:matched-count null-stats))
    (assoc :match-rate
           (when (and prev-count (pos? prev-count))
             (double (/ (:matched-count null-stats) prev-count))))

    (and (= :right-join strategy) (:matched-count null-stats))
    (assoc :match-rate
           (when (and source-count (pos? source-count))
             (double (/ (:matched-count null-stats) source-count))))

    (= :full-join strategy)
    (assoc :expansion-factor
           (when (and prev-count (pos? prev-count))
             (double (/ row-count prev-count))))))

(defn- iterative-join-stats
  "Core iterative join statistics computation, shared by MBQL and native paths.

   `source-table-id` - the FROM table's ID
   `count-with-n-joins` - (fn [n]) returns row count with first n joins (n=0 for base)
   `joins` - seq of join descriptor maps, each with:
     :strategy      - join strategy keyword (:left-join, :inner-join, etc.)
     :alias         - join alias string
     :source-table  - table ID of joined table (or nil)
     :source-count  - (fn []) returns count of the joined table, or nil
     :null-count    - (fn [step row-count]) returns {:null-count :matched-count} or nil
     :rhs-null-key-stats - pre-computed {:null-count :null-percent} or nil"
  [source-table-id count-with-n-joins joins]
  (let [base-count (count-with-n-joins 0)]
    (loop [step 1
           prev-count base-count
           results []]
      (if (> step (count joins))
        {:source-table-id source-table-id
         :base-row-count base-count
         :joins results}
        (let [{:keys [strategy alias source-table source-count null-count rhs-null-key-stats]}
              (nth joins (dec step))
              row-count       (count-with-n-joins step)
              source-cnt      (when source-count (source-count))
              null-stats      (when null-count (null-count step row-count))
              stats           (compute-derived-join-stats
                               strategy prev-count row-count source-cnt
                               null-stats rhs-null-key-stats)]
          (recur (inc step) row-count
                 (conj results {:strategy strategy
                                :alias alias
                                :source-table source-table
                                :stats stats})))))))

(defn extract-joins
  "Walk an MBQL query and extract all join information with iterative statistics.

   For a query like: FROM t1 JOIN t2 ON ... JOIN t3 ON ...
   Computes stats by progressively building up the query:
   - Count of t1 alone
   - Count of t1 JOIN t2
   - Count of t1 JOIN t2 JOIN t3
   etc.

   Returns {:base-row-count <count>
            :joins [{:strategy :left-join
                     :alias \"...\"
                     :source-table <id>
                     :stats {...}}]}

   For inner/cross joins: shows row count expansion/contraction
   For left/right/full joins: shows null counts (unmatched rows)"
  [query]
  (let [mp        (lib.metadata/->metadata-provider query)
        source-id (get-in query [:stages 0 :source-table])
        all-joins (get-in query [:stages 0 :joins] [])]
    (when (and source-id (seq all-joins))
      (try
        (iterative-join-stats
         source-id
         ;; count-with-n-joins
         (fn [n]
           (run-pmbql-query (make-count-query (query-with-n-joins query n))))
         ;; join descriptors
         (mapv (fn [join]
                 (let [strategy         (or (:strategy join) :left-join)
                       join-source-table (get-in join [:stages 0 :source-table])]
                   {:strategy  strategy
                    :alias     (:alias join)
                    :source-table join-source-table
                    :source-count (when (int? join-source-table)
                                    (fn []
                                      (let [table-meta (lib.metadata/table mp join-source-table)]
                                        (-> (lib/query mp table-meta)
                                            (lib/aggregate (lib/count))
                                            qp/process-query :data :rows first first))))
                    :null-count (when (#{:left-join :right-join :full-join} strategy)
                                  (when-let [rhs-field (get-rhs-field-from-condition (:conditions join))]
                                    (fn [step row-count]
                                      (let [step-query     (query-with-n-joins query step)
                                            non-null-count (run-pmbql-query (make-count-field-query step-query rhs-field))]
                                        {:null-count    (- row-count non-null-count)
                                         :matched-count non-null-count}))))
                    :rhs-null-key-stats (when-let [field-ids (get-join-key-field-ids (:conditions join))]
                                          (when (int? join-source-table)
                                            (count-null-in-field mp join-source-table (:rhs-field-id field-ids))))}))
               all-joins))
        (catch Exception e
          (log/warn e "Failed to compute iterative join stats")
          nil)))))

(declare run-count-query)

;;; -------------------------------------------------- Native SQL Join Extraction ----------------------------------------

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
    ;; default
    :inner-join))

(defn- resolve-table-name->id
  "Build a map from table-name -> table-id from sources list."
  [sources]
  (into {} (map (juxt :table-name :table-id)) sources))

;;; --- SQL string construction from macaw AST ---
;; We build SQL strings directly rather than using HoneySQL because Metabase's
;; custom h2x/identifier doesn't work in HoneySQL's :from/:join contexts.

(defn- sql-quote-name
  "Quote a SQL identifier using the driver's quoting convention.
   Normalizes the name first to strip any existing quotes and avoid double-quoting."
  [driver-kw s]
  (let [style (sql.qp/quote-style driver-kw)
        s (sql.normalize/normalize-name driver-kw (str s))]
    (case style
      :mysql    (str "`" (str/replace s "`" "``") "`")
      :sqlserver (str "[" (str/replace s "]" "]]") "]")
      ;; :ansi and everything else
      (str "\"" (str/replace s "\"" "\"\"") "\""))))

(defn- sql-table-ref
  "Format a macaw AST table node as a SQL table reference."
  [driver-kw {:keys [schema table table-alias]}]
  (str (when schema (str (sql-quote-name driver-kw schema) "."))
       (sql-quote-name driver-kw table)
       (when table-alias (str " " (sql-quote-name driver-kw table-alias)))))

(defn- sql-column-ref
  "Format a macaw AST column node as a SQL column reference."
  [driver-kw {:keys [schema table column]}]
  (str/join "." (map (partial sql-quote-name driver-kw) (remove nil? [schema table column]))))

(defn- sql-condition
  "Format a macaw AST condition as a SQL string. Returns nil for unsupported expressions."
  [driver-kw condition]
  (when (= (:type condition) :macaw.ast/binary-expression)
    (let [{:keys [operator left right]} condition]
      (when (and (= (:type left) :macaw.ast/column)
                 (= (:type right) :macaw.ast/column))
        (str (sql-column-ref driver-kw left) " " operator " " (sql-column-ref driver-kw right))))))

(defn- sql-conditions
  "Format a seq of macaw AST conditions as a SQL ON clause string."
  [driver-kw conditions]
  (let [parts (keep (partial sql-condition driver-kw) conditions)]
    (when (seq parts)
      (str/join " AND " parts))))

(def ^:private strategy->sql-keyword
  {:left-join  "LEFT JOIN"
   :right-join "RIGHT JOIN"
   :full-join  "FULL JOIN"
   :cross-join "CROSS JOIN"
   :inner-join "JOIN"})

(defn- sql-join-clause
  "Format a macaw AST join node as a SQL JOIN clause."
  [driver-kw join-node]
  (let [strategy (ast-join-type->strategy (:join-type join-node))
        join-kw  (strategy->sql-keyword strategy)
        table    (sql-table-ref driver-kw (:source join-node))
        on-clause (sql-conditions driver-kw (:condition join-node))]
    (if on-clause
      (str join-kw " " table " ON " on-clause)
      (str join-kw " " table))))

(defn- build-count-sql
  "Build a COUNT(*) SQL string from a macaw AST FROM node and first N join nodes."
  [driver-kw from-node joins]
  (str "SELECT COUNT(*) FROM " (sql-table-ref driver-kw from-node)
       (when (seq joins)
         (str " " (str/join " " (map (partial sql-join-clause driver-kw) joins))))))

(defn- build-count-field-sql
  "Build a COUNT(field) SQL string for null detection in outer joins.
   rhs-column is a macaw AST column node with :table and :column keys."
  [driver-kw from-node joins rhs-column]
  (str "SELECT COUNT(" (sql-column-ref driver-kw rhs-column) ") FROM "
       (sql-table-ref driver-kw from-node)
       (when (seq joins)
         (str " " (str/join " " (map (partial sql-join-clause driver-kw) joins))))))

(defn- rhs-column-from-ast-condition
  "Extract the RHS column node from a macaw AST join condition.
   For simple equijoins, returns the full column AST node from the right side."
  [conditions]
  (when-let [condition (first conditions)]
    (when (= (:type condition) :macaw.ast/binary-expression)
      (let [right (:right condition)]
        (when (= (:type right) :macaw.ast/column)
          right)))))

(defn- run-native-sql-query
  "Execute a native SQL query and return the first value from the first row."
  [db-id sql]
  (-> (qp/process-query
       {:database db-id
        :type :native
        :native {:query sql}})
      :data :rows first first))

(defn- extract-native-joins
  "Extract join information from a native SQL transform query.
   Parses the SQL via macaw, extracts join structure from the AST, and computes
   iterative join statistics using directly-constructed COUNT queries.

   Returns {:source-table-id <id> :base-row-count <n> :joins [...]}
   or nil if the SQL can't be parsed or has no joins."
  [transform sources]
  (try
    (let [query       (get-in transform [:source :query])
          sql         (get-in query [:stages 0 :native])
          db-id       (transforms.util/transform-source-database transform)
          database    (t2/select-one :model/Database :id db-id)
          driver-kw   (keyword (:engine database))
          parsed      (driver.u/parsed-query sql driver-kw)
          ast         (macaw.ast/->ast parsed {:with-instance? false})
          from-node   (:from ast)
          join-nodes  (:join ast)
          table->id   (resolve-table-name->id sources)
          ;; Normalize AST table names (strip quotes) when looking up IDs
          lookup-id   (fn [table-name] (table->id (sql.normalize/normalize-name driver-kw table-name)))
          source-id   (lookup-id (:table from-node))]
      (when (and ast (= (:type ast) :macaw.ast/select) (seq join-nodes))
        (iterative-join-stats
         source-id
         ;; count-with-n-joins
         (fn [n]
           (run-native-sql-query db-id (build-count-sql driver-kw from-node (take n join-nodes))))
         ;; join descriptors
         (mapv (fn [join-node]
                 (let [strategy      (ast-join-type->strategy (:join-type join-node))
                       join-table-id (lookup-id (get-in join-node [:source :table]))]
                   {:strategy     strategy
                    :alias        (sql.normalize/normalize-name
                                   driver-kw
                                   (or (get-in join-node [:source :table-alias])
                                       (get-in join-node [:source :table])))
                    :source-table join-table-id
                    :source-count (when join-table-id
                                    (fn [] (run-count-query db-id join-table-id)))
                    :null-count   (when (#{:left-join :right-join :full-join} strategy)
                                    (when-let [rhs-col (rhs-column-from-ast-condition (:condition join-node))]
                                      (fn [step row-count]
                                        (let [count-sql (build-count-field-sql
                                                         driver-kw from-node (take step join-nodes) rhs-col)
                                              non-null-count (run-native-sql-query db-id count-sql)]
                                          {:null-count    (- row-count non-null-count)
                                           :matched-count non-null-count}))))}))
               join-nodes))))
    (catch Exception e
      (log/warn e "Failed to extract joins from native SQL transform")
      nil)))

;;; -------------------------------------------------- Visited Fields Extraction ---------------------------------------------------

(defn- extract-mbql-visited-fields
  "Extract field IDs from semantically important MBQL clauses (filters, breakout, join conditions).
   Returns a map with :join-fields, :filter-fields, :group-by-fields, and :all."
  [query]
  (let [stage (get-in query [:stages 0])

        ;; Extract from :filters (WHERE equivalent) - pass each filter clause directly
        filter-fields (when-let [filters (:filters stage)]
                        (into #{} (mapcat lib.walk.util/all-field-ids) filters))

        ;; Extract from :breakout (GROUP BY equivalent) - pass each breakout clause directly
        group-by-fields (when-let [breakout (:breakout stage)]
                          (into #{} (mapcat lib.walk.util/all-field-ids) breakout))

        ;; Extract from all join :conditions - pass each condition clause directly
        join-fields (when-let [joins (:joins stage)]
                      (into #{}
                            (mapcat (fn [join]
                                      (mapcat lib.walk.util/all-field-ids (:conditions join))))
                            joins))]
    {:join-fields     (or join-fields #{})
     :filter-fields   (or filter-fields #{})
     :group-by-fields (or group-by-fields #{})
     :all             (into #{} cat [join-fields filter-fields group-by-fields])}))

(defn- extract-columns-from-ast-node
  "Recursively extract column nodes from a Macaw AST expression.
   Returns a seq of maps with :column and :table keys."
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

      ;; default - for other types, return empty
      nil)))

(defn- extract-native-visited-columns
  "Extract columns from native SQL WHERE, GROUP BY, and JOIN clauses.
   Returns a map with :where-columns, :group-by-columns, and :join-columns."
  [ast]
  (when (= (:type ast) :macaw.ast/select)
    {:where-columns    (extract-columns-from-ast-node (:where ast))
     :group-by-columns (mapcat extract-columns-from-ast-node (:group-by ast))
     :join-columns     (mapcat (fn [join]
                                 (mapcat extract-columns-from-ast-node
                                         (:condition join)))
                               (:join ast))}))

(defn- resolve-column-to-field-id
  "Map a column name to a Metabase field ID using sources info.
   driver-kw is the database driver keyword for normalization."
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
  "Resolve native SQL column references to Metabase field IDs.
   Returns a map with :join-fields, :filter-fields, :group-by-fields, and :all."
  [driver-kw sources {:keys [where-columns group-by-columns join-columns]}]
  (let [resolve-cols (fn [cols]
                       (into #{}
                             (keep (partial resolve-column-to-field-id driver-kw sources))
                             cols))
        filter-fields (resolve-cols where-columns)
        group-by-fields (resolve-cols group-by-columns)
        join-fields (resolve-cols join-columns)]
    {:join-fields     join-fields
     :filter-fields   filter-fields
     :group-by-fields group-by-fields
     :all             (into #{} cat [join-fields filter-fields group-by-fields])}))

;;; -------------------------------------------------- Table Statistics ---------------------------------------------------

;; TODO: This COUNT(*) query can be slow on large tables. Consider returning a count card
;; in the response that the frontend can execute async, rather than blocking the inspector.
(defn- run-count-query
  "Run a COUNT(*) query against a table and return the count."
  [db-id table-id]
  (try
    (let [mp (lib-be/application-database-metadata-provider db-id)
          table-metadata (lib.metadata/table mp table-id)
          query (-> (lib/query mp table-metadata)
                    (lib/aggregate (lib/count)))
          result (qp/process-query query)]
      (-> result :data :rows first first))
    (catch Exception e
      (log/warnf e "Failed to run COUNT(*) query for table %d" table-id)
      nil)))

(defn- get-table-row-count
  "Get actual row count for a table."
  [table-id]
  (let [table (t2/select-one :model/Table :id table-id)]
    (run-count-query (:db_id table) table-id)))

(defn- get-field-stats
  "Get fingerprint stats for a field if available.
   Extracts global stats (distinct-count, nil%) and type-specific stats:
   - For numbers: min, max, avg, q1, q3
   - For temporal: earliest, latest"
  [field]
  (let [fingerprint (:fingerprint field)
        global-fp (get fingerprint :global)
        type-fp (get fingerprint :type)
        ;; Number stats are under :type/Number
        number-fp (get type-fp :type/Number)
        ;; Temporal stats are under :type/DateTime (for historical reasons)
        temporal-fp (get type-fp :type/DateTime)]
    (when (or global-fp number-fp temporal-fp)
      (cond-> {}
        ;; Global stats
        (:distinct-count global-fp)
        (assoc :distinct-count (:distinct-count global-fp))

        (some? (:nil% global-fp))
        (assoc :nil-percent (:nil% global-fp))

        ;; Number stats
        (some? (:min number-fp))
        (assoc :min (:min number-fp))

        (some? (:max number-fp))
        (assoc :max (:max number-fp))

        (some? (:avg number-fp))
        (assoc :avg (:avg number-fp))

        (some? (:q1 number-fp))
        (assoc :q1 (:q1 number-fp))

        (some? (:q3 number-fp))
        (assoc :q3 (:q3 number-fp))

        ;; Temporal stats
        (:earliest temporal-fp)
        (assoc :earliest (:earliest temporal-fp))

        (:latest temporal-fp)
        (assoc :latest (:latest temporal-fp))))))

(defn- collect-field-metadata
  "Collect metadata for fields in a table, including fingerprint stats."
  [table-id]
  (let [fields (t2/select :model/Field :table_id table-id :active true)]
    (mapv (fn [field]
            (merge
             {:id           (:id field)
              :name         (:name field)
              :display-name (:display_name field)
              :base-type    (:base_type field)
              :semantic-type (:semantic_type field)}
             (when-let [stats (get-field-stats field)]
               {:stats stats})))
          fields)))

(mu/defn collect-table-stats :- ::transforms.schema/inspector-source-detail
  "Collect statistics for a table including row count, column count, and field metadata."
  [table-id :- pos-int?]
  (let [table (t2/select-one :model/Table :id table-id)
        fields (collect-field-metadata table-id)
        row-count (get-table-row-count table-id)]
    {:table-id     table-id
     :table-name   (:name table)
     :schema       (:schema table)
     :row-count    row-count
     :column-count (count fields)
     :fields       fields}))

;;; -------------------------------------------------- Target Table ---------------------------------------------------

(defn get-target-table
  "Get the target table for a transform. Returns nil if the target doesn't exist."
  [{:keys [target] :as transform}]
  (let [db-id (transforms.i/target-db-id transform)]
    (transforms.util/target-table db-id target)))

;;; -------------------------------------------------- Column Matching ---------------------------------------------------

(defn- parse-joined-column-name
  "Parse a joined column name like 'Test Customers - Customer__region'.
   Returns {:alias \"Test Customers - Customer\" :field-name \"region\"} or nil if not a joined column."
  [name]
  (when-let [[_ alias field-name] (re-find #"^(.+)__(.+)$" name)]
    {:alias alias :field-name field-name}))

(defn- normalize-column-name
  "Normalize a column name for comparison (lowercase, remove underscores/hyphens)."
  [name]
  (when name
    (-> name
        u/lower-case-en
        (str/replace #"[-_]" ""))))

(defn match-columns
  "Find columns that relate between input and output tables.
   One output column may match multiple input columns (e.g., from different join sources).
   When joins info is provided, uses join alias to match joined columns to the correct source table.
   Returns groups: [{:output-column \"customer_id\"
                     :input-columns [{:table-id 1 :table-name \"orders\" :column \"customer_id\"}
                                     {:table-id 2 :table-name \"customers\" :column \"id\"}]}]"
  [source-stats target-stats joins]
  (let [target-fields (:fields target-stats)
        ;; Build alias → source-table-id mapping from joins
        alias->source-table (into {} (map (juxt :alias :source-table) joins))
        source-fields (for [{:keys [table-id table-name fields]} source-stats
                            field fields]
                        (assoc field :source-table-id table-id :source-table-name table-name))]
    (for [target-field target-fields
          :let [col-name (:name target-field)
                parsed (parse-joined-column-name col-name)
                ;; If it's a joined column with known alias, match to specific source table
                matching-inputs
                (if-let [source-table-id (some-> parsed :alias alias->source-table)]
                  ;; Match by alias → specific source table + field name
                  (let [field-name (normalize-column-name (:field-name parsed))]
                    (filter #(and (= (:source-table-id %) source-table-id)
                                  (= field-name (normalize-column-name (:name %))))
                            source-fields))
                  ;; No alias or unknown alias → fall back to name matching across all sources
                  (let [target-name (normalize-column-name (or (:field-name parsed) col-name))]
                    (filter #(= target-name (normalize-column-name (:name %)))
                            source-fields)))]
          :when (seq matching-inputs)]
      {:output-column col-name
       :output-field target-field
       :input-columns (mapv (fn [f]
                              {:table-id   (:source-table-id f)
                               :table-name (:source-table-name f)
                               :column     (:name f)
                               :field      f})
                            matching-inputs)})))

;;; -------------------------------------------------- Distribution Card Generation ---------------------------------------------------

(defn- make-distribution-query
  "Generate an MBQL query for field distribution (histogram/breakdown)."
  [db-id table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)
        field-metadata (lib.metadata/field mp field-id)
        query (-> (lib/query mp table-metadata)
                  (lib/aggregate (lib/count))
                  (lib/breakout (lib/ref field-metadata))
                  #_(lib/limit 50))]
    query))

(defn- make-distribution-card
  "Generate a visualization card structure for field distribution."
  [db-id table-id table-name field-id field-name source-type]
  (let [query (make-distribution-query db-id table-id field-id)]
    {:id (str field-name "-" table-name "-" (name source-type))
     :source source-type
     :table-name table-name
     :field-name field-name
     :title (str field-name " (" (if (= source-type :input) "Input: " "Output: ") table-name ")")
     :display :row
     :dataset_query query}))

(defn make-column-comparison-group
  "Generate a group of cards for comparing input/output distributions for matched columns.
   source-table-id is the main FROM table - its cards are sorted first among inputs."
  [column-match db-id target-table-id target-table-name source-table-id]
  (let [{:keys [output-column output-field input-columns]} column-match
        ;; Sort input-columns so source table comes first
        sorted-inputs (sort-by #(if (= (:table-id %) source-table-id) 0 1) input-columns)]
    {:id (str output-column "-comparison")
     :output-column output-column
     :cards (concat
             ;; Input cards (may be multiple), sorted with source table first
             (for [{:keys [table-id table-name field]} sorted-inputs
                   :when (:id field)]
               (make-distribution-card db-id table-id table-name (:id field) (:name field) :input))
             ;; Output card (one)
             (when (:id output-field)
               [(make-distribution-card db-id target-table-id target-table-name
                                        (:id output-field) output-column :output)]))}))

;;; -------------------------------------------------- Summary Cards ---------------------------------------------------

(defn- make-summary-stats
  "Generate summary statistics comparing inputs to output."
  [source-stats target-stats]
  {:inputs (mapv (fn [{:keys [table-name row-count column-count]}]
                   {:table-name table-name
                    :row-count row-count
                    :column-count column-count})
                 source-stats)
   :output {:table-name (:table-name target-stats)
            :row-count (:row-count target-stats)
            :column-count (:column-count target-stats)}})

;;; -------------------------------------------------- Main Inspection ---------------------------------------------------

(mu/defn inspect-tables :- ::transforms.schema/generic-inspector-result
  "Generic inspection of input tables vs output table.
   Does not require a transform definition - works with any table IDs.
   Useful for inspecting transform subgraphs or arbitrary table comparisons.
   Optional joins param enables smarter column matching using join aliases.
   Optional source-table-id specifies the main FROM table for sorting column cards."
  ([input-table-ids output-table-id]
   (inspect-tables input-table-ids output-table-id nil nil))
  ([input-table-ids output-table-id joins]
   (inspect-tables input-table-ids output-table-id joins nil))
  ([input-table-ids :- [:sequential pos-int?]
    output-table-id :- pos-int?
    joins :- [:maybe [:sequential :map]]
    source-table-id :- [:maybe pos-int?]]
   (let [output-table (t2/select-one :model/Table :id output-table-id)
         db-id (:db_id output-table)

         ;; Collect stats for all tables
         source-stats (mapv collect-table-stats input-table-ids)
         target-stats (collect-table-stats output-table-id)

         ;; Column matching using join alias info when available
         column-matches (match-columns source-stats target-stats joins)

         ;; Use provided source-table-id, or fall back to first input
         source-table-id (or source-table-id (first input-table-ids))

         ;; Generate comparison cards, with source table inputs sorted first
         column-groups (mapv #(make-column-comparison-group % db-id output-table-id (:table-name target-stats) source-table-id)
                             column-matches)

         ;; Summary
         summary (make-summary-stats source-stats target-stats)]

     {:name "Table Inspector"
      :description (tru "Comparison of input tables to output table")
      :status :ready

      :summary summary
      :sources source-stats
      :target target-stats
      :column-comparisons column-groups})))

(mu/defn inspect-transform :- ::transforms.schema/inspector-result
  "Generate inspection data for a transform.
   Returns a dashboard-like structure with summary stats, join info, and visualization cards."
  [transform :- :map]
  (let [source-type (transforms.util/transform-source-type (:source transform))
        sources (extract-sources transform)
        target-table (get-target-table transform)]

    (if-not target-table
      ;; Target table doesn't exist - transform hasn't run yet
      {:name (str "Transform Inspector: " (:name transform))
       :description (tru "Transform has not been run yet. Run the transform to see inspection data.")
       :status :not-run
       :sources (mapv #(select-keys % [:table-name :schema]) sources)}

      ;; Target exists - extract joins first for smarter column matching
      (let [input-ids (mapv :table-id sources)
            ;; Get preprocessed query for MBQL, or native query info for native
            mbql-query (when (= source-type :mbql)
                         (try
                           (-> transform :source :query
                               transforms.util/massage-sql-query
                               qp.preprocess/preprocess)
                           (catch Exception e
                             (log/warn e "Failed to preprocess MBQL query")
                             nil)))
            ;; Extract joins (MBQL or native SQL) for column matching
            ;; Returns {:base-row-count <n> :joins [...]} or nil
            join-stats (case source-type
                         :mbql   (when mbql-query
                                   (try
                                     (extract-joins mbql-query)
                                     (catch Exception e
                                       (log/warn e "Failed to extract MBQL joins")
                                       nil)))
                         :native (try
                                   (extract-native-joins transform sources)
                                   (catch Exception e
                                     (log/warn e "Failed to extract native SQL joins")
                                     nil))
                         nil)
            ;; Extract just the joins seq for column matching
            joins-seq (:joins join-stats)
            ;; Get the actual source table ID from the query (the FROM table)
            query-source-table-id (:source-table-id join-stats)
            ;; Pass joins to inspect-tables for alias-aware column matching
            base-result (inspect-tables input-ids (:id target-table) joins-seq query-source-table-id)
            ;; Collect source stats for native field resolution
            source-stats (:sources base-result)
            ;; Extract visited fields from semantically important clauses
            visited-fields (case source-type
                             :mbql (when mbql-query
                                     (try
                                       (extract-mbql-visited-fields mbql-query)
                                       (catch Exception e
                                         (log/warn e "Failed to extract MBQL visited fields")
                                         nil)))
                             :native (try
                                       (let [query (get-in transform [:source :query])
                                             sql (get-in query [:stages 0 :native])
                                             db-id (transforms.util/transform-source-database transform)
                                             database (t2/select-one :model/Database :id db-id)
                                             driver-kw (keyword (:engine database))
                                             parsed (driver.u/parsed-query sql driver-kw)
                                             ast (macaw.ast/->ast parsed {:with-instance? false})
                                             cols (extract-native-visited-columns ast)]
                                         (resolve-native-visited-fields driver-kw source-stats cols))
                                       (catch Exception e
                                         (log/warn e "Failed to extract native visited fields")
                                         nil))
                             nil)]

        (cond-> (assoc base-result
                       :name (str "Transform Inspector: " (:name transform))
                       :description (tru "Analysis of transform inputs, outputs, and joins"))
          ;; Add base-row-count at top level (row count before any joins)
          (:base-row-count join-stats)
          (assoc :base-row-count (:base-row-count join-stats))

          ;; Add joins with iterative stats
          (seq joins-seq)
          (assoc :joins (mapv #(select-keys % [:strategy :alias :source-table :stats])
                              joins-seq))

          ;; Add visited fields for frontend preselection
          (and visited-fields (seq (:all visited-fields)))
          (assoc :visited-fields visited-fields))))))
