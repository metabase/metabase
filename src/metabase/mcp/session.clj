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
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.mcp.models.mcp-query-handle]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.session.core :as session]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.util Base64 UUID)
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

(def ^:private session-payload-version
  "Version for the unsigned JSON client-capability hint encoded in new MCP session ids."
  1)

(def ^:private max-session-id-length
  "Maximum persisted length for `mcp_query_handle.mcp_session_id`."
  254)

(defn- encode-session-payload
  "Encode a small JSON map for the second segment of `Mcp-Session-Id`.

   MCP initialize capabilities are client-advertised hints, not authorization state. We include them in the
   server-created session id so later requests can make the same tools/list decision on any Metabase webserver
   without an in-memory cache or a DB row just for session metadata."
  [payload]
  (-> (json/encode payload)
      (.getBytes StandardCharsets/UTF_8)
      (->> (.encodeToString (.withoutPadding (Base64/getUrlEncoder))))))

(defn- decode-session-payload
  "Decode the optional client-capability hint from an `Mcp-Session-Id`.

   Invalid payloads return nil so the whole session id can be treated as invalid by [[session-parts]]."
  [encoded]
  (when-not (str/blank? encoded)
    (try
      (-> (Base64/getUrlDecoder)
          (.decode ^String encoded)
          (String. StandardCharsets/UTF_8)
          json/decode+kw)
      (catch Exception _
        nil))))

(defn- parse-session-payload
  "Parse the optional base64url JSON capability segment.

   Plain UUID session ids are legacy ids issued before capability-aware tools/list and remain valid. Two-part ids
   with a known payload version must include a supported payload shape so malformed capability hints do not silently
   fall back to legacy behavior. Unknown payload versions remain valid but default to no UI capability, so rolling
   deploy version skew does not invalidate the whole session."
  [payload]
  (cond
    (nil? payload)
    {:extended false}

    (str/blank? payload)
    (do
      (log/warn "MCP session id contains a blank capability payload")
      nil)

    :else
    (if-let [decoded-payload (decode-session-payload payload)]
      (let [payload-map?         (map? decoded-payload)
            payload-version      (when payload-map? (:v decoded-payload))
            has-payload-version? (and payload-map? (contains? decoded-payload :v))
            known-version?       (and (integer? payload-version)
                                      (<= payload-version session-payload-version))
            unknown-version?     (and (integer? payload-version)
                                      (> payload-version session-payload-version))]
        (cond
          (and payload-map?
               known-version?
               (boolean? (:ui decoded-payload)))
          {:extended true
           :payload  decoded-payload}

          ;; During rolling deploys, a newer node may mint a capability payload version this node does not understand.
          ;; The payload is only a capability hint, so keep the session valid but fall back to no MCP Apps UI support.
          (and has-payload-version?
               unknown-version?)
          {:extended true
           :payload  {:ui false}}))
      (log/warn "MCP session id contains an undecodable capability payload"))))

