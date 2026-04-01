(ns metabase.mcp.session
  "Lightweight MCP session management.

   An MCP session ID is just a random UUID handed out on `initialize` — no database
   row is created. When a resource read needs an embedding session, we lazily upsert
   a `core_session` row keyed by `hash(mcp-session-id)`, so the same UUID serves as
   both the MCP protocol correlator and the embedding session key."
  (:require
   [metabase.session.core :as session]
   [toucan2.core :as t2])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Lifecycle --------------------------------------------------

(defn create!
  "Create a new MCP session for `user-id`. Returns a UUID string.
   No database row is written — the session is just an opaque correlator until
   a resource read materializes it into a `core_session`."
  [_user-id]
  (str (UUID/randomUUID)))

(defn get-or-create-session-key!
  "Ensure a `core_session` exists for this MCP session and return the session key
   (which is the MCP session UUID itself).

   Uses a raw insert to bypass `:model/Session`'s `after-insert` hook, which would
   otherwise publish spurious `:event/user-login` audit events. The insert is
   guarded by a key_hashed existence check to avoid duplicate rows."
  [session-id user-id]
  (let [key-hashed (session/hash-session-key session-id)]
    (when-not (t2/exists? :core_session :key_hashed key-hashed)
      (let [sid (session/generate-session-id)]
        (try
          (t2/query {:insert-into :core_session
                     :values      [{:id         sid
                                    :user_id    user-id
                                    :key_hashed key-hashed
                                    :created_at :%now}]})
          (catch Exception _
            ;; Another thread/server won the race — that's fine, the row exists.
            nil))))
    ;; The MCP session UUID *is* the session key.
    session-id))

(defn delete!
  "Delete the `core_session` backing this MCP session, if one was ever created."
  [session-id]
  (let [key-hashed (session/hash-session-key session-id)]
    (t2/query {:delete-from :core_session
               :where       [:= :key_hashed key-hashed]})))
