(ns metabase.mcp.session
  "Per-user state for the MCP server: the embedding session key the MCP Apps iframe
   authenticates with, and the query-handle store.

   Both key off the **authenticated user**, never a transport session. The 2026-07-28
   protocol has no `initialize` handshake and no `Mcp-Session-Id`, so any request can
   arrive cold: a handle stored by one connection resolves from the next, and the iframe
   gets the same embedding session whichever connection rendered it.

   A client that speaks an older protocol still gets an `Mcp-Session-Id` back from
   `initialize`. It is a self-describing capability hint — an opaque correlator plus the
   client's MCP Apps support, encoded in the id itself — that the server echoes and never
   stores. RC clients send those capabilities in each request's `_meta` instead and never
   see the header. Either way the server holds no session state."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.app-db.core :as app-db]
   [metabase.mcp.models.mcp-query-handle]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.session.core :as session]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.util Base64 UUID)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Embedding Session Key ---------------------------------------------

(defn- hmac-sha256
  ^bytes [^String secret ^String message]
  (let [mac (Mac/getInstance "HmacSHA256")]
    (.init mac (SecretKeySpec. (.getBytes secret "UTF-8") "HmacSHA256"))
    (.doFinal mac (.getBytes message "UTF-8"))))

(defn derive-embedding-session-key
  "Deterministically derive `user-id`'s embedding session key from the instance-wide signing
   secret. This is the key the MCP Apps iframe authenticates to Metabase with; deriving it means
   any webserver can recompute it on demand with no per-session plaintext at rest.

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
   - The output is deterministic in `user-id` and the signing secret. That's intentional
     (so any webserver can recompute it) — don't treat two of these as independently
     random just because they look like UUIDs. Rotating the signing secret rotates every
     user's key."
  [user-id]
  (let [bytes (hmac-sha256 (mcp.settings/unobfuscated-mcp-embedding-signing-secret)
                           (str "mcp-embedding-session:" user-id))
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

(defn- get-or-create-embedding-session!
  "Materialize and return the `core_session` row backing `user-id`'s MCP embedding session.
   Idempotent — repeated calls collapse to the same row in the common case."
  [user-id]
  (let [session-key (derive-embedding-session-key user-id)
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
  "Ensure a `core_session` exists for `user-id`'s MCP embedding session and return its
   (plaintext) session key. The `core_session` row has its own TTL and is reaped
   independently; a later call re-inserts it."
  [user-id]
  (get-or-create-embedding-session! user-id)
  (derive-embedding-session-key user-id))

;;; -------------------------------------------- Client Capability Hint -------------------------------------------

(def ^:private capability-payload-version
  "Version of the unsigned JSON capability hint encoded in an `Mcp-Session-Id`."
  1)

(def ^:private max-session-id-length
  "Cap on the id we mint, so it stays comfortably within header and log-column limits."
  254)

(defn- encode-capability-payload
  "Encode the capability map for the second segment of an `Mcp-Session-Id`."
  [payload]
  (-> (json/encode payload)
      (.getBytes StandardCharsets/UTF_8)
      (->> (.encodeToString (.withoutPadding (Base64/getUrlEncoder))))))

(defn- decode-capability-payload
  "Decode the base64url JSON capability segment, or nil if it is not decodable."
  [encoded]
  (when-not (str/blank? encoded)
    (try
      (-> (Base64/getUrlDecoder)
          (.decode ^String encoded)
          (String. StandardCharsets/UTF_8)
          json/decode+kw)
      (catch Exception _
        nil))))

(defn- parse-capability-payload
  "Parse the optional base64url JSON capability segment of an `Mcp-Session-Id`.

   Plain UUID ids carry no capability hint. An unknown payload version stays usable but falls
   back to no MCP Apps UI support, so a rolling deploy where a newer node mints a payload this
   node cannot read degrades to hiding the UI tools rather than erroring."
  [payload]
  (cond
    (nil? payload)      {:extended false}
    (str/blank? payload) nil
    :else
    (when-let [decoded (decode-capability-payload payload)]
      (let [version (when (map? decoded) (:v decoded))]
        (cond
          (and (integer? version)
               (<= version capability-payload-version)
               (boolean? (:ui decoded)))
          {:extended true :payload decoded}

          (integer? version)
          {:extended true :payload {:ui false}})))))

(defn- session-parts
  "Parse an `Mcp-Session-Id` into its UUID correlator plus the client-capability hint, or nil if
   it is not one we minted. The id has the form `<uuid>.<base64url-json>`, payload `{\"v\":1,\"ui\":true}`."
  [session-id]
  (when (and (string? session-id)
             (<= (count session-id) max-session-id-length))
    (let [[uuid payload :as parts] (str/split session-id #"\." -1)]
      (when (#{1 2} (count parts))
        (when-let [uuid (parse-uuid uuid)]
          (some-> (parse-capability-payload payload)
                  (assoc :uuid uuid)))))))

(defn create!
  "Mint an `Mcp-Session-Id` for a client that spoke `initialize`, carrying `supports-mcp-ui?` in
   the id itself. Writes nothing: the server never looks the id up, it only reads back the hint
   the client echoes."
  [{:keys [supports-mcp-ui?]}]
  (let [session-id (str (UUID/randomUUID)
                        "."
                        (encode-capability-payload {:v  capability-payload-version
                                                    :ui (true? supports-mcp-ui?)}))]
    (assert (<= (count session-id) max-session-id-length)
            "MCP session id is too long")
    session-id))

(defn supports-mcp-ui?
  "Whether the client that was handed `session-id` advertised MCP Apps UI support. Nil for an id
   with no capability hint (a plain UUID from an older Metabase, or no id at all) — the caller
   decides what an absent hint means."
  [session-id]
  (when-let [{:keys [payload extended]} (session-parts session-id)]
    (when extended
      (true? (:ui payload)))))

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
        (.getBytes (str user-id " " query-json) StandardCharsets/UTF_8))))

(defn- handle-expires-at
  []
  (t/plus (t/offset-date-time) (t/days (mcp.settings/mcp-query-handle-ttl-days))))

(defn store-handle!
  "Store `encoded-query` for `user-id` and return the handle UUID.

   Content-addressed: storing the same query twice for the same user yields the same handle and a single
   row. The handle expires after [[metabase.mcp.settings/mcp-query-handle-ttl-days]].

   `prompt` is optional but should be supplied for construct_query handles so visualize_query can return
   the original prompt to the MCP iframe."
  ([user-id encoded-query]
   (store-handle! user-id encoded-query nil))
  ([user-id encoded-query prompt]
   (let [query-json (->stored-json encoded-query)
         handle-id  (content-addressed-handle-id user-id query-json)]
     ;; Re-storing the same query refreshes the TTL and, when a prompt is supplied, the prompt —
     ;; so an iteration loop keeps a single live row rather than resurrecting an expired one.
     (app-db/update-or-insert!
      :model/McpQueryHandle
      {:id handle-id}
      (fn [existing]
        (cond-> {:user_id       user-id
                 :encoded_query query-json
                 :expires_at    (handle-expires-at)}
          prompt                       (assoc :prompt prompt)
          (and (nil? prompt) existing) (assoc :prompt (:prompt existing)))))
     handle-id)))

(defn- find-handle-row
  "Look up a live (unexpired) handle row by `handle-id`, scoped to `user-id`. Handle ids are globally
   unique, so this returns at most one row."
  [user-id handle-id]
  (when (and user-id handle-id)
    (t2/select-one :model/McpQueryHandle
                   {:where [:and
                            [:= :id handle-id]
                            [:= :user_id user-id]
                            [:> :expires_at :%now]]})))

(defn read-handle
  "Return the stored query for `handle-id` owned by `user-id` (base64, for the agent-api and iframe
   callers), or nil if no live handle exists."
  [user-id handle-id]
  (some-> (find-handle-row user-id handle-id)
          :encoded_query
          stored->base64))

(defn resolve-query-handle
  "Return {:encoded_query <base64> :prompt ...} for `handle-id` owned by `user-id`, or nil if no live
   handle exists."
  [user-id handle-id]
  (when-let [row (find-handle-row user-id handle-id)]
    {:encoded_query (stored->base64 (:encoded_query row))
     :prompt        (:prompt row)}))
