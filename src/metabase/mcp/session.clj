(ns metabase.mcp.session
  "Lightweight MCP session management.

  An MCP session ID is just a random UUID handed out on `initialize` — no database row is created. Query handles may
  lazily materialize a `core_session` row, keyed by the hash of a deterministic value derived from the MCP session id.

  The backing value is derived rather than reusing the MCP session id directly, so the correlation id on the wire
  remains distinct from any stored session material.  Any webserver can recompute the same value without per-session
  plaintext at rest.

  MCP sessions themselves do not expire. Any backing `core_session` has its own TTL and is re-created on demand for
  query-handle lifecycle management."
  (:require
   [clojure.string :as str]
   [metabase.api.macros.scope :as scope]
   [metabase.app-db.core :as app-db]
   [metabase.mcp.models.mcp-query-handle]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.session.core :as session]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.time Instant)
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

(defn- derive-embedding-session-key
  "Deterministically derive the embedding session key for `mcp-session-id` from the instance-wide signing secret. See ns
  docstring for rationale.

  PRIVATE ON PURPOSE, and the privacy is load-bearing rather than stylistic. The derivation takes only the MCP
  session id — which is client-supplied and unsigned — so two users presenting the same id derive the SAME key.
  `core_session` lookups resolve a key by `key_hashed` alone, with no user filter and no ordering
  ([[metabase.server.middleware.session]]), so whichever colliding row the DB returns first is who that key
  authenticates as. Any public fn returning this plaintext is therefore an account-takeover primitive: a caller
  who knows another user's session id gets a working session key for whoever else materialized a row under it.

  Inside this namespace the value is only ever hashed. Keep it that way — a caller that needs the row should use
  [[get-or-create-embedding-session!]], which returns the row and never the key.

  The output is formatted as a UUID string because `metabase.server.middleware.session` rejects non-UUID session keys
  up-front. Specifically we emit a version-8 UUID
   (RFC 9562), which is the version reserved for \"custom / vendor-defined\" constructions: 128 bits produced by our
  own HMAC-SHA256 derivation rather than by the standard v1/v3/v4/v5 algorithms. v4 would lie about randomness, v5
  would lie about the hash algorithm; v8 is the only version that's actually honest here.

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

(def ^:private ui-credential-lifetime-seconds
  "Lifetime of a rendered MCP Apps UI credential. This is deliberately short: the credential is delivered to an iframe
  through a resource response."
  300)

(defn- base64url-encode [^String value]
  (.encodeToString (.withoutPadding (Base64/getUrlEncoder)) (.getBytes value StandardCharsets/UTF_8)))

(defn- base64url-encode-bytes [^bytes value]
  (.encodeToString (.withoutPadding (Base64/getUrlEncoder)) value))

(defn- base64url-decode [^String value]
  (String. (.decode (Base64/getUrlDecoder) value) StandardCharsets/UTF_8))

(defn- ui-credential-signature [^String payload]
  (base64url-encode-bytes
   (hmac-sha256 (mcp.settings/unobfuscated-mcp-embedding-signing-secret)
                (str "mcp-ui-v1." payload))))

(declare valid-id?)

(defn- encode-token-scopes
  "Serialize `token-scopes` into credential claims.

  Named scope strings go in `:scp`; the `::scope/unrestricted` sentinel gets its own boolean claim `:unr`. They are
  kept in separate claims deliberately: JSON has no keywords, so folding the sentinel into `:scp` would turn it into
  a string that a granted scope could be equal to. Nothing that can appear in `:scp` can appear in `:unr`."
  [token-scopes]
  (cond-> {:scp (vec (sort (filter string? token-scopes)))}
    (contains? token-scopes ::scope/unrestricted) (assoc :unr true)))

(defn- decode-token-scopes
  "Rebuild the scope set from credential `claims`, reversing [[encode-token-scopes]].

  Absent claims read as the empty set rather than as unrestricted, so a credential minted by a node that predates
  the claim fails closed for the five minutes it stays valid."
  [{:keys [scp unr]}]
  (cond-> (into #{} (filter string?) scp)
    (true? unr) (conj ::scope/unrestricted)))

(defn- sign-ui-credential
  "Sign the standard credential claims plus `extra-claims` into a `<payload>.<signature>` string."
  [session-id user-id extra-claims]
  (let [payload (base64url-encode
                 (json/encode (merge {:v 1 :uid user-id :sid session-id
                                      :exp (+ (.getEpochSecond (Instant/now)) ui-credential-lifetime-seconds)}
                                     extra-claims)))]
    (str payload "." (ui-credential-signature payload))))

(defn- issue-legacy-ui-credential
  "v1-compat ONLY. Mint a UI credential with no scope claim, stamped `:legacy`.

  A credential minted here is EXEMPT from the native-SQL scope gate
  ([[metabase.agent-api.query-guards/check-mcp-ui-native-query!]]) — v1's iframe visualizes `execute_sql`
  handles that legitimately hold raw SQL, and wiring that gate must not change v1's behavior. The marker is
  explicit rather than inferred from a missing claim, because absence has to keep meaning *fail closed*: a
  rolling deploy can hand a node a credential minted before the claim existed, and the gate refuses those.

  It carries the scary name on purpose. `(issue-ui-credential session-id user-id)` reads like a perfectly
  reasonable call, and a v2 caller reaching for it would silently opt that surface out of the gate — the exact
  hole the gate was added to close. Nothing on the v2 surface may call this or the 2-arity that forwards here;
  `v2-credentials-are-never-legacy-test` is what holds that line.

  Delete this fn, its 2-arity forwarder, and the guard's `:legacy` branch, with v1's retirement."
  [session-id user-id]
  (sign-ui-credential session-id user-id {:legacy true}))

(defn issue-ui-credential
  "Create a short-lived credential for the MCP Apps UI. It authenticates only the narrow server-side UI request surface,
  never as a core Metabase session.

  `token-scopes` is the minting MCP session's scope set. It rides along as a signed claim so gates further down the
  iframe's request surface can ask what the client was actually granted — the credential itself is stamped
  unrestricted, since the allowlisted routes declare no `:scope` and would otherwise 403 the iframe at bootstrap.

  Passing the caller's real scopes is what subjects the credential to the native-SQL gate. The 2-arity is the
  v1 surface's, and forwards to [[issue-legacy-ui-credential]] — read that docstring before calling it: it mints
  a credential EXEMPT from that gate. It stays an arity of this fn only so v1's frozen call site does not have
  to change; v2 must always pass scopes."
  ([session-id user-id]
   (issue-legacy-ui-credential session-id user-id))
  ([session-id user-id token-scopes]
   (sign-ui-credential session-id user-id (encode-token-scopes token-scopes))))

(defn resolve-ui-credential
  "Validate a rendered MCP Apps UI credential and return its claims, or nil. The claims carry `:token-scopes`, the
  scope set the minting MCP session held.
  Invalid and expired inputs intentionally have the same result and are never logged."
  [credential]
  (try
    (let [[payload ^String signature & extra] (str/split (or credential "") #"\." -1)
          ^String expected (when (and payload signature (empty? extra)) (ui-credential-signature payload))]
      (when (and expected
                 (MessageDigest/isEqual (.getBytes expected StandardCharsets/UTF_8)
                                        (.getBytes signature StandardCharsets/UTF_8)))
        (let [{:keys [v uid sid exp] :as claims} (json/decode+kw (base64url-decode payload))]
          (when (and (= v 1) (integer? uid) (string? sid) (integer? exp)
                     (valid-id? sid)
                     (> exp (.getEpochSecond (Instant/now))))
            (assoc claims :token-scopes (decode-token-scopes claims))))))
    (catch Exception _ nil)))

;;; -------------------------------------------------- Lifecycle --------------------------------------------------

(def ^:private session-payload-version
  "Version for the unsigned JSON client-capability hint encoded in new MCP session ids."
  1)

(mr/def ::session-payload
  "The unsigned client-capability hint carried in the second segment of an `Mcp-Session-Id`: the
   payload version and whether the client can render MCP Apps UI. Server-minted and only echoed back
   by clients; validated before we read its `:ui` flag, which is the only thing relayed onward."
  [:map
   [:v  :int]
   [:ui :boolean]])

(def ^:private max-session-id-length
  "Maximum persisted length for `mcp_query_handle.mcp_session_id`."
  254)

(defn- encode-session-payload
  "Encode a small JSON map for the second segment of `Mcp-Session-Id`.

  MCP initialize capabilities are client-advertised hints, not authorization state. We include them in the
  server-created session id so later requests can make the same tools/list decision on any Metabase webserver without
  an in-memory cache or a DB row just for session metadata."
  [payload]
  (base64url-encode (json/encode payload)))

(defn- decode-session-payload
  "Decode the optional client-capability hint from an `Mcp-Session-Id`.

  Invalid payloads return nil so the whole session id can be treated as invalid by [[session-parts]]."
  [encoded]
  (when-not (str/blank? encoded)
    ;; The payload is client-supplied via the `Mcp-Session-Id` header, so a bad base64 body or
    ;; non-JSON contents must read as an invalid session rather than propagate out of `valid-id?`.
    (try
      (json/decode+kw (base64url-decode encoded))
      (catch Exception _
        nil))))

(defn- parse-session-payload
  "Parse the optional base64url JSON capability segment.

  Plain UUID session ids are legacy ids issued before capability-aware tools/list and remain valid. Two-part ids with
  a known payload version must include a supported payload shape so malformed capability hints do not silently fall
  back to legacy behavior. Unknown payload versions remain valid but default to no UI capability, so rolling deploy
  version skew does not invalidate the whole session."
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
               (mr/validate ::session-payload decoded-payload))
          {:extended true
           :payload  (select-keys decoded-payload [:ui])}

          ;; During rolling deploys, a newer node may mint a capability payload version this node does not understand.
          ;; The payload is only a capability hint, so keep the session valid but fall back to no MCP Apps UI support.
          (and has-payload-version?
               unknown-version?)
          {:extended true
           :payload  {:ui false}}))
      (log/warn "MCP session id contains an undecodable capability payload"))))

