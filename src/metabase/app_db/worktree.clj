(ns metabase.app-db.worktree
  "Remote sync worktrees in the app DB: the worktree the app DB queries of a thread see, and the rewrite of their Honey
  SQL that keeps them in it. Every reference to a table with `worktree_id` reads a subquery of the rows of the thread's
  worktree, an update or delete changes only those rows, and an insert gives its rows the worktree."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::scope
  "The rows the app DB queries of a thread see: the main app's, a worktree's, or every row."
  [:multi {:dispatch :type}
   [:main     [:map {:closed true} [:type [:= :main]]]]
   [:worktree [:map {:closed true} [:type [:= :worktree]] [:worktree-id pos-int?]]]
   [:all      [:map {:closed true} [:type [:= :all]]]]])

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *scope*
  "The rows the app DB queries of this thread see, a [[::scope]]."
  {:type :main})

(def default-worktree-id
  "The id of the default worktree, the main app, which the migration that added worktrees creates."
  1)

(defn worktree-id
  "The id of the worktree this thread works in, or nil in the main app or across every worktree."
  []
  (when (= :worktree (:type *scope*))
    (:worktree-id *scope*)))

(mu/defn do-with-worktree-scope
  "Impl for [[with-worktree-scope]]."
  [scope :- ::scope
   thunk :- ifn?]
  (binding [*scope* scope]
    (thunk)))

(defmacro with-worktree-scope
  "Runs `body` with the app DB queries it runs seeing the rows of `scope`, a [[::scope]]: `{:type :main}`,
  `{:type :worktree :worktree-id id}` or `{:type :all}`."
  {:style/indent 1}
  [scope & body]
  `(do-with-worktree-scope ~scope (^:once fn* [] ~@body)))

(def ^:private tables-without-models
  "The tables with `worktree_id` that no model names."
  #{"audit_log" "card_label" "dashboard_favorite" "report_cardfavorite"})

(def ^:private model-tables
  (memoize
   (fn [models]
     (into tables-without-models (map #(u/lower-case-en (name (t2/table-name %)))) models))))

(defn- worktree-tables
  "The names of the tables with `worktree_id`: those of the models deriving `:hook/worktree-id`, and the few no model
  names."
  []
  (model-tables (descendants :hook/worktree-id)))

(defn- worktree-table?
  "Whether `x` names a table with `worktree_id`."
  [tables x]
  (and (keyword? x) (contains? tables (u/lower-case-en (name x)))))

(defn- worktree-rows
  "The subquery of the rows of `table` in the worktree with `worktree-id`."
  [table worktree-id]
  (with-meta {:select [:*] :from [table] :where [:= :worktree_id [:inline worktree-id]]}
    {:allow-subquery true ::scoped true}))

(declare scope-form)

(defn- scope-table-item
  "The `FROM` or join item `item`, reading the rows of the worktree with `worktree-id` when it names a worktree table,
  under its own name unless it has an alias."
  [tables worktree-id item]
  (let [[table alias] (if (vector? item) item [item])]
    (cond
      (worktree-table? tables table) [(worktree-rows table worktree-id) (or alias table)]
      (map? table)                   (if (vector? item)
                                       (assoc item 0 (scope-form tables worktree-id table))
                                       (scope-form tables worktree-id table))
      :else                          item)))

(defn- scope-joins
  "The join clause `joins`, alternating items and conditions, with each item and condition scoped."
  [tables worktree-id joins]
  (into []
        (map-indexed (fn [i x]
                       (if (even? i)
                         (scope-table-item tables worktree-id x)
                         (scope-form tables worktree-id x))))
        joins))

(defn- where-worktree
  "`query` with its `WHERE` also requiring the worktree with `worktree-id`."
  [query worktree-id]
  (let [condition [:= :worktree_id [:inline worktree-id]]]
    (update query :where #(if % [:and % condition] condition))))

(defn- target-table
  "The table an `UPDATE`, `DELETE` or `INSERT` clause value `x` names."
  [x]
  (cond-> x (vector? x) first))

(defn- insert-worktree
  "The insert `query` into a worktree table with each of its rows in the worktree with `worktree-id`."
  [query worktree-id]
  (let [into-clause (:insert-into query)
        columns     (or (:columns query)
                        (when (and (vector? into-clause) (sequential? (second into-clause)))
                          (second into-clause)))]
    (cond
      (every? map? (:values query))
      (update query :values (partial mapv #(cond-> % (not (contains? % :worktree_id)) (assoc :worktree_id worktree-id))))

      (and columns (not (some #{:worktree_id} columns)) (every? sequential? (:values query)))
      (cond-> (update query :values (partial mapv #(conj (vec %) worktree-id)))
        (:columns query)                       (update :columns #(conj (vec %) :worktree_id))
        (not (:columns query))                 (assoc :insert-into [(first into-clause) (conj (vec columns) :worktree_id)]))

      :else
      query)))

(defn- scope-query
  "The Honey SQL map `query` with every reference to a worktree table reading the rows of the worktree with
  `worktree-id`, its update or delete limited to them, and its inserted rows given the worktree."
  [tables worktree-id query]
  (if (::scoped (meta query))
    query
    (let [scoped (into (empty query)
                       (map (fn [[k v]]
                              [k (cond
                                   (= :from k)                         (mapv (partial scope-table-item tables worktree-id)
                                                                             (if (sequential? v) v [v]))
                                   (#{:join :left-join :right-join :inner-join} k) (scope-joins tables worktree-id v)
                                   (#{:update :delete-from :insert-into} k) v
                                   :else                               (scope-form tables worktree-id v))]))
                       query)
          scoped (with-meta scoped (meta query))]
      (cond
        (and (:update scoped) (worktree-table? tables (target-table (:update scoped))))
        (where-worktree scoped worktree-id)

        (and (:delete-from scoped) (worktree-table? tables (target-table (:delete-from scoped))))
        (where-worktree scoped worktree-id)

        (and (:insert-into scoped) (worktree-table? tables (target-table (:insert-into scoped))))
        (insert-worktree scoped worktree-id)

        :else
        scoped))))

(defn- scope-form
  "`x`, a Honey SQL form, with each query in it scoped to the worktree with `worktree-id`."
  [tables worktree-id x]
  (cond
    (map? x)        (scope-query tables worktree-id x)
    (vector? x)     (with-meta (mapv (partial scope-form tables worktree-id) x) (meta x))
    (sequential? x) (with-meta (doall (map (partial scope-form tables worktree-id) x)) (meta x))
    :else           x))

(defn scope-honeysql
  "The Honey SQL `query` scoped to the worktree of this thread, the main app's by default: every reference to a table
  with `worktree_id` reads the rows of that worktree, an update or delete changes only them, and an insert gives its
  rows the worktree. Queries that see every row, and app DBs without worktrees, run as they are."
  [query]
  (if (or (= :all (:type *scope*)) (not (mdb.connection/worktrees-supported?)))
    query
    (scope-form (worktree-tables) (or (worktree-id) default-worktree-id) query)))
