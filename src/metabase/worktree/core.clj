(ns metabase.worktree.core
  "The remote-sync worktree the running request, import or export works in.

  A worktree is a checkout of a git branch whose content lives in the same tables as the main app, tagged with a
  `worktree_id`. Which world a piece of work belongs to is never inferred from who is asking: an endpoint that can
  work inside a worktree declares where its id comes from in its `:worktree` metadata, a pull or a push names the
  worktree it materializes, and both bind it here with [[with-worktree]].

  This namespace has no dependencies so that the code reading it -- the overlay a Field query widens, serialization,
  the models -- can require it outright.")

(def ^:dynamic *worktree-id*
  "The id of the worktree being worked in, or nil for the main app. Bound only by [[with-worktree]]."
  nil)

(defn worktree-id
  "The id of the worktree being worked in; nil is the main app."
  []
  *worktree-id*)

(def ^:dynamic *scope-queries?*
  "Whether the queries Toucan builds are restricted to the world being worked in. Bound only by [[across-worlds]]."
  true)

(defn scope-queries?
  "Whether the queries Toucan builds are restricted to the world being worked in."
  []
  *scope-queries?*)

(defn do-across-worlds
  "Impl for [[across-worlds]]."
  [thunk]
  (binding [*scope-queries?* false]
    (thunk)))

(defmacro across-worlds
  "Execute `body` without restricting what it reads to one world, so it sees the main app's content and every
  branch's. For the code that works out which world something belongs to, and for deleting a worktree."
  [& body]
  `(do-across-worlds (^:once fn* [] ~@body)))

(defn do-with-worktree
  "Impl for [[with-worktree]]."
  [worktree-id thunk]
  (binding [*worktree-id* worktree-id]
    (thunk)))

(defmacro with-worktree
  "Execute `body` in the world `worktree-id` names, or in the main app when it is nil. What the code inside reads
  and writes belongs to that world."
  {:style/indent 1}
  [worktree-id & body]
  `(do-with-worktree ~worktree-id (^:once fn* [] ~@body)))