(defn- session-parts
  "Parse an MCP session id into a UUID correlator plus optional client-capability hint.

  New session ids have the form `<uuid>.<base64url-json>`, currently with payload `{\"v\":1,\"ui\":true}`.  We keep
  the UUID as the first segment because existing MCP session behavior derives the embedding session key from this
  server-created id, while the JSON segment lets us remember initialize-time UI capability statelessly across multiple
  Metabase webservers."
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
    ;; Enforce the `mcp_query_handle.mcp_session_id` column width (254) at the mint site, not only on the read path
    ;; ([[session-parts]]). A future payload field that pushed an id past the cap would otherwise mint fine and
    ;; initialize a working session, then have every later request 404 "Invalid or expired session" once the
    ;; over-long id failed the read-path length guard — a failure divorced in time and place from its cause. Failing
    ;; here turns that into an immediate, legible error at creation. A thrown ex (not a bare `assert`, which
    ;; `*assert*` can disable) keeps the guard live in every build.
    (when (> (count session-id) max-session-id-length)
      (throw (ex-info "MCP session id exceeds the persisted column width"
                      {:length (count session-id) :max max-session-id-length})))
    session-id))

(defn valid-id?
  "Return true if `session-id` has a UUID correlator (the format `create!` produces).
  Format check only — authentication is handled separately by cookie or bearer token, not by the session ID itself."
  [session-id]
  (some? (session-parts session-id)))

