(ns metabase.mcp.session
  "Lightweight MCP session management.

   An MCP session ID is just a random UUID handed out on `initialize` — no database
   row is created. When a resource read needs an embedding session, we HMAC-derive a
   separate session key from an instance-wide signing secret and lazily upsert a
   `core_session` row keyed by its hash.

   The derivation (rather than using the MCP session id directly as the session key)
   is so that the id we put on the wire in the `Mcp-Session-Id` header is *not* itself
   a live embedding session secret: capturing the header should not be enough to
   impersonate the embedded SDK iframe. Any webserver can recompute the same derived
   key on demand without any per-session plaintext sitting at rest.

   MCP sessions themselves do not expire. The underlying `core_session` row has
   its own TTL and will be reaped independently; if a subsequent resource read
   finds it missing, `get-or-create-session-key!` will re-insert it."
  (:require
   [buddy.core.codecs :as codecs]
   [metabase.app-db.core :as app-db]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.session.core :as session]
   [toucan2.core :as t2])
  (:import
   (java.util UUID)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Key Derivation -------------------------------------------------

(defn- hmac-sha256-hex
  [^String secret ^String message]
  (let [mac (Mac/getInstance "HmacSHA256")]
    (.init mac (SecretKeySpec. (.getBytes secret "UTF-8") "HmacSHA256"))
    (codecs/bytes->hex (.doFinal mac (.getBytes message "UTF-8")))))

(defn derive-embedding-session-key
  "Deterministically derive the embedding session key for `mcp-session-id` from the
   instance-wide signing secret. See ns docstring for rationale."
  [mcp-session-id]
  (hmac-sha256-hex (mcp.settings/mcp-embedding-signing-secret) mcp-session-id))

;;; -------------------------------------------------- Lifecycle --------------------------------------------------

(defn create!
  "Create a new MCP session. Returns a UUID string.
   No database row is written — the session is just an opaque correlator until
   a resource read materializes it into a `core_session`.

   `user-id` is accepted but not persisted: since MCP sessions are currently
   stateless (no server-side token store), we don't validate the user against
   future requests. This parameter exists so we can add durable, user-scoped
   sessions in the future without changing the call-site contract."
  [_user-id]
  (str (UUID/randomUUID)))

(defn get-or-create-session-key!
  "Ensure a `core_session` exists for this MCP session and return its (plaintext)
   session key, HMAC-derived from the MCP session id. Auditing is skipped for these
   sessions."
  [session-id user-id]
  (let [session-key (derive-embedding-session-key session-id)
        key-hashed  (session/hash-session-key session-key)]
    ;; Scoped to (key_hashed, user_id) so same-user races collapse to one row in the
    ;; common case. A concurrent race can still produce duplicates (no DB constraint;
    ;; see `select-or-insert!` docstring) but they're harmless — both rows belong to
    ;; the right user, both satisfy lookups, both TTL-reap.
    ;;
    ;; Do NOT add a unique constraint to "fix" this. On key_hashed alone, a cross-user
    ;; UUID collision would silently hand user B's row to user A. On (user_id,
    ;; key_hashed), downstream auth lookups by key_hashed alone would pick one of the
    ;; colliding rows arbitrarily. Cross-user UUID collisions are an unaddressed risk
    ;; across the whole session model (cookie sessions included) — it belongs in the
    ;; auth layer, not here, and no constraint shape at this call site can fix it.
    ;;
    ;; Raw :core_session (not :model/Session) to bypass the after-insert hook, which
    ;; would publish spurious :event/user-login events.
    (app-db/select-or-insert!
     :core_session
     {:key_hashed key-hashed
      :user_id    user-id}
     (fn []
       {:id              (session/generate-session-id)
        :anti_csrf_token nil
        :created_at      :%now}))
    session-key))

(defn owned-by-user?
  "Return true if no `core_session` has been materialized for this session yet
   (i.e. no ownership to violate), or if the existing row belongs to `user-id`."
  [session-id user-id]
  (let [key-hashed (session/hash-session-key (derive-embedding-session-key session-id))
        owner      (t2/select-one-fn :user_id :core_session :key_hashed key-hashed)]
    (or (nil? owner) (= owner user-id))))

(defn delete!
  "Delete the `core_session` backing this MCP session, if one was ever created.
   Scoped to `user-id` so that one user cannot delete another user's session."
  [session-id user-id]
  (let [key-hashed (session/hash-session-key (derive-embedding-session-key session-id))]
    (t2/query {:delete-from :core_session
               :where       [:and
                             [:= :key_hashed key-hashed]
                             [:= :user_id user-id]]})))
