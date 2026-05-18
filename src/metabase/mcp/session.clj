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
   [metabase.app-db.core :as app-db]
   [metabase.mcp.models.mcp-query-handle]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.session.core :as session]
   [toucan2.core :as t2])
  (:import
   (java.nio ByteBuffer)
   (java.util UUID)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Key Derivation -------------------------------------------------

(defn- hmac-sha256
  ^bytes [^String secret ^String message]
  (let [mac (Mac/getInstance "HmacSHA256")]
    (.init mac (SecretKeySpec. (.getBytes secret "UTF-8") "HmacSHA256"))
    (.doFinal mac (.getBytes message "UTF-8"))))

(defn derive-embedding-session-key
  "Deterministically derive the embedding session key for `mcp-session-id` from the
   instance-wide signing secret. See ns docstring for rationale.

   The output is formatted as a UUID string because `metabase.server.middleware.session`
   rejects non-UUID session keys up-front. Specifically we emit a version-8 UUID
   (RFC 9562), which is the version reserved for \"custom / vendor-defined\"
   constructions — i.e. exactly our case: 128 bits produced by our own HMAC-SHA256
   derivation rather than by the standard v1/v3/v4/v5 algorithms. v4 would lie
   about randomness, v5 would lie about the hash algorithm; v8 is the only version
   that's actually honest here.

   Trade-offs to be aware of:
   - Masking the variant (2 bits) and version (4 bits) costs 6 bits of entropy, so
     we end up with 122 bits of randomness — identical to `UUID/randomUUID`, and
     plenty for the ~2^61 birthday bound the rest of the session model already
     relies on.
   - Some older UUID inspection tools predate RFC 9562 and may render v8 as
     \"unknown version\". `java.util.UUID/fromString` and our `valid-uuid?` are
     format-only, so nothing in Metabase breaks.
   - The output is deterministic in `mcp-session-id` and the signing secret. That's
     intentional (so any webserver can recompute it) — don't treat two of these as
     independently random just because they look like UUIDs."
  [mcp-session-id]
  (let [bytes (hmac-sha256 (mcp.settings/unobfuscated-mcp-embedding-signing-secret) mcp-session-id)
        buf   (ByteBuffer/wrap bytes)
        ;; .getLong is stateful: each call consumes 8 bytes and advances the position,
        ;; so `raw-high` reads bytes 0-7 and `raw-low` reads bytes 8-15.
        raw-high (.getLong buf)
        raw-low  (.getLong buf)
        ;; Force RFC 9562 v8 bits: version nibble = 1000, variant = 10.
        high     (bit-or (bit-and raw-high -61441)                ; clear version nibble (bits 12-15 of high)
                         0x0000000000008000)                      ; set version = 8
        low      (bit-or (bit-and raw-low 0x3fffffffffffffff)     ; clear variant (top 2 bits of low)
                         (unchecked-long 0x8000000000000000))]    ; set RFC 4122 variant (10)
    (str (UUID. high low))))

;;; -------------------------------------------------- Lifecycle --------------------------------------------------

(defn valid-id?
  "Return true if `session-id` looks like a UUID (the format `create!` produces).
   Format check only — authentication is handled separately by cookie or bearer token,
   not by the session ID itself."
  [session-id]
  (and (string? session-id)
       (try (UUID/fromString session-id) true
            (catch IllegalArgumentException _ false))))

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

(defn- get-or-create-embedding-session!
  "Materialize and return the `core_session` row backing this MCP session.
   Idempotent — repeated calls collapse to the same row in the common case."
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
        :created_at      :%now}))))

(defn get-or-create-session-key!
  "Ensure a `core_session` exists for this MCP session and return its (plaintext)
   session key, HMAC-derived from the MCP session id."
  [session-id user-id]
  (get-or-create-embedding-session! session-id user-id)
  (derive-embedding-session-key session-id))

(defn owned-by-user?
  "Return true if no `core_session` has been materialized for this session yet
   (i.e. no ownership to violate), or if the existing row belongs to `user-id`."
  [session-id user-id]
  (let [key-hashed (session/hash-session-key (derive-embedding-session-key session-id))
        owner      (t2/select-one-fn :user_id :core_session :key_hashed key-hashed)]
    (or (nil? owner) (= owner user-id))))

;;; -------------------------------------------- Query Handle Store -----------------------------------------------
;; DB-backed store for base64-encoded MBQL query payloads referenced by MCP tool
;; calls. Each row carries a fresh UUID handle that the iframe (drill-through) or
;; agent (construct_query) passes through downstream so the LLM never carries the
;; encoded query.

(defn store-handle!
  "Insert a new handle row binding `encoded-query` to the MCP session, and return
   the freshly minted handle UUID.

   When `user-id` is non-nil, materializes the backing `core_session` so cleanup
   happens via cascade when the session row is reaped. When nil — e.g. agent flows
   that don't render an iframe — the row is stored without a `core_session_id` and
   relies on explicit `delete!` for cleanup.

   `prompt` is optional, but should be supplied for construct_query handles so
   visualize_query can later return both the query and original user prompt to
   the MCP iframe for feedback submission."
  ([session-id user-id encoded-query]
   (store-handle! session-id user-id encoded-query nil))
  ([session-id user-id encoded-query prompt]
   (let [core-session-id (when user-id
                           (:id (get-or-create-embedding-session! session-id user-id)))
         handle-id       (str (UUID/randomUUID))]
     (t2/insert! :model/McpQueryHandle
                 (cond-> {:id              handle-id
                          :mcp_session_id  session-id
                          :core_session_id core-session-id
                          :encoded_query   encoded-query}
                   prompt (assoc :prompt prompt)))
     handle-id)))

(defn read-handle
  "Return the encoded query for `handle-id` in `session-id`, or nil if no row exists."
  [session-id handle-id]
  (t2/select-one-fn :encoded_query :model/McpQueryHandle :id handle-id, :mcp_session_id session-id))

(defn resolve-query-handle
  "Return {:encoded_query ... :prompt ...} for `handle-id`, or nil if not found.
   Used by visualize_query and execute_query to resolve construct_query handles."
  [session-id handle-id]
  (when-let [row (t2/select-one :model/McpQueryHandle :id handle-id, :mcp_session_id session-id)]
    (select-keys row [:encoded_query :prompt])))

(defn delete!
  "Delete the `core_session` backing this MCP session (if one was ever created)
   and any associated query handles. Scoped to `user-id` so that one user cannot
   delete another user's session.

   Handles tied to a `core_session` are also reaped by the FK cascade when the
   session row goes; the explicit handle-delete here covers handles whose
   `core_session_id` was never set — e.g. handles for regular query payloads that
   aren't backed by an MCP iframe and so never materialize a `core_session`."
  [session-id user-id]
  (let [key-hashed (session/hash-session-key (derive-embedding-session-key session-id))]
    (t2/query {:delete-from :core_session
               :where       [:and
                             [:= :key_hashed key-hashed]
                             [:= :user_id user-id]]})
    (t2/delete! :model/McpQueryHandle :mcp_session_id session-id)))