(defn- assert-session-id!
  [session-id]
  (when-not (valid-id? session-id)
    (throw (ex-info "Invalid MCP session id" {:session-id session-id})))
  session-id)

(defn create!
  "Create a new MCP session. Returns a session id string.
  No database row is written — the session is just an opaque correlator until a resource read materializes it into a
  `core_session`.

  `user-id` is accepted but not persisted: since MCP sessions are currently stateless (no server-side token store), we
  don't validate the user against future requests. This parameter exists so we can add durable, user-scoped sessions
  in the future without changing the call-site contract.

  The 1-arity is v1 compat (master's call-site shape, still used by the v1 callback tests); it goes
  with the other v1 shims at retirement."
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

(defn get-or-create-embedding-session!
  "Materialize and return the `core_session` row backing this MCP session.
  Idempotent — repeated calls collapse to the same row in the common case.

  Returns the row, never the session key — see [[derive-embedding-session-key]] for why the plaintext must not
  leave this namespace."
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

(defn owned-by-user?
  "Return true if no `core_session` has been materialized for this session yet (i.e. no ownership to violate), or if
  one of the materialized rows belongs to `user-id`."
  [session-id user-id]
  ;; `Mcp-Session-Id` is client-supplied and unsigned, so two users can present the same id and each materialize their
  ;; own row before either check runs — the window spans requests, so no transaction here can close it. Matching the
  ;; (key_hashed, user_id) scoping that `get-or-create-embedding-session!` and `delete!` already use makes that
  ;; harmless: each user sees their own row instead of one arbitrarily shadowing the other. Reading the owner from
  ;; key_hashed alone would pick one row of the set and lock every other user out of a session they already hold.
  (let [key-hashed (session/hash-session-key (derive-embedding-session-key session-id))
        owners     (t2/select-fn-set :user_id :core_session :key_hashed key-hashed)]
    (or (empty? owners) (contains? owners user-id))))

;;; -------------------------------------------- Query Handle Store -----------------------------------------------
;; DB-backed store for base64-encoded MBQL query payloads referenced by MCP tool
;; calls. Each row carries a fresh UUID handle that the iframe (drill-through) or
;; agent (construct_query) passes through downstream so the LLM never carries the
;; encoded query.

(defn store-handle!
  "Insert a new handle row binding `encoded-query` to the calling user, and return the handle UUID.

  `mcp-session-id` is recorded so DELETE /api/metabase-mcp can sweep the session's handles, and so reads can log when
  a handle is resolved across sessions (see [[find-handle-row]]) — the read path itself is purely user-scoped, since
  handle UUIDs are globally unique.

  `prompt` is optional, but should be supplied for construct_query handles so visualize_query can later return both
  the query and original user prompt to the MCP iframe for feedback submission."
  ([mcp-session-id user-id encoded-query]
   (store-handle! mcp-session-id user-id encoded-query nil))
  ([mcp-session-id user-id encoded-query prompt]
   (assert-session-id! mcp-session-id)
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

(defn- handle-id?
  [handle-id]
  (and (string? handle-id)
       (some? (parse-uuid handle-id))))

(defn- find-handle-row
  "Look up the handle row by `handle-id`, scoped to `user-id`.
  Handle ids are globally unique UUIDs, so the join's `WHERE mqh.id = handle-id` returns at most one row by definition
  — no ordering or session-preference logic is needed. `mcp-session-id` is recorded on the row only so harnesses that
  rotate MCP sessions between calls (e.g. ChatGPT) can be logged as cross-session resolutions for telemetry."
  [mcp-session-id user-id handle-id]
  (when (and user-id (handle-id? handle-id))
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

(defn resolve-query-handle
  "Return {:encoded_query ... :prompt ...} for `handle-id` owned by `user-id`, or nil.
  Lookup is user-scoped — see [[find-handle-row]] for how `mcp-session-id` is used."
  [mcp-session-id user-id handle-id]
  ;; Threading the ROW, not the session id: the lookup is user-scoped and needs only `user-id`, and
  ;; `mcp-session-id` is used solely to log a cross-session resolution. Short-circuiting on a nil session id
  ;; would refuse a handle its owner is entitled to.
  (some-> (find-handle-row mcp-session-id user-id handle-id)
          (select-keys [:encoded_query :prompt])))

(defn read-handle
  "Return the encoded query for `handle-id` owned by `user-id`, or nil if no row exists.
   Lookup is user-scoped — see [[find-handle-row]] for how `mcp-session-id` is used.

   v1-compat: only the frozen v1 surface calls this; delete it with v1's retirement."
  [mcp-session-id user-id handle-id]
  (:encoded_query (find-handle-row mcp-session-id user-id handle-id)))

(defn delete!
  "Delete the `core_session` backing this MCP session (if one was ever created) and this user's query handles on it.
  Every statement is scoped to `user-id`, so tearing down one user's session cannot touch another's.

  That scoping is not belt-and-braces: `Mcp-Session-Id` is client-supplied and unsigned, so two users can hold
  rows under one id and [[owned-by-user?]] admits both by design. Deleting handles by `mcp_session_id` alone
  would therefore reap the other user's handles — rows the FK cascade would never have touched, since they hang
  off *their* `core_session`.

  Handles are deleted before the session row so they can still be scoped through it; the `ON DELETE CASCADE` that
  follows is then a no-op for this user.

  Rows with a NULL `core_session_id` ARE reaped, on session id alone. `store-handle!` always sets the column now,
  but it is nullable and released code predating that left rows without it; scoping those through `core_session`
  strands them forever, since `NULL IN (subquery)` never matches and nothing else sweeps the table. Reaping them
  unscoped is safe precisely because they are unattributed: [[find-handle-row]] inner-joins `core_session`, so
  such a row can never be read back by anyone. That makes it unreachable data rather than another user's working
  handle — the opposite of the attributed rows, which stay scoped."
  [session-id user-id]
  (assert-session-id! session-id)
  (let [key-hashed (session/hash-session-key (derive-embedding-session-key session-id))
        ;; Deliberate subquery: the handle rows carry no user of their own, so the only thing that attributes one
        ;; is the `core_session` it hangs off. Resolving these ids in a separate round trip would leave a window
        ;; where a concurrent teardown drops the session between the two statements.
        own-sessions ^:allow-subquery {:select [:id]
                                       :from   [:core_session]
                                       :where  [:and
                                                [:= :key_hashed key-hashed]
                                                [:= :user_id user-id]]}]
    (t2/query {:delete-from :mcp_query_handle
               :where       [:and
                             [:= :mcp_session_id session-id]
                             [:or
                              [:= :core_session_id nil]
                              [:in :core_session_id own-sessions]]]})
    (t2/query {:delete-from :core_session
               :where       [:and
                             [:= :key_hashed key-hashed]
                             [:= :user_id user-id]]})))
