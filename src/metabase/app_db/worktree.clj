(ns metabase.app-db.worktree
  "The remote sync worktree the app DB connections of a thread see. On Postgres, row-level security shows a connection
  only the rows of the worktree its `metabase.worktree_id` setting names, `0` for the main app, or every row when the
  setting is empty or unset."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::scope
  "The rows the app DB connections of a thread see: the main app's, a worktree's, or every row."
  [:multi {:dispatch :type}
   [:main     [:map {:closed true} [:type [:= :main]]]]
   [:worktree [:map {:closed true} [:type [:= :worktree]] [:worktree-id pos-int?]]]
   [:all      [:map {:closed true} [:type [:= :all]]]]])

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *scope*
  "The rows the app DB connections of this thread see, a [[::scope]]."
  {:type :main})

(defn worktree-id
  "The id of the worktree this thread works in, or nil in the main app or across every worktree."
  []
  (when (= :worktree (:type *scope*))
    (:worktree-id *scope*)))

(defn worktree-scope
  "The scope of the worktree with `worktree-id`, or of the main app when it is nil."
  [worktree-id]
  (if worktree-id
    {:type :worktree, :worktree-id worktree-id}
    {:type :main}))

(mu/defn do-with-worktree-scope
  "Impl for [[with-worktree-scope]]."
  [scope :- ::scope
   thunk :- ifn?]
  (binding [*scope* scope]
    (thunk)))

(defmacro with-worktree-scope
  "Runs `body` with the app DB connections it gets seeing the rows of `scope`, a [[::scope]]: `{:type :main}`,
  `{:type :worktree :worktree-id id}` or `{:type :all}`."
  {:style/indent 1}
  [scope & body]
  `(do-with-worktree-scope ~scope (^:once fn* [] ~@body)))

(def main-app-sql
  "The statement that puts a Postgres app DB connection in the main app."
  "SET metabase.worktree_id = '0';")

(def check-in-sql
  "The statement a Postgres app DB connection runs at check-in, off the thread that used it: what `DISCARD ALL` does,
  which can't run with other statements in one, then [[main-app-sql]]."
  (str "CLOSE ALL; SET SESSION AUTHORIZATION DEFAULT; RESET ALL; DEALLOCATE ALL; UNLISTEN *; "
       "SELECT pg_advisory_unlock_all(); DISCARD PLANS; DISCARD TEMP; DISCARD SEQUENCES; "
       main-app-sql))

(defn checkout-sql
  "The statement a Postgres app DB connection, in the main app since check-in, runs when this thread checks it out, or
  nil when this thread works in the main app."
  []
  (case (:type *scope*)
    :main     nil
    :worktree (format "SET metabase.worktree_id = '%d';" (long (:worktree-id *scope*)))
    :all      "RESET metabase.worktree_id;"))
