(ns metabase.app-db.worktree
  "Keeps queries over checked-out content inside the world the caller works in.

  A worktree checks a branch's content out into the same tables as the main app, told apart by `worktree_id`.
  Rather than have every caller remember to filter, the queries Toucan builds for a model that derives
  `:hook/worktree-id` are restricted to [[metabase.worktree.core/*worktree-id*]] here: the main app's rows by
  default, and a branch's while an endpoint, an import or an export works inside one.

  Only a query reading the model's own table is restricted -- hand-written Honey SQL that reads from somewhere
  else, or unions several tables, filters itself. [[metabase.worktree.core/across-worlds]] turns the restriction
  off for the code that has to see every world, such as resolving which world an entity belongs to."
  (:require
   [metabase.worktree.core :as worktree]
   [methodical.core :as methodical]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(defn- table-and-alias
  "The table `source` -- one entry of a `:from`, an `:update` or a `:delete-from` -- names, and what to qualify a
  column of it with."
  [source]
  (cond
    (keyword? source)          [source source]
    (not (vector? source))     nil
    (not (keyword? (first source))) nil
    (keyword? (second source)) [(first source) (second source)]
    :else                      [(first source) (first source)]))

(defn- worktree-column
  "The `worktree_id` column to restrict `query` by, or nil when it does not read `model`'s own table."
  [model query]
  (let [sources (or (:from query) (some-> (:update query) vector) (some-> (:delete-from query) vector))]
    (when (= (count sources) 1)
      (when-some [[table alias] (table-and-alias (first sources))]
        (when (= (name table) (name (t2.model/table-name model)))
          (keyword (name alias) "worktree_id"))))))

(defn- scope
  "Restrict `query` to the world being worked in, when it reads `model`'s own table."
  [model query]
  (if-let [column (and (worktree/scope-queries?) (worktree-column model query))]
    (let [clause [:= column (worktree/worktree-id)]]
      (update query :where #(if % [:and % clause] clause)))
    query))

(methodical/defmethod t2.pipeline/build :after [#_query-type :toucan.query-type/select.*
                                                #_model      :hook/worktree-id
                                                #_query      clojure.lang.IPersistentMap]
  "Read the world being worked in."
  [_query-type model _parsed-args query]
  (scope model query))

(def ^:private exists-subquery-path
  "Where an `exists` query holds the select it asks about."
  [:select 0 0 1])

(methodical/defmethod t2.pipeline/build [#_query-type :toucan.query-type/select.exists
                                         #_model      :hook/worktree-id
                                         #_query      clojure.lang.IPersistentMap]
  "Read the world being worked in. An `exists` query ends up as `[:exists <select>]` with nothing left to
  restrict at the top level, so the select it wraps is restricted instead."
  [query-type model parsed-args query]
  (let [built (next-method query-type model parsed-args query)]
    (cond-> built
      (map? (get-in built exists-subquery-path)) (update-in exists-subquery-path #(scope model %)))))

(methodical/defmethod t2.pipeline/build :after [#_query-type :toucan.query-type/update.*
                                                #_model      :hook/worktree-id
                                                #_query      clojure.lang.IPersistentMap]
  "Write only to the world being worked in."
  [_query-type model _parsed-args query]
  (scope model query))

(methodical/defmethod t2.pipeline/build :after [#_query-type :toucan.query-type/delete.*
                                                #_model      :hook/worktree-id
                                                #_query      clojure.lang.IPersistentMap]
  "Delete only from the world being worked in."
  [_query-type model _parsed-args query]
  (scope model query))
