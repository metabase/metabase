(ns metabase.app-db.worktree
  "Restricts every app-DB select to the remote-sync worktree the caller is in.

  Content a worktree checked out lives in the same tables as the main app, tagged with a `worktree_id`. A row
  belongs to exactly one world -- the main app (`nil`) or one worktree -- and is only ever read from that world,
  so rather than every query saying so, this adds the restriction to the query as it is built: to the table the
  query reads from, and to every worktree-scoped table it joins.

  Queries naming a raw table are restricted too, not just those naming a model: plenty of code reads a table
  through `t2/table-name` or a bare keyword, and a restriction that only covered models would be one rename away
  from a leak. A custom migration runs against whatever shape the schema had at the time -- often before the
  column existed -- so [[without-scope]] turns this off for the duration of one."
  (:require
   [clojure.walk :as walk]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(def ^:dynamic *scope?*
  "Whether to restrict queries to the caller's worktree. Bound to false by [[without-scope]]."
  true)

(defmacro without-scope
  "Run `body` without the worktree restriction: the queries inside see every worktree's rows and the main app's.
  For reads of content that is the instance's rather than a branch's -- the Trash, a user's personal collection --
  and for code that has to see a table whole, such as a custom migration, which may even predate the column."
  {:style/indent 0}
  [& body]
  `(binding [*scope?* false]
     ~@body))

(defn- current-worktree-id
  "The worktree the caller is working inside, or nil for the main app. Resolved lazily: this namespace sits below
  `metabase.api.common` in the load order."
  []
  #_{:clj-kondo/ignore [:metabase/modules]}
  @(requiring-resolve 'metabase.api.common/*worktree-id*))

(defn- scoped-tables
  "The tables of every model deriving `:hook/worktree-id`, i.e. the ones carrying a `worktree_id` column."
  []
  (into #{} (keep #(when (keyword? %) (t2/table-name %))) (descendants :hook/worktree-id)))

(defn- scope-condition
  "The restriction on one table, with the worktree id inlined rather than parameterized: the condition is added to
  queries that are already built, and on H2 a CTE's parameters bind by position, so adding one shifts the rest."
  [source]
  (let [column (u/qualified-key source :worktree_id)]
    (if-let [worktree-id (current-worktree-id)]
      [:= column [:inline worktree-id]]
      [:= column nil])))

(defn- table+alias
  "The table a `:from` entry or join target names, and the name its columns are qualified by. Nil for a subquery."
  [target]
  (let [[table alias] (if (sequential? target) [(first target) (second target)] [target nil])]
    (when (keyword? table)
      [table (or alias table)])))

(def ^:private join-clauses
  "The honey SQL keys whose value is a flat sequence of join target and condition. `:cross-join` is absent: it
  names targets without conditions, so it has nowhere to carry a restriction -- see [[check-no-scoped-cross-join]]."
  [:join :left-join :right-join :inner-join :full-join])

(defn- and-condition
  [existing condition]
  (if existing [:and existing condition] condition))

(defn- clause-targets
  "The targets a clause names, as a sequence: honey SQL takes either one target or a sequence of them."
  [clause]
  (if (sequential? clause) clause [clause]))

(defn- query-target
  "What the query reads from or writes to: the `:from` of a select, the `:update` of an update, the `:delete-from`
  of a delete."
  [query]
  (some-> (or (first (clause-targets (:from query)))
              (:update query)
              (first (clause-targets (:delete-from query))))
          table+alias))

(defn- scope-target
  "Restrict the table a query reads from or writes to, in its `:where`. On an update or a delete this is what keeps
  a write from reaching across worlds: it simply matches no rows."
  [query scoped]
  (if-let [[table alias] (query-target query)]
    (cond-> query
      (contains? scoped table) (update :where and-condition (scope-condition alias)))
    query))

(defn- scope-join
  "Restrict one joined table, in its `ON` clause. It belongs there rather than in the `:where`: in the `:where` it
  would turn a LEFT JOIN into an inner one and drop the rows it is there to widen -- which is how a Field with no
  user values of its own in this worktree still reads back."
  [[target condition] scoped]
  (let [[table alias] (table+alias target)]
    [target (cond-> condition
              (and table (contains? scoped table)) (and-condition (scope-condition alias)))]))

(defn- scope-joins
  [joins scoped]
  (into [] (comp (partition-all 2) (mapcat #(scope-join % scoped))) joins))

(defn- check-no-scoped-cross-join
  "Refuse a cross join onto a worktree-scoped table. A cross join carries no condition, so there is nowhere to put
  the restriction, and letting one through would read every worktree's rows. Rewrite it as a join with an ON
  clause, or read the table separately."
  [query scoped]
  (doseq [target (clause-targets (:cross-join query))
          :let   [[table _] (table+alias target)]
          :when  (and table (contains? scoped table))]
    (throw (ex-info "Cannot cross join a worktree-scoped table: it has no ON clause to restrict it to the caller's worktree."
                    {:table table})))
  query)

(defn- scope-query
  "Restrict one honey SQL select: the table it reads from, and every worktree-scoped table it joins."
  [query scoped]
  (reduce (fn [query clause]
            (cond-> query
              (clause query) (update clause scope-joins scoped)))
          (-> query
              (check-no-scoped-cross-join scoped)
              (scope-target scoped))
          join-clauses))

(defn- query-map?
  "Whether `x` is a select this should restrict: any map naming a table to read from or join."
  [x]
  (and (map? x)
       (or (:from x) (:update x) (:delete-from x) (:cross-join x) (some x join-clauses))))

(defn scope-all
  "Restrict every select down the query tree of `query`: `exists?` wraps the real query in `[:exists {...}]`, and a
  subquery or CTE reads a table just as directly as the query around it."
  [query]
  (if-not *scope?*
    query
    (let [scoped (scoped-tables)]
      (walk/postwalk (fn [x] (cond-> x (query-map? x) (scope-query scoped))) query))))

(methodical/defmethod t2.pipeline/build :after [#_query-type :default
                                                #_model      :default
                                                #_query      clojure.lang.IPersistentMap]
  [_query-type _model _parsed-args query]
  (scope-all query))
