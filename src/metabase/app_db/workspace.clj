(ns metabase.app-db.workspace
  "The workspace that the app DB connections of a thread are in. On Postgres, the `metabase.workspace_id` setting of a
  connection says it: `0` for no workspace, the id of a workspace, or no setting to read the rows of every workspace.
  Row-level security policies on the tables that hold rows of a workspace read it.

  A connection is in no workspace from its check-in until a thread in a workspace checks it out, so a thread in no
  workspace checks out a connection with no extra statement. A thread that changes workspace while it holds a
  connection, as in a transaction, changes nothing at once: each statement that Toucan runs on a held connection first
  puts the connection in the thread's workspace, when it is in another ([[apply-workspace!]]). So a block that runs no
  statement costs nothing.

  This process records the setting of each physical connection. A rollback, to the start of a transaction or to a
  savepoint, undoes a `SET` made after it, so the record of a connection goes when one of its transactions ends."
  (:require
   [methodical.core :as methodical]
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
  "Whether `connection` is a Postgres connection. False for one that can't tell, such as a stub that leaves out
  `isWrapperFor`, or a closed one."
  [^java.sql.Connection connection]
  (try
    (.isWrapperFor connection org.postgresql.jdbc.PgConnection)
    (catch AbstractMethodError _ false)
    (catch java.sql.SQLException _ false)))

(defn- execute! [^java.sql.Connection connection ^String sql]
  (with-open [stmt (.createStatement connection)]
    (.execute stmt sql)))

;; The setting statement each physical Postgres connection last ran, by connection. Weak, so a closed connection goes.
(defonce ^:private ^java.util.Map applied-settings
  (java.util.Collections/synchronizedMap (java.util.WeakHashMap.)))

;; Whether a thread of this process ever worked in a workspace. Until one does, every connection is in none, and a
;; connection whose setting this process has no record of needs no statement.
(defonce ^:private ever-in-a-workspace (atom false))

(defn- physical-connection
  "The physical Postgres connection under `connection`, which a pool may wrap."
  [^java.sql.Connection connection]
  (.unwrap connection org.postgresql.jdbc.PgConnection))

(defn record-setting!
  "Record that the physical Postgres `connection` ran the setting statement `sql`. For the connection pool's hooks."
  [connection sql]
  (.put applied-settings (physical-connection connection) sql))

(defn forget-setting!
  "Forget the setting of the Postgres `connection`, after a rollback may have undone it."
  [connection]
  (.remove applied-settings (physical-connection connection)))

(defn apply-workspace!
  "Put the Postgres `connection` in the workspace of this thread ([[*workspace-id*]]) when it is in another."
  [^java.sql.Connection connection]
  (when (postgres-connection? connection)
    (let [wanted  (setting-sql *workspace-id*)
          applied (.get applied-settings (physical-connection connection))]
      (when (and (not= wanted applied)
                 (or (some? applied) @ever-in-a-workspace (not= wanted no-workspace-sql)))
        (execute! connection wanted)
        (record-setting! connection wanted)))))

;; Each statement Toucan runs on a held connection: put the connection in this thread's workspace first.
(methodical/defmethod t2.conn/do-with-connection :around java.sql.Connection
  [connection f]
  (apply-workspace! connection)
  (next-method connection f))

;; A rollback undoes a `SET`: forget the setting of a connection when one of its transactions, or savepoints, ends.
(methodical/defmethod t2.conn/do-with-transaction :around java.sql.Connection
  [connection options f]
  (try
    (next-method connection options f)
    (finally
      (when (postgres-connection? connection)
        (forget-setting! connection)))))

(defn ever-in-a-workspace?
  "Whether a thread of this process ever worked in a workspace. Until one does, every connection is in none, and this
  process holds no row that a workspace owns."
  []
  @ever-in-a-workspace)

(defn do-with-workspace-id
  "Impl for [[with-workspace-id]]."
  [workspace-id thunk]
  (when (some? workspace-id)
    (reset! ever-in-a-workspace true))
  (binding [*workspace-id* workspace-id]
    (thunk)))

(defmacro with-workspace-id
  "Runs `body` with the app DB connections of this thread in the workspace with `workspace-id`, in none when it is
  nil, or across every workspace when it is `:all`."
  {:style/indent 1}
  [workspace-id & body]
  `(do-with-workspace-id ~workspace-id (^:once fn* [] ~@body)))
