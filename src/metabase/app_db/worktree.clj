(ns metabase.app-db.worktree
  "The remote sync worktree a thread works in, whose id the app DB rows it inserts through a model carry in
  `worktree_id`."
  (:require
   [metabase.funnysql.core :as funnysql]
   [metabase.funnysql.schema :as funnysql.schema]
   [metabase.models.resolution :as models.resolution]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def default-worktree-id
  "The id of the default worktree, the row the migration creates and every worktree_id column defaults to."
  1)

(mr/def ::scope
  "The remote sync worktree a thread works in: the main app, the default worktree, another worktree, or every worktree
  when none but the default one exists."
  [:multi {:dispatch :type}
   [:main     [:map {:closed true} [:type [:= :main]]]]
   [:worktree [:map {:closed true} [:type [:= :worktree]] [:worktree-id pos-int?]]]
   [:all      [:map {:closed true} [:type [:= :all]]]]])

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *scope*
  "The remote sync worktree this thread works in, a [[::scope]]."
  {:type :main})

(defn worktree-scope
  "The [[::scope]] this thread works in."
  []
  *scope*)

(mu/defn do-with-worktree-scope
  "Impl for [[with-worktree-scope]]."
  [scope :- ::scope
   thunk :- ifn?]
  (binding [*scope* scope]
    (thunk)))

(defmacro with-worktree-scope
  "Runs `body` in `scope`, a [[::scope]]: `{:type :main}`, `{:type :worktree :worktree-id id}` or `{:type :all}`."
  {:style/indent 1}
  [scope & body]
  `(do-with-worktree-scope ~scope (^:once fn* [] ~@body)))

(def ^:private worktree-tables
  "The tables of the models with `:hook/worktree-id`, nil until [[init-worktree-tables!]] has loaded every model."
  (atom nil))

(defn init-worktree-tables!
  "Load every model and record the tables of those with `:hook/worktree-id`, which the sandbox keeps to a worktree."
  []
  (models.resolution/load-all-models!)
  (reset! worktree-tables (into (sorted-set)
                                (comp (filter #(= "model" (namespace %)))
                                      (map t2/table-name))
                                (descendants :hook/worktree-id))))

(mu/defn- sandbox-options :- ::funnysql.schema/sandbox.options
  "The options that keep a query to the rows of the worktree with `worktree-id`."
  [worktree-id :- pos-int?]
  {:row-filters (into {}
                      (map (fn [table] [table {:column :worktree_id :value worktree-id}]))
                      @worktree-tables)})

(mu/defn sandbox-worktree-query :- ::funnysql.schema/query
  "`query` kept to the rows of the worktree this thread works in, or as it is across every worktree."
  [query :- ::funnysql.schema/query]
  (case (if @worktree-tables (:type *scope*) :all)
    :all      query
    :main     (funnysql/sandbox-query query (sandbox-options default-worktree-id))
    :worktree (funnysql/sandbox-query query (sandbox-options (:worktree-id *scope*)))))
