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
   (which is the MCP session UUID itself). Auditing is skipped for these sessions."
  [session-id user-id]
  (let [key-hashed (session/hash-session-key session-id)]
    (when-not (t2/exists? :core_session :key_hashed key-hashed)
      ;; Own connection so a failed insert doesn't poison a surrounding transaction (Postgres).
      (t2/with-connection [_conn]
        (try
          ;; Raw insert into :core_session instead of :model/Session to bypass
          ;; the after-insert hook, which would publish spurious :event/user-login events.
          ;; anti_csrf_token is nil — MCP sessions are not cookie-based, so there is no
          ;; cross-site request forgery vector.
          (t2/query {:insert-into :core_session
                     :values      [{:id              (session/generate-session-id)
                                    :user_id         user-id
                                    :key_hashed      key-hashed
                                    :anti_csrf_token nil
                                    :created_at      :%now}]})
          (catch Exception e
            ;; If another thread/server won the race the row now exists — that's fine.
            ;; Any other failure should propagate.
            (when-not (t2/exists? :core_session :key_hashed key-hashed)
              (throw e))))))
    ;; The MCP session UUID *is* the session key.
    session-id))

(defn delete!
  "Delete the `core_session` backing this MCP session, if one was ever created.
   Scoped to `user-id` so that one user cannot delete another user's session."
  [session-id user-id]
  (let [key-hashed (session/hash-session-key session-id)]
    (t2/query {:delete-from :core_session
               :where       [:and
                             [:= :key_hashed key-hashed]
                             [:= :user_id user-id]]})))
