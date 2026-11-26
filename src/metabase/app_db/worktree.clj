(ns metabase.app-db.worktree
  "The remote sync worktree a thread works in, whose id the app DB rows it inserts through a model carry in
  `worktree_id`."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.config.core :as config]
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

(def ^:private view-substitutions
  "The views a query in a worktree other than the default one reads in place of the Table and Field tables, which
  overlay them with the worktree's user settings."
  {:metabase_table :v_worktree_table
   :metabase_field :v_worktree_field})

(mu/defn- row-filters :- [:map-of :keyword ::funnysql.schema/sandbox.row-filter]
  "A filter on `worktree_id` keeping the rows of the worktree with `worktree-id` for each of `tables`."
  [tables      :- [:sequential :keyword]
   worktree-id :- pos-int?]
  (into {} (map (fn [table] [table {:column :worktree_id :value worktree-id}])) tables))

(mu/defn- main-options :- ::funnysql.schema/sandbox.options
  "The options that keep a query to the rows of the main app, which reads the stored Table and Field rows."
  []
  {:row-filters (row-filters (vec @worktree-tables) default-worktree-id)})

(mu/defn- worktree-options :- ::funnysql.schema/sandbox.options
  "The options that keep a query to the rows of the worktree with `worktree-id`, reading Tables and Fields through the
  views that overlay them with its user settings."
  [worktree-id :- pos-int?]
  {:table-substitutions view-substitutions
   :row-filters         (row-filters (into (vec @worktree-tables) (vals view-substitutions)) worktree-id)})

(mu/defn sandbox-worktree-query :- ::funnysql.schema/query
  "`query` kept to the rows of the worktree this thread works in, or as it is across every worktree, which outside
  production still goes through the sandbox with no options so every query keeps to its restrictions."
  [query :- ::funnysql.schema/query]
  (case (if @worktree-tables (:type *scope*) :all)
    :all      (if config/is-prod? query (funnysql/sandbox-query (mdb.connection/db-type) query {}))
    :main     (funnysql/sandbox-query (mdb.connection/db-type) query (main-options))
    :worktree (funnysql/sandbox-query (mdb.connection/db-type) query (worktree-options (:worktree-id *scope*)))))
