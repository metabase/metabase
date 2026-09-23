(ns metabase.app-db.worktree
  "The remote-sync worktree the running request, import or export works in, and keeping the queries over checked-out
  content inside it.

  A worktree checks a branch's content out into the same tables as the main app, told apart by `worktree_id`. Which
  worktree a piece of work belongs to is never inferred from what it touches: a request takes it from the user it is
  made as, and a pull or a push names the worktree it materializes.

  Rather than have every caller remember to filter, every query Toucan builds over a table a worktree checks content
  out into -- named by a model deriving `:hook/worktree-id`, by the table itself, or in a common table expression --
  is restricted to [[*worktree-id*]] here: the main app's rows by default, and a branch's while a request, an import
  or an export works inside one.

  A query that joins one of those tables is restricted for it too, in the condition it is joined on, and a query
  built out of other queries -- a union, a subselect, a common table expression, the select a condition compares
  against -- is restricted for each of them.
  [[without-worktree-scoping]] lifts the restriction for the code that has to see every worktree at once, such as
  working out which one an entity is in."
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(def ^:dynamic *worktree-id*
  "The id of the worktree being worked in, or nil for the main app. Bound only by [[with-worktree]]."
  nil)

(defn worktree-id
  "The id of the worktree being worked in; nil is the main app."
  []
  *worktree-id*)

(defn do-with-worktree
  "Impl for [[with-worktree]]."
  [worktree-id thunk]
  (binding [*worktree-id* worktree-id]
    (thunk)))

(defmacro with-worktree
  "Execute `body` in the worktree `worktree-id` names, or in the main app when it is nil. What the code inside reads
  and writes belongs to that worktree."
  {:style/indent 1}
  [worktree-id & body]
  `(do-with-worktree ~worktree-id (^:once fn* [] ~@body)))

(def ^:dynamic *worktree-scoping*
  "Whether the queries Toucan builds are restricted to the worktree being worked in. Bound only by
  [[without-worktree-scoping]]."
  true)

(defn do-without-worktree-scoping
  "Impl for [[without-worktree-scoping]]."
  [thunk]
  (binding [*worktree-scoping* false]
    (thunk)))

(defmacro without-worktree-scoping
  "Execute `body` without restricting what it reads to one worktree, so it sees the main app's content and every
  branch's. For the code that works out which worktree something is in, and for deleting a worktree."
  [& body]
  `(do-without-worktree-scoping (^:once fn* [] ~@body)))

(let [cache (atom nil)]
  (defn- checked-out-tables
    "The names of the tables a worktree checks content out into, by the models deriving `:hook/worktree-id`."
    []
    (let [models            (descendants :hook/worktree-id)
          [cached-for cached] @cache]
      (if (identical? models cached-for)
        cached
        (let [tables (into #{} (map (comp name t2.model/table-name)) models)]
          (reset! cache [models tables])
          tables)))))

(defn- table-and-alias
  "The table `source` -- one entry of a `:from`, an `:update` or a `:delete-from` -- names, and what to qualify a
  column of it with."
  [source]
  (cond
    (keyword? source)               [source source]
    (not (vector? source))          nil
    (not (keyword? (first source))) nil
    (keyword? (second source))      [(first source) (second source)]
    :else                           [(first source) (first source)]))

(defn- sources
  "The tables `query` reads or writes, as a sequence. Honey SQL takes a lone table on its own or in a vector."
  [query]
  (let [clause (or (:from query) (:update query) (:delete-from query))]
    (if (sequential? clause) clause [clause])))

(defn- worktree-column
  "The `worktree_id` column to restrict `query` by, or nil when it does not read a table a worktree checks content
  out into."
  [query]
  (let [sources (sources query)]
    (when (= (count sources) 1)
      (when-some [[table alias] (table-and-alias (first sources))]
        (when (contains? (checked-out-tables) (name table))
          (u/qualified-key alias :worktree_id))))))

(declare scope-query)

(defn- keeping-meta
  "`form` rebuilt as `rebuilt`, carrying the metadata Honey SQL and the app-DB guard read off it."
  [rebuilt form]
  (cond-> rebuilt
    (meta form) (with-meta (meta form))))

(defn- scope-queries
  "Restrict each query map of `queries`, leaving anything else alone."
  [queries]
  (keeping-meta (mapv #(cond-> % (map? %) scope-query) queries) queries))

(defn- scope-ctes
  "Restrict each common table expression of `ctes` that reads a checked-out table."
  [ctes]
  (keeping-meta (mapv (fn [cte]
                        (if (and (vector? cte) (map? (second cte)))
                          (assoc cte 1 (scope-query (second cte)))
                          cte))
                      ctes)
                ctes))

(defn- scope-subqueries
  "Restrict each query `sources` selects from rather than names, such as the arms of a union a listing builds."
  [sources]
  (cond
    (map? sources)        (scope-query sources)
    (sequential? sources) (keeping-meta (mapv (fn [source]
                                                (cond
                                                  (map? source)               (scope-query source)
                                                  (and (vector? source)
                                                       (map? (first source))) (assoc source 0 (scope-query (first source)))
                                                  :else                       source))
                                              sources)
                                        sources)
    :else                 sources))

(def ^:private join-clauses
  "The keys under which a query holds the tables it joins, each as a table and the condition it is joined on."
  [:join :left-join :right-join :inner-join :full-join])

(defn- scope-joins
  "Restrict each checked-out table `joins` joins in, in the condition it is joined on -- a left join keeps the rows
  that match nothing, which a condition in the `:where` would drop."
  [joins]
  (keeping-meta
   (into []
         (comp (partition-all 2)
               (mapcat (fn [[source condition :as pair]]
                         (if-some [[table alias] (and (= (count pair) 2) (table-and-alias source))]
                           (if (contains? (checked-out-tables) (name table))
                             [source [:and condition [:= (u/qualified-key alias :worktree_id) *worktree-id*]]]
                             pair)
                           pair))))
         joins)
   joins))

(def ^:private set-operations
  "The keys under which a query holds the queries it combines."
  [:union :union-all :intersect :except])

(defn- query-map?
  "Whether `x` is a query in its own right rather than some other Honey SQL map."
  [x]
  (and (map? x)
       (boolean (or (:select x) (:select-distinct x) (:union x) (:union-all x)))))

(defn- scope-nested
  "Restrict every query nested anywhere in `form`, such as the subselect a condition compares against."
  [form]
  (cond
    (query-map? form) (scope-query form)
    (vector? form)    (keeping-meta (mapv scope-nested form) form)
    :else             form))

(defn- scope-query
  "Restrict `query` to the worktree being worked in: the table it reads, the tables it joins, and every query it is
  built out of -- the ones it selects from, the ones it combines, the common table expressions it defines, and the
  ones its conditions compare against."
  [query]
  (as-> query query
    (if-let [column (worktree-column query)]
      (let [clause [:= column *worktree-id*]]
        (update query :where #(if % [:and % clause] clause)))
      query)
    (cond-> query
      (sequential? (:with query))           (update :with scope-ctes)
      (sequential? (:with-recursive query)) (update :with-recursive scope-ctes)
      (some? (:from query))                 (update :from scope-subqueries)
      (some? (:where query))                (update :where scope-nested)
      (some? (:having query))               (update :having scope-nested))
    (reduce (fn [query k]
              (cond-> query
                (sequential? (get query k)) (update k scope-joins)))
            query
            join-clauses)
    (reduce (fn [query k]
              (cond-> query
                (sequential? (get query k)) (update k scope-queries)))
            query
            set-operations)))

(defn scope
  "Restrict `query` to the worktree being worked in, or return it as it is when it is not a query map or nothing is
  being restricted."
  [query]
  (cond-> query
    (and *worktree-scoping* (map? query)) scope-query))

(methodical/defmethod t2.pipeline/build :after :default
  "Read and write only the worktree being worked in."
  [_query-type _model _parsed-args query]
  (scope query))

(def ^:private exists-subquery-path
  "Where an `exists` query holds the select it asks about."
  [:select 0 0 1])

(methodical/defmethod t2.pipeline/build :after [#_query-type :toucan.query-type/select.exists
                                                #_model      :default
                                                #_query      clojure.lang.IPersistentMap]
  "An `exists` query ends up as `[:exists <select>]` with nothing left to restrict at the top level, so the select
  it wraps is restricted instead."
  [_query-type _model _parsed-args query]
  (cond-> query
    (and *worktree-scoping* (map? (get-in query exists-subquery-path)))
    (update-in exists-subquery-path scope-query)))
