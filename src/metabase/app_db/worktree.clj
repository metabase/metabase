(ns metabase.app-db.worktree
  "The remote sync worktree the app DB connections of a thread see. On Postgres, row-level security shows a connection
  only the rows of the worktree its `metabase.worktree_id` setting names, `0` for the main app, or every row when the
  setting is empty or unset."
  (:import
   (java.sql Connection PreparedStatement)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *worktree-id*
  "The id of the worktree the app DB connections of this thread see, nil for the main app, or `:all` for every
  worktree."
  nil)

(defn worktree-id
  "The id of the worktree this thread works in, or nil in the main app or across every worktree."
  []
  (when (int? *worktree-id*)
    *worktree-id*))

(defn do-with-worktree-id
  "Impl for [[with-worktree-id]]."
  [worktree-id thunk]
  (binding [*worktree-id* worktree-id]
    (thunk)))

(defmacro with-worktree-id
  "Runs `body` with the app DB connections it gets seeing the worktree with `worktree-id`, nil for the main app, or
  `:all` for every worktree."
  {:style/indent 1}
  [worktree-id & body]
  `(do-with-worktree-id ~worktree-id (^:once fn* [] ~@body)))

(defn configure-connection!
  "Sets the worktree setting of `conn`, a Postgres app DB connection just checked out, to the worktree of this thread.
  The pool runs `DISCARD ALL` on check-in, which empties the setting, so it is set on every checkout but for `:all`."
  [^Connection conn]
  (when-not (= :all *worktree-id*)
    (with-open [^PreparedStatement stmt (.prepareStatement conn "SELECT set_config('metabase.worktree_id', ?, false)")]
      (.setString stmt 1 (str (or *worktree-id* 0)))
      (.execute stmt)))
  conn)
