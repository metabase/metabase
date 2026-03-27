(ns metabase.mcp.session
  "Durable MCP session management. Sessions are stored in the `mcp_session` database table
   so they survive server restarts and work across multiple webservers.

   Each MCP session tracks:
   - The authenticated user
   - Whether the MCP handshake is complete (initialized)
   - An optional embedding session key, reused across resource reads within the same MCP session"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.session.core :as session]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Model -----------------------------------------------------

(methodical/defmethod t2/table-name :model/McpSession [_model] :mcp_session)

(doto :model/McpSession
  (derive :metabase/model))

;;; --------------------------------------------------- Config ----------------------------------------------------

(def ^:private session-ttl-hours
  "MCP sessions expire 1 hour after creation."
  1)

;;; -------------------------------------------- Embedding Sessions -----------------------------------------------

(defn- encrypt-embedding-key
  "Encrypt an embedding session key for storage. Returns the plaintext key when no
   encryption secret is configured."
  [session-key]
  {:pre [(seq session-key)]}
  (encryption/maybe-encrypt session-key))

(defn- decrypt-embedding-key
  "Decrypt an embedding session key read from the database."
  [encrypted-key]
  (when encrypted-key
    (encryption/maybe-decrypt encrypted-key)))

(defn- get-embedding-key
  "Fetch and decrypt the embedding session key for `session-id`, or nil if unset."
  [session-id]
  (some-> (t2/select-one-fn :embedding_session_key [:model/McpSession :embedding_session_key] :id session-id)
          decrypt-embedding-key))

(defn- create-embedding-session!
  "Create a Metabase session for embedding SDK auth.
   Uses a raw insert to bypass the `after-insert` hook on `:model/Session`,
   which would otherwise publish spurious `:event/user-login` audit events.
   Returns `{:session-key <string> :session-id <string>}`."
  [user-id]
  (let [session-key (session/generate-session-key)
        session-id  (session/generate-session-id)
        key-hashed  (session/hash-session-key session-key)]
    (t2/query {:insert-into :core_session
               :values      [{:id         session-id
                              :user_id    user-id
                              :key_hashed key-hashed
                              :created_at :%now}]})
    {:session-key session-key
     :session-id  session-id}))

;;; ------------------------------------------- Cleanup (background task) -------------------------------------------

;; Expired sessions are cleaned up by a background task every 30 minutes
;; (see metabase.mcp.task.session-cleanup). Frequent small deletes are better for the
;; database than a single daily batch: they keep Postgres dead-tuple counts low
;; (autovacuum handles them in routine passes), avoid InnoDB purge lag on MySQL/MariaDB,
;; and prevent any single run from paying the cost of a large batch delete.

(defn- ttl-cutoff
  "Use the current database timestamp to calculate the cutoff, to avoid app-server clock skew."
  []
  (t/minus (:now (t2/query-one {:select [[:%now :now]]})) (t/hours session-ttl-hours)))

(defn sweep-expired!
  "Delete expired MCP sessions and their embedding sessions.
   Snapshots the database time once, then subtracts the TTL to get a cutoff that
   both deletes share — `current_timestamp` is only frozen per-transaction on
   Postgres, not on MySQL or H2, so we can't rely on it being consistent across
   statements.
   Called from the background cleanup task every 30 minutes."
  []
  ;; 0. Use extra db query for this - it must not change between 1 and 2.
  (let [cutoff (ttl-cutoff)]
    (t2/with-transaction [_conn]
      ;; 1. Delete embedding sessions via subquery join on the FK
      (t2/query {:delete-from :core_session
                 :where       [:in :id {:select [:embedding_session_id]
                                        :from   [:mcp_session]
                                        :where  [:and
                                                 [:< :created_at cutoff]
                                                 [:!= :embedding_session_id nil]]}]})
      ;; 2. Delete the expired MCP sessions themselves
      (t2/query {:delete-from :mcp_session
                 :where       [:< :created_at cutoff]}))))

;;; -------------------------------------------------- Lifecycle --------------------------------------------------

(defn create!
  "Create a new MCP session for `user-id`. Returns the session ID (a UUID string).
   Expired sessions are cleaned up by the background task, not inline."
  [user-id]
  (let [session-id (str (UUID/randomUUID))]
    (t2/insert! :model/McpSession {:id      session-id
                                   :user_id user-id})
    session-id))

(defn delete!
  "Delete an MCP session and its associated embedding session.
   Uses the FK to delete the embedding session without decryption.
   Wrapped in a transaction so both rows are removed atomically.
   The mcp_session is deleted before core_session to avoid a
   needless SET NULL cascade on the `embedding_session_id` FK."
  [session-id]
  (t2/with-transaction [_conn]
    (when-let [{:keys [embedding_session_id]} (t2/select-one [:model/McpSession :embedding_session_id] :id session-id)]
      (t2/delete! :model/McpSession :id session-id)
      (when embedding_session_id
        (t2/delete! :model/Session :id embedding_session_id)))))

(defn get-valid
  "Return the MCP session if it exists and hasn't expired, or nil.
   Uses database time for the TTL check."
  [session-id]
  (when-not (str/blank? session-id)
    ;; Extra db query avoids annoying appdb dialect differences for arithmetic, and shares code.
    (let [cutoff (ttl-cutoff)]
      (t2/select-one :model/McpSession {:where [:and
                                                [:= :id session-id]
                                                [:> :created_at cutoff]]}))))

(defn mark-initialized!
  "Record that the client has completed the MCP handshake."
  [session-id]
  (t2/update! :model/McpSession :id session-id {:initialized true}))

(defn get-or-create-embedding-session-key!
  "Return the embedding session key for this MCP session, creating one if needed.
   This ensures a single embedding session is reused across all resource reads
   within the same MCP session. Uses an atomic compare-and-set to avoid races
   in multi-server deployments. The key is stored encrypted at rest, and the
   core_session PK is stored in `embedding_session_id` for efficient join-deletes."
  [session-id user-id]
  (or (get-embedding-key session-id)
      (let [{:keys [session-key]
             emb-id :session-id} (create-embedding-session! user-id)
            encrypted            (encrypt-embedding-key session-key)]
        ;; Atomic CAS: only set the key if no other thread has set it yet
        (t2/query {:update :mcp_session
                   :set    {:embedding_session_key encrypted
                            :embedding_session_id  emb-id}
                   :where  [:and
                            [:= :id session-id]
                            [:= :embedding_session_key nil]]})
        ;; Re-read and decrypt to see which key won
        (u/prog1 (get-embedding-key session-id)
          ;; If another thread won the race, or the session has already been deleted,
          ;; clean up our orphaned embedding session.
          (when (not= session-key <>)
            (t2/delete! :model/Session :id emb-id))))))
