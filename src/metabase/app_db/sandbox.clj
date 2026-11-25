(ns metabase.app-db.sandbox
  "Rewrites a Honey SQL query against the application database so that it reads, updates and deletes only the rows of
  some tables whose column holds one value, writes that value into the rows it inserts into them, and throws for a
  query it cannot rewrite that way."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private query-clauses
  "The clauses of which a top-level query map has at least one."
  #{:with :with-recursive :select :select-distinct :union :union-all :nest :values :insert-into :merge-into :update
    :delete-from})

(defn- query-map?
  "Whether `x` is a Honey SQL query map."
  [x]
  (and (map? x) (boolean (some query-clauses (keys x)))))

(defn- unsupported
  "An exception saying that `sandbox-query` does not support `what`, and what it supports instead."
  [what supported data]
  (ex-info (format "sandbox-query does not support %s; it supports %s" what supported) data))

(defn- identifier-name
  "The name of the table or column in the identifier `x`, as written and without a schema or table part, or nil when
  `x` is not a keyword or an `::h2x/identifier`."
  [x]
  (cond
    (keyword? x)
    (peek (str/split (name x) #"\."))

    (and (vector? x) (= ::h2x/identifier (first x)))
    (some-> (peek (vec (get x 2))) name)))

(defn- identifier-key
  "The lower-cased [[identifier-name]] of `x`, by which the sandbox compares tables and columns, so that every spelling
  that a database can resolve to a sandboxed table or the sandbox column matches it."
  [x]
  (some-> (identifier-name x) u/lower-case-en))

(defn- sandboxed?
  "Whether the identifier `x` names a sandboxed table of `ctx`."
  [{:keys [tables]} x]
  (contains? tables (identifier-key x)))

(defn- sandbox-column?
  "Whether the column identifier `x` names the sandbox column of `ctx`."
  [{:keys [column]} x]
  (= (identifier-key x) (identifier-key column)))

(defn- identifier-parts
  "`[identifier alias]` of a `:from`, join, `:using`, `:update`, `:delete-from` or `:merge-into` item, with a nil alias
  when the item has none, throwing for an alias that is not a plain keyword."
  [item]
  (if (and (vector? item) (<= 1 (count item) 2))
    (let [[identifier alias] item]
      (when-not (or (nil? alias) (and (simple-keyword? alias) (not (str/includes? (name alias) "."))))
        (throw (unsupported (format "the alias %s" (pr-str alias)) "plain keywords as aliases" {:alias alias})))
      [identifier alias])
    [item nil]))

(defn- relation-name
  "The name by which the rest of a query refers to the table `identifier` aliased `alias`: the alias, or else the
  table's own name as written."
  [identifier alias]
  (or alias (keyword (identifier-name identifier))))

(defn- in-sandbox
  "The condition that the sandbox column of `ctx`, of the relation named `relation`, holds the sandbox value."
  [{:keys [column value]} relation]
  [:= (u/qualified-key relation column) value])

(defn- ->sequence
  "The clause value `x`, a single item or a sequence or set of them, as a sequence of items, or nil when it is nil, as
  Funny SQL reads it."
  [x]
  (cond
    (nil? x)                      nil
    (or (sequential? x) (set? x)) (seq x)
    :else                         [x]))

(declare sandbox*)

(defn- expression
  "The Honey SQL expression `x` with every query in it sandboxed by `ctx`, throwing for a `[:param ...]`, whose bound
  value it cannot see, for a collection other than a map, set, vector or list, and for a query it cannot sandbox."
  [ctx x]
  (cond
    (map? x)
    (sandbox* ctx x)

    (set? x)
    (into (empty x) (map #(expression ctx %)) x)

    (and (vector? x) (#{:lift ::h2x/literal ::h2x/raw-type-name ::h2x/identifier} (first x)))
    x

    (and (vector? x) (= :param (first x)))
    (throw (unsupported "a [:param ...] value, which it cannot see" "values written into the query" {:form x}))

    (and (vector? x) (= ::h2x/typed (first x)))
    (update x 1 #(expression ctx %))

    (vector? x)
    (with-meta (mapv #(expression ctx %) x) (meta x))

    (seq? x)
    (with-meta (apply list (map #(expression ctx %) x)) (meta x))

    (coll? x)
    (throw (unsupported (format "a %s in a query" (.getName (class x))) "maps, sets, vectors and lists" {:form x}))

    :else
    x))

(defn- check-table
  "Throw unless the identifier `x`, in a position that names a table, is a keyword or an `::h2x/identifier`."
  [x]
  (when-not (identifier-name x)
    (throw (unsupported (format "the table reference %s" (pr-str x))
                        "keywords and h2x identifiers, and subqueries in FROM, joins and USING"
                        {:table x}))))

(defn- read-item
  "The `:from`, join or `:using` item `item` with its subquery sandboxed by `ctx`, throwing for an item that is neither
  a subquery nor a table and for an alias that is not a plain keyword."
  [ctx item]
  (let [[identifier alias] (identifier-parts item)]
    (if (map? identifier)
      (cond-> [(sandbox* ctx identifier)] alias (conj alias))
      (do (check-table identifier) item))))

(defn- read-condition
  "The condition that a row of the `:from`, join, `:using` or target item `item` holds the sandbox value of `ctx`, or
  nil when the item is a subquery or a table that is not sandboxed."
  [ctx item]
  (let [[identifier alias] (identifier-parts item)]
    (when (sandboxed? ctx identifier)
      (in-sandbox ctx (relation-name identifier alias)))))

(defn- from-clause
  "The `:from` clause `from` with every item read through [[read-item]]."
  [ctx from]
  (if (keyword? from)
    (read-item ctx from)
    (mapv #(read-item ctx %) from)))

(defn- join-clause
  "The join clause `joins`, alternating items and conditions, with every item read through [[read-item]]."
  [ctx joins]
  (into [] (comp (partition-all 2)
                 (mapcat (fn [[item condition]] [(read-item ctx item) (expression ctx condition)])))
        joins))

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

(def ^:private join-clauses
  "The join clauses in the order Funny SQL compiles them, which is the order the database joins them in."
  [:join :left-join :right-join :inner-join])

(defn- add-join-condition
  "`[joins pending]` with the item `item` of the join clause `k` added to `joins`, its ON condition `condition` extended
  by the item's [[read-condition]], or for a RIGHT JOIN by the `pending` WHERE conditions, which the item's own
  condition then replaces."
  [ctx [joins pending] [k item condition]]
  (let [own (read-condition ctx item)]
    (if (= k :right-join)
      [(update joins k (fnil conj []) item (and-conditions condition pending)) [own]]
      [(update joins k (fnil conj []) item (and-conditions condition [own])) pending])))

(defn- check-joins
  "Throw unless the join clause `k` of `q` pairs every item with a condition, which Funny SQL requires and the sandbox
  conditions would otherwise make up for."
  [q k]
  (let [joins (get q k)]
    (when (or (odd? (count joins)) (some no-condition? (take-nth 2 (rest joins))))
      (throw (unsupported (format "a %s clause with an item that has no condition" k) "joins with conditions"
                          {:clause k, :joins joins})))))

(defn- add-read-conditions
  "The query `q` reading only the sandbox rows of its sandboxed tables: a `:from` table through WHERE, a table joined by
  JOIN, LEFT JOIN or INNER JOIN through its ON, and a table joined by RIGHT JOIN through WHERE, with the WHERE
  conditions of the last `:from` table and the tables joined to it before a RIGHT JOIN moved into its ON, since it can
  extend them with NULLs, throwing for a join without a condition."
  [ctx {:keys [from] :as q}]
  (run! #(check-joins q %) join-clauses)
  (let [from-conditions (mapv #(read-condition ctx %) (if (keyword? from) [from] from))
        [joins pending] (reduce #(add-join-condition ctx %1 %2)
                                [{} [(peek from-conditions)]]
                                (for [k join-clauses, [item condition] (partition 2 (get q k))]
                                  [k item condition]))]
    (m/assoc-some (merge q joins)
                  :where (and-conditions (:where q) (concat (butlast from-conditions) pending)))))

(defn- sandbox-ctes
  "The CTEs `ctes` with their queries sandboxed, throwing for a CTE named like a sandboxed table, which H2 would read as
  the table."
  [ctx ctes]
  (mapv (fn [[identifier query & options]]
          (let [cte-identifier (if (and (vector? identifier) (map? (second identifier))) (first identifier) identifier)]
            (when (sandboxed? ctx cte-identifier)
              (throw (unsupported (format "a CTE named like the sandboxed table %s" (pr-str cte-identifier))
                                  "CTEs with other names"
                                  {:cte cte-identifier})))
            (into [identifier (sandbox* ctx query)] options)))
        ctes))

(defn- check-value
  "Throw unless the expression `x` that a write puts into the sandbox column is the sandbox value of `ctx`."
  [{:keys [column value]} x]
  (when-not (= x value)
    (throw (unsupported (format "writing %s into the sandbox column %s" (pr-str x) column)
                        (format "writing the sandbox value %s" (pr-str value))
                        {:column column, :value value, :written x}))))

(defn- check-assignments
  "Throw unless the assignments `assignments`, a map of column to expression, set the sandbox column, if at all, to the
  sandbox value."
  [ctx assignments]
  (doseq [[k v] assignments :when (sandbox-column? ctx k)]
    (check-value ctx v)))

(defn- guard-assignments
  "The upsert assignments `assignments` of the target named `relation`, each keeping the stored value of a row outside
  the sandbox, so that a conflict with such a row leaves it as it is, throwing for a column that is not a plain keyword
  and when they write another value into the sandbox column."
  [ctx relation assignments]
  (check-assignments ctx assignments)
  (reduce-kv (fn [acc k v]
               (when-not (simple-keyword? k)
                 (throw (unsupported (format "the upsert column %s" (pr-str k))
                                     "plain keywords as upsert columns"
                                     {:column k})))
               (assoc acc k [:case (in-sandbox ctx relation) v :else (u/qualified-key relation k)]))
             assignments
             assignments))

(defn- add-value-to-row-maps
  "The `:values` rows `rows`, maps, each holding the sandbox value in the sandbox column, throwing for a row that holds
  another value there."
  [{:keys [column value] :as ctx} rows]
  (mapv (fn [row]
          (if-let [k (m/find-first #(sandbox-column? ctx %) (keys row))]
            (do (check-value ctx (get row k)) row)
            (assoc row column value)))
        rows))

(defn- add-value-to-row-vectors*
  "`[columns rows]` of the column vector `columns` and the row vectors `rows` of the same length, each row holding the
  sandbox value in the sandbox column, throwing for a row that holds another value there."
  [{:keys [column value] :as ctx} columns rows]
  (if-let [i (u/index-of #(sandbox-column? ctx %) columns)]
    (do (run! #(check-value ctx (nth % i)) rows)
        [columns rows])
    [(conj (vec columns) column) (mapv #(conj (vec %) value) rows)]))

(defn- add-value-to-row-vectors
  "`[columns rows]` of the column list `columns` and the rows `rows`, vectors in that order, each row holding the
  sandbox value in the sandbox column, throwing for a row whose length differs from the column list or that holds
  another value there."
  [ctx columns rows]
  (let [columns (vec (->sequence columns))
        rows    (mapv #(vec (->sequence %)) rows)]
    (when-not (every? #(= (count columns) (count %)) rows)
      (throw (unsupported "VALUES rows whose length differs from their column list"
                          "rows with one value per column"
                          {:columns columns, :rows rows})))
    (add-value-to-row-vectors* ctx columns rows)))

(defn- add-selected-value
  "The query `q`, the source of an INSERT ... SELECT, also selecting the sandbox value, in each query of a union,
  throwing for a source whose columns it cannot tell."
  [{:keys [column value] :as ctx} q]
  (let [clause (m/find-first #(contains? q %) [:select :select-distinct :union :union-all :nest])]
    (case clause
      (:select :select-distinct)
      (do
        (when (some #(and (keyword? %) (= "*" (identifier-name %))) (->sequence (get q clause)))
          (throw (unsupported "an INSERT ... SELECT that selects *" "sources that list their columns" {:query q})))
        (update q clause #(conj (vec (->sequence %)) [[:inline value] column])))

      (:union :union-all)
      (update q clause (fn [qs] (mapv #(add-selected-value ctx %) qs)))

      :nest
      (update q :nest #(add-selected-value ctx %))

      (throw (unsupported "an INSERT source other than VALUES rows, a SELECT, a union or a nested query"
                          "VALUES rows, SELECTs, unions and nested queries"
                          {:query q})))))

(defn- add-value-to-columns
  "The column list at `columns-path` in the insert `q` with the sandbox column added, throwing when `q` has no column
  list or has the sandbox column in it."
  [ctx q columns-path]
  (let [columns (->sequence (get-in q columns-path))]
    (when (or (empty? columns) (some #(sandbox-column? ctx %) columns))
      (throw (unsupported "an INSERT ... SELECT without a column list or with the sandbox column in it"
                          "a column list without the sandbox column"
                          {:query q})))
    (conj (vec columns) (:column ctx))))

(defn- insert-parts
  "`[table columns-path subquery]` of the `:insert-into` clause of `q`, with a nil `subquery` when it has none."
  [q]
  (let [x (:insert-into q)]
    (cond
      (and (vector? x) (vector? (first x))) [(ffirst x) [:insert-into 0 1] (second x)]
      (vector? x)                           [(first x) [:insert-into 1] nil]
      :else                                 [x [:columns] nil])))

(defn- add-value-to-insert
  "The insert `q` of a sandboxed table writing the sandbox value into every row it inserts, throwing for an insert it
  cannot rewrite that way."
  [ctx q columns-path subquery]
  (cond
    subquery
    (-> q
        (assoc-in columns-path (add-value-to-columns ctx q columns-path))
        (update-in [:insert-into 1] #(add-selected-value ctx %)))

    (map? (first (:values q)))
    (update q :values #(add-value-to-row-maps ctx %))

    (contains? q :values)
    (if (empty? (->sequence (get-in q columns-path)))
      (throw (unsupported "VALUES rows without a column list" "map rows and rows with a column list" {:query q}))
      (let [[columns rows] (add-value-to-row-vectors ctx (get-in q columns-path) (:values q))]
        (-> q (assoc-in columns-path columns) (assoc :values rows))))

    :else
    (add-selected-value ctx (assoc-in q columns-path (add-value-to-columns ctx q columns-path)))))

(defn- sandbox-insert
  "The insert `q` writing the sandbox value into every row it inserts into a sandboxed table, and leaving a row outside
  the sandbox as it is when one conflicts with it, throwing for an insert it cannot rewrite that way."
  [ctx q]
  (let [[table columns-path subquery] (insert-parts q)
        relation                      (relation-name table nil)
        guard                         #(guard-assignments ctx relation %)]
    (check-table table)
    (cond
      (not (sandboxed? ctx table))
      q

      (and (:returning q) (some q [:do-update-set :on-duplicate-key-update]))
      (throw (unsupported "an upsert with RETURNING" "upserts without RETURNING" {:query q}))

      :else
      (add-value-to-insert ctx
                           (-> q
                               (m/update-existing :do-update-set guard)
                               (m/update-existing :on-duplicate-key-update guard))
                           columns-path
                           subquery))))

(defn- target-condition
  "The [[read-condition]] of the target item `item` of a write, throwing when the item names no table or has an alias
  that is not a plain keyword."
  [ctx item]
  (check-table (first (identifier-parts item)))
  (read-condition ctx item))

(defn- sandbox-target
  "The update or delete `q` of the target in `clause` touching only sandbox rows, throwing for a target that is not a
  table, for an alias that is not a plain keyword and for an update that writes another value into the sandbox column."
  [ctx q clause]
  (if-let [condition (target-condition ctx (get q clause))]
    (do (some->> (:set q) (check-assignments ctx))
        (update q :where and-conditions [condition]))
    q))

(defn- sandbox-merge
  "The merge `q` matching and inserting only sandbox rows, through its `:on` condition when it reads a `:using` source
  and through its `:key` columns otherwise, throwing for a merge it cannot rewrite that way."
  [ctx q]
  (let [condition (target-condition ctx (:merge-into q))]
    (cond
      (nil? condition)
      q

      (contains? q :using)
      (do (some->> (:when-matched-update-set q) (check-assignments ctx))
          (-> (update q :on and-conditions [condition])
              (m/update-existing :when-not-matched-insert
                                 (fn [[columns values]]
                                   (update (add-value-to-row-vectors ctx columns [values]) 1 first)))))

      (not (and (seq (->sequence (:key q))) (seq (->sequence (:columns q))) (contains? q :values)))
      (throw (unsupported "a MERGE that has no USING source and lacks a KEY, a column list or VALUES rows"
                          "MERGE ... USING and MERGE ... KEY of VALUES rows with a column list"
                          {:query q}))

      :else
      (let [[columns rows] (add-value-to-row-vectors ctx (:columns q) (:values q))]
        (-> q
            (assoc :columns columns :values rows)
            (update :key (fn [ks]
                           (let [ks (vec (->sequence ks))]
                             (cond-> ks (not-any? #(sandbox-column? ctx %) ks) (conj (:column ctx)))))))))))

(defn- sandbox-clause
  "The clause `k` of a query, holding `v`, with every query in it sandboxed by `ctx`, throwing for a clause it does not
  know, for a MERGE whose USING source is a sandboxed table and for a query it cannot sandbox."
  [ctx k v]
  (case k
    (:with :with-recursive)
    (sandbox-ctes ctx v)

    :from
    (from-clause ctx v)

    (:join :left-join :right-join :inner-join)
    (join-clause ctx v)

    :using
    (if (read-condition ctx v)
      (throw (unsupported "a MERGE whose USING source is a sandboxed table"
                          "USING subqueries and tables that are not sandboxed"
                          {:using v}))
      (read-item ctx v))

    (:set :do-update-set :on-duplicate-key-update :when-matched-update-set)
    (if (map? v)
      (update-vals v #(expression ctx %))
      (throw (unsupported (format "%s assignments that are not a map" k) "maps of column to expression" {:clause k})))

    :values
    (mapv #(if (map? %) (update-vals % (fn [e] (expression ctx e))) (expression ctx %)) v)

    (:select :select-distinct :where :group-by :having :order-by :partition-by :on :returning :limit :offset
             :union :union-all :nest :when-not-matched-insert)
    (expression ctx v)

    :insert-into
    (if (and (vector? v) (map? (second v))) (update v 1 #(sandbox* ctx %)) v)

    (:update :delete-from :merge-into :columns :key :on-conflict :for)
    v

    (throw (unsupported (format "the clause %s" (pr-str k))
                        "the clauses Funny SQL compiles other than :create-table, :with-columns and :drop-table"
                        {:clause k}))))

(defn- sandbox*
  "The query or clause map `q` with every clause and its insert, update, delete or merge target sandboxed by `ctx`,
  throwing for a query it cannot sandbox."
  [ctx q]
  (let [q (add-read-conditions ctx (reduce-kv (fn [q k v] (assoc q k (sandbox-clause ctx k v))) q q))]
    (cond
      (:insert-into q) (sandbox-insert ctx q)
      (:update q)      (sandbox-target ctx q :update)
      (:delete-from q) (sandbox-target ctx q :delete-from)
      (:merge-into q)  (sandbox-merge ctx q)
      :else            q)))

(def ^:private Query
  [:fn {:description "a Honey SQL query map"} query-map?])

(mu/defn sandbox-query :- Query
  "The Honey SQL query `query` reading, updating and deleting only the rows of the tables `table-names`, matched by name
  regardless of case and schema, whose integer column `column-name` holds `column-value`, writing `column-value` into
  that column of the rows it inserts into them, and throwing for a query it cannot rewrite that way."
  [query :- Query
   {:keys [table-names column-name column-value]}
   :- [:map {:closed true}
       [:table-names  [:set {:min 1} :keyword]]
       [:column-name  :keyword]
       [:column-value :int]]]
  (sandbox* {:tables (into #{} (map identifier-key) table-names) :column column-name :value column-value} query))
