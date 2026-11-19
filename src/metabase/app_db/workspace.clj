(ns metabase.app-db.workspace
  "The workspace that the app DB connections of a thread are in. On Postgres, the `metabase.workspace_id` setting of a
  connection says it: `0` for no workspace, the id of a workspace, or no setting to read the rows of every workspace.
  Row-level security policies on the tables that hold rows of a workspace read it.

  A connection is in no workspace from its check-in until a thread in a workspace checks it out, so a thread in no
  workspace checks out a connection with no extra statement. A thread that changes workspace while it holds a
  connection, as in a transaction, sets the connection's setting, and sets it back after."
  (:require
   [metabase.util.log :as log]
   [toucan2.connection :as t2.conn]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *workspace-id*
  "The workspace that the app DB connections of this thread are in: nil for none, the id of a workspace, or `:all` to
  read the rows of every workspace. Threads that `bound-fn` starts keep it."
  nil)

(defn workspace-id
  "The id of the workspace that this thread works in, or nil in none or across every workspace."
  []
  (when (int? *workspace-id*)
    *workspace-id*))

(defn- setting-sql
  "The statement that puts a Postgres connection in `workspace-id`, as [[*workspace-id*]] takes it."
  [workspace-id]
  (cond
    (nil? workspace-id)      "SET metabase.workspace_id = '0'"
    (= :all workspace-id)    "RESET metabase.workspace_id"
    :else                    (format "SET metabase.workspace_id = '%d'" (long workspace-id))))

(def no-workspace-sql
  "The statement that puts a Postgres app DB connection in no workspace."
  (setting-sql nil))

(def check-in-sql
  "The statement a Postgres app DB connection runs at check-in, off the thread that used it: what `DISCARD ALL` does,
  which can't run with other statements in one, then [[no-workspace-sql]]."
  (str "CLOSE ALL; SET SESSION AUTHORIZATION DEFAULT; RESET ALL; DEALLOCATE ALL; UNLISTEN *; "
       "SELECT pg_advisory_unlock_all(); DISCARD PLANS; DISCARD TEMP; DISCARD SEQUENCES; "
       no-workspace-sql))

(defn checkout-sql
  "The statement a Postgres app DB connection, in no workspace since check-in, runs when this thread checks it out, or
  nil when this thread works in no workspace."
  []
  (when (some? *workspace-id*)
    (setting-sql *workspace-id*)))

(defn postgres-connection?
  "Whether `connection` is a Postgres connection."
  [^java.sql.Connection connection]
  (.isWrapperFor connection org.postgresql.jdbc.PgConnection))

(defn- execute! [^java.sql.Connection connection ^String sql]
  (with-open [stmt (.createStatement connection)]
    (.execute stmt sql)))

(defn- held-postgres-connection
  "The Postgres app DB connection that this thread holds, as in a transaction, or nil."
  ^java.sql.Connection []
  (let [connectable t2.conn/*current-connectable*]
    (when (and (instance? java.sql.Connection connectable)
               (postgres-connection? connectable))
      connectable)))

(defn do-with-workspace-id
  "Impl for [[with-workspace-id]]."
  [workspace-id thunk]
  (let [previous *workspace-id*
        held     (when (not= (setting-sql previous) (setting-sql workspace-id))
                   (held-postgres-connection))]
    (binding [*workspace-id* workspace-id]
      (if-not held
        (thunk)
        (do
          (execute! held (setting-sql workspace-id))
          (try
            (thunk)
            (finally
              ;; In a transaction that failed, Postgres refuses every statement, and the rollback undoes the setting.
              (try
                (execute! held (setting-sql previous))
                (catch java.sql.SQLException e
                  (log/debugf "Could not set the workspace of a held app DB connection back: %s" (ex-message e)))))))))))

(defmacro with-workspace-id
  "Runs `body` with the app DB connections of this thread in the workspace with `workspace-id`, in none when it is
  nil, or across every workspace when it is `:all`."
  {:style/indent 1}
  [workspace-id & body]
  `(do-with-workspace-id ~workspace-id (^:once fn* [] ~@body)))