(defn- session-parts
  "Parse an MCP session id into a UUID correlator plus optional client-capability hint.

   New session ids have the form `<uuid>.<base64url-json>`, currently with payload `{\"v\":1,\"ui\":true}`.
   We keep the UUID as the first segment because existing MCP session behavior derives the embedding session key
   from this server-created id, while the JSON segment lets us remember initialize-time UI capability statelessly
   across multiple Metabase webservers."
  [session-id]
  (when (and (string? session-id)
             (<= (count session-id) max-session-id-length))
    (let [[uuid payload :as parts] (str/split session-id #"\." -1)]
      (when (#{1 2} (count parts))
        (when-let [uuid (parse-uuid uuid)]
          (some-> (parse-session-payload payload)
                  (assoc :uuid uuid)))))))

(defn- create-session-id
  "Create a stateless MCP session id containing client capability hints.

   The server creates this id during initialize; clients only echo it back. The unsigned payload is intentionally
   limited to non-security-sensitive capability hints such as whether the client says it can render MCP Apps UI."
  [{:keys [supports-mcp-ui?]}]
  (let [session-id (str (UUID/randomUUID)
                        "."
                        (encode-session-payload {:v  session-payload-version
                                                 :ui (true? supports-mcp-ui?)}))]
    (assert (<= (count session-id) max-session-id-length)
            "MCP session id is too long")
    session-id))

(defn valid-id?
  "Return true if `session-id` has a UUID correlator (the format `create!` produces).
   Format check only — authentication is handled separately by cookie or bearer token,
   not by the session ID itself."
  [session-id]
  (some? (session-parts session-id)))

(defn create!
  "Create a new MCP session. Returns a session id string.
   No database row is written — the session is just an opaque correlator until
   a resource read materializes it into a `core_session`.

   `user-id` is accepted but not persisted: since MCP sessions are currently
   stateless (no server-side token store), we don't validate the user against
   future requests. This parameter exists so we can add durable, user-scoped
   sessions in the future without changing the call-site contract."
  ([user-id]
   (create! user-id nil))
  ([_user-id metadata]
   (create-session-id metadata)))

(defn supports-mcp-ui?
  "Return true if the client advertised MCP Apps UI support during initialize."
  [session-id]
  (when-let [{:keys [payload extended]} (session-parts session-id)]
    (if extended
      (true? (:ui payload))
      ;; Legacy plain UUID sessions were issued before capability-aware tools/list; keep old behavior for them.
      true)))

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
  "Insert a new handle row binding `encoded-query` to the calling user, and return the handle UUID.

   `mcp-session-id` is recorded so DELETE /api/metabase-mcp can sweep the session's handles, and so reads can log
   when a handle is resolved across sessions (see [[find-handle-row]]) — the read path itself is purely
   user-scoped, since handle UUIDs are globally unique.

   `prompt` is optional, but should be supplied for construct_query handles so visualize_query can later
   return both the query and original user prompt to the MCP iframe for feedback submission."
  ([mcp-session-id user-id encoded-query]
   (store-handle! mcp-session-id user-id encoded-query nil))
  ([mcp-session-id user-id encoded-query prompt]
   ;; Materializing a core_session here serves two purposes: its FK is what makes handles
   ;; cascade-delete when the session row is reaped, and its user_id is what find-handle-row
   ;; filters on for cross-session ownership.
   (let [core-session-id (:id (get-or-create-embedding-session! mcp-session-id user-id))
         handle-id       (str (UUID/randomUUID))]
     (t2/insert! :model/McpQueryHandle
                 (cond-> {:id              handle-id
                          :mcp_session_id  mcp-session-id
                          :core_session_id core-session-id
                          :encoded_query   encoded-query}
                   prompt (assoc :prompt prompt)))
     handle-id)))

(defn- find-handle-row
  "Look up the handle row by `handle-id`, scoped to `user-id`.
   Handle ids are globally unique UUIDs, so the join's `WHERE mqh.id = handle-id` returns at most one
   row by definition — no ordering or session-preference logic is needed. `mcp-session-id` is recorded
   on the row only so harnesses that rotate MCP sessions between calls (e.g. ChatGPT) can be logged as
   cross-session resolutions for telemetry."
  [mcp-session-id user-id handle-id]
  (when (and user-id handle-id)
    ;; Single round-trip: join `mcp_query_handle` to `core_session` and filter on
    ;; `core_session.user_id`, so ownership is enforced in the WHERE clause.
    (let [row (t2/select-one :model/McpQueryHandle
                             {:select [:mqh.*]
                              :from   [[:mcp_query_handle :mqh]]
                              :join   [[:core_session :cs] [:= :cs.id :mqh.core_session_id]]
                              :where  [:and
                                       [:= :mqh.id handle-id]
                                       [:= :cs.user_id user-id]]})]
      (when (and row (not= mcp-session-id (:mcp_session_id row)))
        (log/debugf "MCP handle %s resolved across sessions for user %s"
                    handle-id user-id))
      row)))

(defn read-handle
  "Return the encoded query for `handle-id` owned by `user-id`, or nil if no row exists.
   Lookup is user-scoped — see [[find-handle-row]] for how `mcp-session-id` is used."
  [mcp-session-id user-id handle-id]
  (:encoded_query (find-handle-row mcp-session-id user-id handle-id)))

(defn resolve-query-handle
  "Return {:encoded_query ... :prompt ...} for `handle-id` owned by `user-id`, or nil.
   Lookup is user-scoped — see [[find-handle-row]] for how `mcp-session-id` is used."
  [mcp-session-id user-id handle-id]
  (when-let [row (find-handle-row mcp-session-id user-id handle-id)]
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
