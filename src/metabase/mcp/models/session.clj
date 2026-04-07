(ns metabase.mcp.models.session
  "Durable MCP session management. Sessions are stored in the `mcp_session` database table
   so they survive server restarts and work across multiple webservers.

   Each MCP session tracks:
   - The authenticated user
   - Whether the MCP handshake is complete (initialized)
   - An optional embedding session (via FK to `core_session`), reused across resource reads
     within the same MCP session."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.session.core :as session]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.util UUID)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)))

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

(defn- hmac-sha256-hex
  [^String secret ^String message]
  (let [mac (Mac/getInstance "HmacSHA256")]
    (.init mac (SecretKeySpec. (.getBytes secret "UTF-8") "HmacSHA256"))
    (codecs/bytes->hex (.doFinal mac (.getBytes message "UTF-8")))))

(defn- derive-embedding-session-key
  "Deterministically derive the embedding session key for `mcp-session-id` from the
   instance-wide signing secret.

   Why we can't just store a hash like `core_session.key_hashed`: unlike a normal session
   where the client logs in and brings its own key, here the MCP server is minting the
   embedding session *on the client's behalf* and rendering the resulting token into the
   `embed-mcp.html` template (see [[metabase.mcp.resources]]), so that the embedded SDK
   iframe can authenticate back to Metabase. The browser needs the plaintext token, and it
   needs the *same* token on every resource read within one MCP session (so each read
   doesn't mint a fresh `core_session` row). Deriving the token from a stable signing
   secret lets every webserver recompute the same value on demand without any per-session
   plaintext sitting at rest."
  [mcp-session-id]
  (hmac-sha256-hex (mcp.settings/mcp-embedding-signing-secret) mcp-session-id))

(defn- create-embedding-session!
  "Create a `core_session` row for the derived embedding key.
   Uses a raw insert to bypass the `after-insert` hook on `:model/Session`,
   which would otherwise publish spurious `:event/user-login` audit events.
   Returns the new `core_session.id`."
  [user-id session-key]
  (let [session-id (session/generate-session-id)
        key-hashed (session/hash-session-key session-key)]
    (t2/query {:insert-into :core_session
               :values      [{:id         session-id
                              :user_id    user-id
                              :key_hashed key-hashed
                              :created_at :%now}]})
    session-id))

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
  (u/prog1 (str (UUID/randomUUID))
    (t2/insert! :model/McpSession {:id      <>
                                   :user_id user-id})))

(defn delete!
  "Delete an MCP session and its associated embedding session.
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
  "Return the embedding session key for this MCP session, creating the backing
   `core_session` row on first call. Ensures a single embedding session is reused across
   all resource reads within the same MCP session, using an atomic CAS on
   `embedding_session_id` to handle races in multi-server deployments."
  [session-id user-id]
  (let [session-key (derive-embedding-session-key session-id)]
    (when (t2/exists? :model/McpSession :id session-id)
      (or (when (:embedding_session_id (t2/select-one [:model/McpSession :embedding_session_id] :id session-id))
            session-key)
          ;; No row yet — mint one and try to claim the slot.
          (let [emb-id  (create-embedding-session! user-id session-key)
                claimed (pos? (t2/update! :model/McpSession
                                          {:id                   session-id
                                           :embedding_session_id nil}
                                          {:embedding_session_id emb-id}))]
            (when-not claimed
              ;; Lost the race (or session was deleted mid-flight) — drop the orphan.
              (t2/delete! :model/Session :id emb-id))
            session-key)))))
