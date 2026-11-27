(ns metabase.funnysql.sandbox
  "Rewrites Funny SQL queries to read some tables in place of others and to read, update, delete and insert only the rows
  of some tables whose column holds one value, throwing for a query it cannot rewrite that way."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.funnysql.schema :as funnysql.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- identifier-name
  "The name of the table or column `x`, without a schema or table part, or nil when `x` is no keyword."
  [x]
  (when (keyword? x)
    (peek (str/split (name x) #"\."))))

(defn- identifier-key
  "The lower-cased [[identifier-name]] of `x`, by which the sandbox compares tables and columns."
  [x]
  (some-> (identifier-name x) u/lower-case-en))

(defn- row-filter
  "The row filter of `ctx` for the table `x`, or nil."
  [{:keys [row-filters]} x]
  (get row-filters (identifier-key x)))

(defn- substitute
  "The table `ctx` reads in place of the table `x`, or nil."
  [{:keys [table-substitutions]} x]
  (get table-substitutions (identifier-key x)))

(defn- ->sequence
  "The clause value `x`, a single item or a sequence or set of them, as a sequence of items, or nil when it is nil."
  [x]
  (cond
    (nil? x)                      nil
    (or (sequential? x) (set? x)) (seq x)
    :else                         [x]))

(defn- no-condition?
  "Whether the WHERE or ON value `x` means no condition, as nil and `[]` do in Funny SQL."
  [x]
  (or (nil? x) (= [] x)))

(defn- and-conditions
  "`condition` and `conditions` combined with AND, or nil when all of them mean no condition."
  [condition conditions]
  (let [cs (remove no-condition? (cons condition conditions))]
    (case (count cs)
      0 nil
      1 (first cs)
      (into [:and] cs))))

(defn- item-parts
  "`[source alias]` of a table reference or target table `item`, with a nil alias when it has none."
  [item]
  (if (vector? item)
    [(first item) (second item)]
    [item nil]))

(defn- relation-name
  "The name by which the rest of a query refers to the table `table` aliased `alias`."
  [table alias]
  (or alias (keyword (identifier-name table))))

(defn- in-filter
  "The condition that the column of the row filter `f`, of the relation named `relation`, holds its value, read through
  `+ 0` in a statement that locks the rows it reads on MySQL, so that it locks only the rows its own index selects, not
  every row the filter keeps."
  [ctx {:keys [column value]} relation]
  (let [column (u/qualified-key relation column)]
    [:= (if (and (= :mysql (:engine ctx)) (:locking? ctx)) [:+ column [:inline 0]] column) value]))

(declare query-map expr)

(defn- expr-subquery
  "The subquery `x` sandboxed by `ctx`, keeping its metadata."
  [ctx x]
  (with-meta (query-map ctx x) (meta x)))

(defn- expr-call
  "The call `x` with every expression in its arguments sandboxed by `ctx`."
  [ctx [op & args :as x]]
  (case op
    (:lift :inline :literal) x
    :param                   (throw (ex-info "sandbox-query doesn't support [:param ...] values" {:form x}))
    (with-meta (into [op] (map #(expr ctx %)) args) (meta x))))

(defn- expr-list
  "The list `x` with every expression in it sandboxed by `ctx`."
  [ctx x]
  (cond
    (set? x)    (into #{} (map #(expr ctx %)) x)
    (vector? x) (with-meta (mapv #(expr ctx %) x) (meta x))
    :else       (with-meta (apply list (map #(expr ctx %) x)) (meta x))))

(defn- expr
  "The expression `x` with every query in it sandboxed by `ctx`."
  [ctx x]
  (cond
    (map? x)                                (expr-subquery ctx x)
    (and (vector? x) (keyword? (first x)))  (expr-call ctx x)
    (or (sequential? x) (set? x))           (expr-list ctx x)
    :else                                   x))

(defn- check-table
  "Throws unless `x`, in a position that names a table, is a keyword."
  [x]
  (when-not (keyword? x)
    (throw (ex-info (format "sandbox-query doesn't support the table reference %s" (pr-str x)) {:table x}))))

(defn- read-item
  "The table reference `item` with its subquery sandboxed and its table read through the substitution of `ctx`, under
  the name the rest of the query uses."
  [ctx item]
  (let [[source alias] (item-parts item)]
    (cond
      (map? source)     (cond-> [(expr-subquery ctx source)] alias (conj alias))
      (vector? source)  (cond-> [(expr ctx source)] alias (conj alias))
      (substitute ctx source) [(substitute ctx source) (relation-name source alias)]
      :else             (do (check-table source) item))))

(defn- read-condition
  "The condition that a row of the table reference `item`, as [[read-item]] reads it, passes the row filter of `ctx`, or
  nil when it has none."
  [ctx item]
  (let [[source alias] (item-parts item)]
    (when (keyword? source)
      (when-let [f (row-filter ctx (or (substitute ctx source) source))]
        (in-filter ctx f (relation-name source alias))))))

(defn- target-condition
  "The condition that a row of the write target `item`, which no substitution applies to, passes the row filter of
  `ctx`, or nil when it has none."
  [ctx item]
  (let [[table alias] (item-parts item)]
    (check-table table)
    (some-> (row-filter ctx table) (as-> f (in-filter ctx f (relation-name table alias))))))

(defn- clause-from
  "The `:from` clause `from` with every item read through [[read-item]], a bare table that reads through a substitution
  becoming a one-item clause, since `[view alias]` alone would name two tables."
  [ctx from]
  (if (keyword? from)
    (let [item (read-item ctx from)]
      (if (vector? item) [item] item))
    (mapv #(read-item ctx %) from)))

(defn- clause-joins
  "The join clause `joins`, alternating items and conditions, with every item read through [[read-item]]."
  [ctx joins]
  (into [] (comp (partition-all 2)
                 (mapcat (fn [[item condition]] [(read-item ctx item) (expr ctx condition)])))
        joins))

(defn- clause-with
  "The CTEs `ctes` with their queries sandboxed, throwing for a CTE named like a table `ctx` filters or substitutes,
  which H2 would read as the table."
  [ctx ctes]
  (mapv (fn [[cte-name subquery & options]]
          (let [identifier (if (vector? cte-name) (first cte-name) cte-name)]
            (when (or (row-filter ctx identifier) (substitute ctx identifier))
              (throw (ex-info "sandbox-query doesn't support a CTE named like a filtered table" {:cte identifier})))
            (into [cte-name (expr-subquery ctx subquery)] options)))
        ctes))

(defn- clause-assignments
  "The assignments `assignments` of the clause `k`, with every expression sandboxed by `ctx`."
  [ctx k assignments]
  (if (map? assignments)
    (update-vals assignments #(expr ctx %))
    (throw (ex-info (format "sandbox-query doesn't support %s assignments that are not a map" k) {:clause k}))))

(defn- clause-values
  "The `:values` rows `rows` with every expression sandboxed by `ctx`."
  [ctx rows]
  (mapv #(if (map? %) (update-vals % (fn [e] (expr ctx e))) (expr ctx %)) rows))

(defn- clause-insert-into
  "The `:insert-into` clause `x` with its `INSERT ... SELECT` source sandboxed by `ctx`."
  [ctx x]
  (if (and (vector? x) (vector? (first x)) (map? (second x)))
    (update x 1 #(expr-subquery ctx %))
    x))

(defn- clause-using
  "The `:using` source `x` of a MERGE sandboxed by `ctx`."
  [ctx x]
  (if (vector? x)
    (update x 0 #(expr-subquery ctx %))
    (expr-subquery ctx x)))

(defn- clause
  "The clause `k` of a query, holding `v`, with every query in it sandboxed by `ctx`."
  [ctx k v]
  (case k
    (:with :with-recursive)
    (clause-with ctx v)

    :from
    (clause-from ctx v)

    (:join :left-join :right-join :inner-join)
    (clause-joins ctx v)

    :using
    (clause-using ctx v)

    (:set :do-update-set :on-duplicate-key-update :when-matched-update-set)
    (clause-assignments ctx k v)

    :values
    (clause-values ctx v)

    :insert-into
    (clause-insert-into ctx v)

    (:select :select-distinct :where :group-by :having :order-by :partition-by :on :returning :union :union-all :nest
             :when-not-matched-insert)
    (expr ctx v)

    (:update :delete-from :merge-into :columns :key :on-conflict :do-nothing :for :limit :offset :create-table
             :with-columns :engine :character-set :collate :drop-table
             :analyze-table)
    v

    (throw (ex-info (format "sandbox-query doesn't support the clause %s" (pr-str k)) {:clause k}))))

(def ^:private join-clauses
  "The join clauses in the order Funny SQL compiles them, which is the order the database joins them in."
  [:join :left-join :right-join :inner-join])

(defn- check-joins
  "Throws unless the join clause `k` of `q` pairs every item with a condition."
  [q k]
  (let [joins (get q k)]
    (when (or (odd? (count joins)) (some no-condition? (take-nth 2 (rest joins))))
      (throw (ex-info (format "sandbox-query doesn't support a %s clause with an item that has no condition" k) {:clause k, :joins joins})))))

(defn- add-join-condition
  "`[joins pending]` with the item `item` of the join clause `k` added to `joins`, its ON condition `condition` extended
  by the item's [[read-condition]], or for a RIGHT JOIN by the `pending` WHERE conditions, which the item's own
  condition then replaces."
  [ctx [joins pending] [k item condition]]
  (let [own (read-condition ctx item)]
    (if (= k :right-join)
      [(update joins k (fnil conj []) item (and-conditions condition pending)) [own]]
      [(update joins k (fnil conj []) item (and-conditions condition [own])) pending])))

(defn- add-read-conditions
  "The query `q` reading only the filtered rows of its tables: a `:from` table through WHERE, a table joined by JOIN,
  LEFT JOIN or INNER JOIN through its ON, and a table joined by RIGHT JOIN through WHERE, with the WHERE conditions of
  the last `:from` table and the tables joined to it before a RIGHT JOIN moved into its ON."
  [ctx {:keys [from] :as q}]
  (run! #(check-joins q %) join-clauses)
  (let [from-conditions (mapv #(read-condition ctx %) (if (keyword? from) [from] from))
        [joins pending] (reduce #(add-join-condition ctx %1 %2)
                                [{} [(peek from-conditions)]]
                                (for [k join-clauses, [item condition] (partition 2 (get q k))]
                                  [k item condition]))]
    (m/assoc-some (merge q joins)
                  :where (and-conditions (:where q) (concat (butlast from-conditions) pending)))))

(defn- filter-column?
  "Whether the column `x` is the column of the row filter `f`."
  [f x]
  (= (identifier-key x) (identifier-key (:column f))))

(defn- check-value
  "Throws unless the expression `x` that a write puts into the column of the row filter `f` is its value."
  [{:keys [column value]} x]
  (when-not (= x value)
    (throw (ex-info (format "sandbox-query doesn't support writing %s into the sandbox column %s" (pr-str x) column) {:column column, :value value, :written x}))))

(defn- check-assignments
  "Throws unless `assignments` set the column of the row filter `f`, if at all, to its value."
  [f assignments]
  (doseq [[k v] assignments :when (filter-column? f k)]
    (check-value f v)))

(defn- guard-assignments
  "The upsert `assignments` of the target named `relation`, each keeping the stored value of a row the filter `f`
  leaves out, so that a conflict with such a row leaves it as it is, in the sandbox context `ctx`."
  [ctx f relation assignments]
  (check-assignments f assignments)
  (reduce-kv (fn [acc k v]
               (when-not (simple-keyword? k)
                 (throw (ex-info (format "sandbox-query doesn't support the upsert column %s" (pr-str k)) {:column k})))
               (assoc acc k [:case (in-filter ctx f relation) v :else (u/qualified-key relation k)]))
             assignments
             assignments))

(defn- add-value-to-row-maps
  "The `:values` map `rows`, each holding the value of the filter `f` in its column."
  [{:keys [column value] :as f} rows]
  (mapv (fn [row]
          (if-let [k (m/find-first #(filter-column? f %) (keys row))]
            (do (check-value f (get row k)) row)
            (assoc row column value)))
        rows))

(defn- add-value-to-row-vectors
  "`[columns rows]` of the column list `columns` and the row vectors `rows`, each row holding the value of the filter
  `f` in its column."
  [{:keys [column value] :as f} columns rows]
  (let [columns (vec (->sequence columns))
        rows    (mapv #(vec (->sequence %)) rows)]
    (when-not (every? #(= (count columns) (count %)) rows)
      (throw (ex-info "sandbox-query doesn't support VALUES rows whose length differs from their column list" {:columns columns, :rows rows})))
    (if-let [i (u/index-of #(filter-column? f %) columns)]
      (do (run! #(check-value f (nth % i)) rows)
          [columns rows])
      [(conj columns column) (mapv #(conj % value) rows)])))

(defn- add-selected-value
  "The query `q`, the source of an INSERT ... SELECT, also selecting the value of the filter `f`, in each query of a
  union."
  [{:keys [column value] :as f} q]
  (let [k (m/find-first #(contains? q %) [:select :select-distinct :union :union-all :nest])]
    (case k
      (:select :select-distinct)
      (do
        (when (some #(and (keyword? %) (= "*" (identifier-name %))) (->sequence (get q k)))
          (throw (ex-info "sandbox-query doesn't support an INSERT ... SELECT that selects *" {:query q})))
        (update q k #(conj (vec (->sequence %)) [value column])))

      (:union :union-all)
      (update q k (fn [qs] (mapv #(with-meta (add-selected-value f %) (meta %)) qs)))

      :nest
      (update q :nest #(with-meta (add-selected-value f %) (meta %)))

      (throw (ex-info "sandbox-query doesn't support an INSERT source other than VALUES rows, a SELECT, a union or a nested query" {:query q})))))

(defn- add-value-to-columns
  "The column list at `path` in the insert `q` with the column of the filter `f` added."
  [f q path]
  (let [columns (->sequence (get-in q path))]
    (when (or (empty? columns) (some #(filter-column? f %) columns))
      (throw (ex-info "sandbox-query doesn't support an INSERT ... SELECT without a column list or with the sandbox column in it" {:query q})))
    (conj (vec columns) (:column f))))

(defn- insert-parts
  "`[table columns-path subquery]` of the `:insert-into` clause of `q`, with a nil `subquery` when it has none."
  [q]
  (let [x (:insert-into q)]
    (cond
      (and (vector? x) (vector? (first x)))
      [(ffirst x) (if (some? (second (first x))) [:insert-into 0 1] [:columns]) (second x)]

      (vector? x)
      [(first x) (if (some? (second x)) [:insert-into 1] [:columns]) nil]

      :else
      [x [:columns] nil])))

(defn- add-value-to-insert
  "The insert `q` writing the value of the filter `f` into every row it inserts."
  [f q columns-path subquery]
  (cond
    subquery
    (-> q
        (assoc-in columns-path (add-value-to-columns f q columns-path))
        (update-in [:insert-into 1] #(with-meta (add-selected-value f %) (meta %))))

    (map? (first (:values q)))
    (update q :values #(add-value-to-row-maps f %))

    (contains? q :values)
    (if (empty? (->sequence (get-in q columns-path)))
      (throw (ex-info "sandbox-query doesn't support VALUES rows without a column list" {:query q}))
      (let [[columns rows] (add-value-to-row-vectors f (get-in q columns-path) (:values q))]
        (-> q (assoc-in columns-path columns) (assoc :values rows))))

    :else
    (throw (ex-info "sandbox-query doesn't support an INSERT without VALUES rows or a SELECT" {:query q}))))

(defn- query-insert
  "The insert `q` writing the filter value into every row it inserts into a filtered table, and leaving a row the
  filter leaves out as it is when one conflicts with it."
  [ctx q]
  (let [[table columns-path subquery] (insert-parts q)
        _                             (check-table table)
        f                             (row-filter ctx table)
        guard                         #(guard-assignments ctx f (relation-name table nil) %)]
    (cond
      (nil? f)
      q

      (and (:returning q) (some q [:do-update-set :on-duplicate-key-update]))
      (throw (ex-info "sandbox-query doesn't support an upsert with RETURNING" {:query q}))

      :else
      (add-value-to-insert f
                           (-> q
                               (m/update-existing :do-update-set guard)
                               (m/update-existing :on-duplicate-key-update guard))
                           columns-path
                           subquery))))

(defn- query-target
  "The update or delete `q` of the target in the clause `k` touching only the rows its row filter keeps."
  [ctx q k]
  (if-let [condition (target-condition ctx (get q k))]
    (do (some->> (:set q) (check-assignments (row-filter ctx (first (item-parts (get q k))))))
        (assoc q :where (and-conditions (:where q) [condition])))
    q))

(defn- query-merge
  "The merge `q` matching and inserting only the rows its row filter keeps, through its `:on` condition when it reads a
  `:using` source and through its `:key` columns otherwise."
  [ctx q]
  (let [condition (target-condition ctx (:merge-into q))
        f         (row-filter ctx (first (item-parts (:merge-into q))))]
    (cond
      (nil? condition)
      q

      (contains? q :using)
      (do (some->> (:when-matched-update-set q) (check-assignments f))
          (-> (assoc q :on (and-conditions (:on q) [condition]))
              (m/update-existing :when-not-matched-insert
                                 (fn [[columns values]]
                                   (update (add-value-to-row-vectors f columns [values]) 1 first)))))

      (not (and (seq (->sequence (:key q))) (seq (->sequence (:columns q))) (contains? q :values)))
      (throw (ex-info "sandbox-query doesn't support a MERGE that has no USING source and lacks a KEY, a column list or VALUES rows" {:query q}))

      :else
      (let [[columns rows] (add-value-to-row-vectors f (:columns q) (:values q))
            ks             (vec (->sequence (:key q)))]
        (assoc q
               :columns columns
               :values  rows
               :key     (cond-> ks (not-any? #(filter-column? f %) ks) (conj (:column f))))))))

(defn- locking?
  "Whether the query map `q` locks the rows it reads: a write, or a SELECT ... FOR UPDATE or FOR SHARE."
  [q]
  (boolean (some #(contains? q %) [:insert-into :update :delete-from :merge-into :for])))

(defn- query-map
  "The query or clause map `q` with every clause, and its insert, update, delete or merge target, sandboxed by `ctx`,
  whose queries a locking `q` marks as locking."
  [ctx q]
  (let [ctx (cond-> ctx (locking? q) (assoc :locking? true))
        q   (add-read-conditions ctx (reduce-kv (fn [q k v] (assoc q k (clause ctx k v))) q q))]
    (cond
      (:insert-into q) (query-insert ctx q)
      (:update q)      (query-target ctx q :update)
      (:delete-from q) (query-target ctx q :delete-from)
      (:merge-into q)  (query-merge ctx q)
      :else            q)))

(defn- context
  "The sandbox context of the options `opts` for the app DB `engine`, keyed by lower-cased table names."
  [engine {:keys [table-substitutions row-filters]}]
  {:engine              engine
   :table-substitutions (update-keys (or table-substitutions {}) identifier-key)
   :row-filters         (update-keys (or row-filters {}) identifier-key)})

(mu/defn sandbox-query :- ::funnysql.schema/query
  "`query` reading each table of `:table-substitutions` in place of its key, under the name the rest of the query uses,
  and reading, updating, deleting and inserting only the rows of each table of `:row-filters` whose column holds its
  value on the app DB `engine`, throwing for a query it cannot rewrite that way, even with no options."
  [engine :- ::funnysql.schema/engine
   query  :- ::funnysql.schema/query
   opts   :- ::funnysql.schema/sandbox.options]
  (query-map (context engine opts) query))
