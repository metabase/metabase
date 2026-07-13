(ns metabase.mcp.session
  "Per-user state for the MCP server: the embedding session key the MCP Apps iframe
   authenticates with.

   It keys off the **authenticated user**, never a transport session. The 2026-07-28
   protocol has no `initialize` handshake and no `Mcp-Session-Id`, so any request can
   arrive cold, and the iframe gets the same embedding session whichever connection
   rendered it.

   A client that speaks an older protocol still gets an `Mcp-Session-Id` back from
   `initialize`. It is a self-describing capability hint — an opaque correlator plus the
   client's MCP Apps support, encoded in the id itself — that the server echoes and never
   stores. RC clients send those capabilities in each request's `_meta` instead and never
   see the header. Either way the server holds no session state.

   The query handles a tool call mints and resolves live in [[metabase.agent-api.handles]],
   keyed the same way."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.session.core :as session]
   [metabase.util.json :as json])
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
