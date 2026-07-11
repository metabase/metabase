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
   [java-time.api :as t]
   [metabase.app-db.core :as app-db]
   [metabase.mcp.models.mcp-query-handle]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.session.core :as session]
   [metabase.util :as u]
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
;; DB-backed, user-scoped, TTL'd store for MBQL query payloads referenced by MCP tool calls and the
;; embedding iframe. The model carries only the opaque handle UUID; the query itself lives here so the
;; LLM never has to hold it. The store is content-addressed: the handle UUID is a deterministic hash of
;; (user, query), so an iteration loop that re-stores the same query reuses one row rather than piling
;; up a row per attempt.
;;
;; Rows hold plain JSON. Payloads arriving as base64 (the shape the agent-api construct endpoints still
;; emit) are decoded on write; reads hand the query back in the base64 shape those callers expect and
;; decode any pre-migration base64 row on the fly. Both conversions fall away once the agent-api
;; boundary speaks JSON directly.

(defn- json-payload?
  "True if `payload` is JSON rather than base64. A serialized MBQL query is a JSON object, so it starts
   with `{`; base64 never does."
  [payload]
  (str/starts-with? (str/triml payload) "{"))

(defn- ->stored-json
  "Normalize a query payload to the JSON text stored in a handle row."
  [payload]
  (if (json-payload? payload)
    payload
    (u/decode-base64 payload)))

(defn- stored->base64
  "Return a stored query payload as base64, the shape handle callers hand to the agent-api and iframe.
   Pre-migration rows already hold base64 and pass through unchanged."
  [payload]
  (if (json-payload? payload)
    (u/encode-base64 payload)
    payload))

(defn- content-addressed-handle-id
  "Deterministic handle UUID for a (`user-id`, `query-json`) pair."
  ^String [user-id query-json]
  (str (UUID/nameUUIDFromBytes
        (.getBytes (str user-id " " query-json) StandardCharsets/UTF_8))))

(defn- handle-expires-at
  []
  (t/plus (t/offset-date-time) (t/days (mcp.settings/mcp-query-handle-ttl-days))))

(defn store-handle!
  "Store `encoded-query` for `user-id` and return the handle UUID.

   Content-addressed: storing the same query twice for the same user yields the same handle and a single
   row. The handle expires after [[metabase.mcp.settings/mcp-query-handle-ttl-days]].

   `mcp-session-id` is recorded so `DELETE /api/metabase-mcp` can sweep a session's handles; it does not
   scope the lookup (reads are purely user-scoped). `prompt` is optional but should be supplied for
   construct_query handles so visualize_query can return the original prompt to the MCP iframe."
  ([mcp-session-id user-id encoded-query]
   (store-handle! mcp-session-id user-id encoded-query nil))
  ([mcp-session-id user-id encoded-query prompt]
   (let [query-json (->stored-json encoded-query)
         handle-id  (content-addressed-handle-id user-id query-json)]
     ;; Re-storing the same query refreshes the TTL and, when a prompt is supplied, the prompt —
     ;; so an iteration loop keeps a single live row rather than resurrecting an expired one.
     (app-db/update-or-insert!
      :model/McpQueryHandle
      {:id handle-id}
      (fn [existing]
        (cond-> {:user_id        user-id
                 :mcp_session_id (or (:mcp_session_id existing) mcp-session-id)
                 :encoded_query  query-json
                 :expires_at     (handle-expires-at)}
          prompt                        (assoc :prompt prompt)
          (and (nil? prompt) existing)  (assoc :prompt (:prompt existing)))))
     handle-id)))

(defn- find-handle-row
  "Look up a live (unexpired) handle row by `handle-id`, scoped to `user-id`. Handle ids are globally
   unique, so this returns at most one row. `mcp-session-id` only tags cross-session resolutions in the
   telemetry log; it never affects the lookup."
  [mcp-session-id user-id handle-id]
  (when (and user-id handle-id)
    (let [row (t2/select-one :model/McpQueryHandle
                             {:where [:and
                                      [:= :id handle-id]
                                      [:= :user_id user-id]
                                      [:> :expires_at :%now]]})]
      (when (and row (not= mcp-session-id (:mcp_session_id row)))
        (log/debugf "MCP handle %s resolved across sessions for user %s"
                    handle-id user-id))
      row)))

(defn read-handle
  "Return the stored query for `handle-id` owned by `user-id` (base64, for the agent-api and iframe
   callers), or nil if no live handle exists. Lookup is user-scoped — see [[find-handle-row]]."
  [mcp-session-id user-id handle-id]
  (some-> (find-handle-row mcp-session-id user-id handle-id)
          :encoded_query
          stored->base64))

(defn resolve-query-handle
  "Return {:encoded_query <base64> :prompt ...} for `handle-id` owned by `user-id`, or nil if no live
   handle exists. Lookup is user-scoped — see [[find-handle-row]]."
  [mcp-session-id user-id handle-id]
  (when-let [row (find-handle-row mcp-session-id user-id handle-id)]
    {:encoded_query (stored->base64 (:encoded_query row))
     :prompt        (:prompt row)}))

(defn delete!
  "Delete the `core_session` backing this MCP session (if one was ever materialized) and the session's
   query handles. Scoped to `user-id` so one user cannot delete another user's session or handles."
  [session-id user-id]
  (let [key-hashed (session/hash-session-key (derive-embedding-session-key session-id))]
    (t2/query {:delete-from :core_session
               :where       [:and
                             [:= :key_hashed key-hashed]
                             [:= :user_id user-id]]})
    (t2/delete! :model/McpQueryHandle :mcp_session_id session-id)))
