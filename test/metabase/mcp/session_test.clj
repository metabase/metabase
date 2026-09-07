(ns metabase.mcp.session-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.session :as mcp.session]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- derived-hash
  "Derives the embedding session key from an MCP session id, then hashes it."
  [session-id]
  (session/hash-session-key (@#'mcp.session/derive-embedding-session-key session-id)))

(defn- session-correlator
  [session-id]
  (first (str/split session-id #"\.")))

(defn- extended-session-id
  "A session id carrying an arbitrary capability `payload`, SIGNED as the server would sign it.

  Signed deliberately: the tests using this exercise payload shape and version handling, and an unsigned id
  would fail them for the unrelated reason that its claim is not believed at all. Forging an UNSIGNED payload
  is what `mcp-ui-capability-claim-must-be-signed-test` covers."
  [payload]
  (let [uuid    (str (random-uuid))
        encoded (->> (.getBytes (json/encode payload) StandardCharsets/UTF_8)
                     (.encodeToString (.withoutPadding (Base64/getUrlEncoder))))]
    (str uuid "." encoded "." (@#'mcp.session/session-payload-signature uuid encoded))))

(deftest create-returns-uuid-string-test
  (testing "create! returns a session id with a UUID correlator without writing to the database"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto) nil)]
      (is (string? session-id))
      (is (some? (parse-uuid (session-correlator session-id))))
      (is (not (t2/exists? :core_session :key_hashed (derived-hash session-id)))
          "No core_session should exist yet"))))

(deftest session-ui-capability-is-stateless-test
  (testing "create! encodes MCP Apps UI support in a signed client capability hint"
    (let [ui-session-id    (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? true})
          plain-session-id (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? false})]
      (is (= 3 (count (str/split ui-session-id #"\.")))
          "New MCP session ids are <uuid>.<base64url JSON capability hint>.<signature over both>")
      (is (some? (parse-uuid (session-correlator ui-session-id))))
      (is (true? (mcp.session/supports-mcp-ui? ui-session-id)))
      (is (false? (mcp.session/supports-mcp-ui? plain-session-id)))
      (is (not (t2/exists? :core_session :key_hashed (derived-hash ui-session-id)))
          "Capability tracking should not materialize a core_session")
      (is (not (t2/exists? :core_session :key_hashed (derived-hash plain-session-id)))
          "Capability tracking should not materialize a core_session"))))

(deftest create-session-id-length-test
  (testing "generated session ids fit the persisted mcp_query_handle.mcp_session_id column (254)"
    ;; Exhaustive, not a sample: the correlator is a fixed-width UUID and `create-session-id`
    ;; collapses its argument to `(true? supports-mcp-ui?)`, so these three calls cover every
    ;; payload the encoder can produce. Payload growth that breaks the column fails here.
    (doseq [metadata [{:supports-mcp-ui? true} {:supports-mcp-ui? false} nil]]
      (is (<= (count (mcp.session/create! (mt/user->id :crowberto) metadata)) 254)
          (str "session id exceeds the column width for metadata " (pr-str metadata))))))

(deftest over-long-session-id-is-rejected-at-mint-test
  (testing (str "an id that would exceed the persisted mcp_query_handle.mcp_session_id column (254) is rejected when "
                "it is minted, not silently created and then 404'd on every later request by the read-path length "
                "guard. A future payload field is the realistic way this happens; here we force it by making the "
                "capability encoder emit an over-long segment.")
    (mt/with-dynamic-fn-redefs [mcp.session/encode-session-payload (constantly (apply str (repeat 300 "x")))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"exceeds the persisted column width"
                            (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? true}))
          "minting must fail loudly at creation rather than defer the failure to the read path"))))

(deftest mcp-ui-capability-claim-must-be-signed-test
  (testing "GHY-4318: `supports-mcp-ui?` is what `:required-extensions` gates on, and it reads a payload the
            CLIENT echoes back in its own session id. Unsigned, that is a self-assertion: any caller can mint
            `<uuid>.{\"v\":1,\"ui\":true}` and claim the capability without ever having advertised it at
            `initialize`, which is what lets a narrow token reach `refresh_ui_credential`.

            The id stays a stateless correlator — a well-formed one is still ACCEPTED for its presenter, which
            `well-formed-but-never-issued-session-id-is-accepted-for-its-presenter-test` pins. Only the claim
            inside it has to be proven, so an unsigned or tampered payload reads as no capability rather than
            as an invalid session."
    (let [minted (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? true})]
      (testing "a server-minted id carries the capability"
        (is (true? (mcp.session/valid-id? minted)))
        (is (true? (mcp.session/supports-mcp-ui? minted))))
      (testing "a client-forged payload claiming `ui` is still a usable session, but claims nothing"
        (let [forged (str (random-uuid) "." (@#'mcp.session/encode-session-payload {:v 1 :ui true}))]
          (is (true? (mcp.session/valid-id? forged))
              "still a valid correlator — statelessness is deliberate")
          (is (false? (mcp.session/supports-mcp-ui? forged))
              "but an unsigned capability claim must not be believed")))
      (testing "tampering with a signed payload invalidates the claim"
        (let [[uuid _payload sig] (str/split minted #"\\.")
              swapped (str uuid "." (@#'mcp.session/encode-session-payload {:v 1 :ui true}) "." sig)]
          (is (false? (mcp.session/supports-mcp-ui? swapped)))))
      (testing "a signature from a different session id does not transfer"
        (let [other (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? true})
              [uuid payload _] (str/split minted #"\\.")
              [_ _ other-sig]  (str/split other #"\\.")]
          (is (false? (mcp.session/supports-mcp-ui? (str uuid "." payload "." other-sig)))))))))

(deftest legacy-session-ui-capability-test
  (testing "a plain UUID session claims no capability. It used to claim MCP Apps support, which made signing
            the payload pointless: a caller could simply omit the payload and be believed anyway. Such ids
            predate capability hints entirely, so the honest reading of one is `unknown`, and the gate this
            feeds fails closed."
    (is (false? (mcp.session/supports-mcp-ui? (str (java.util.UUID/randomUUID)))))))

(deftest malformed-session-payload-test
  (testing "two-part session ids must include a decodable capability hint"
    (is (false? (mcp.session/valid-id? (str (java.util.UUID/randomUUID) ".not-base64")))))
  (testing "undecodable capability hints are logged"
    (mt/with-log-messages-for-level [messages [metabase.mcp.session :warn]]
      (is (false? (mcp.session/valid-id? (str (java.util.UUID/randomUUID) ".not-base64"))))
      (is (=? [{:level   :warn
                :message "MCP session id contains an undecodable capability payload"}]
              (messages)))))
  (testing "blank capability hints are logged"
    (mt/with-log-messages-for-level [messages [metabase.mcp.session :warn]]
      (is (false? (mcp.session/valid-id? (str (java.util.UUID/randomUUID) "."))))
      (is (=? [{:level   :warn
                :message "MCP session id contains a blank capability payload"}]
              (messages)))))
  (testing "two-part session ids must match the supported capability hint shape"
    (is (false? (mcp.session/valid-id? (extended-session-id {:v 1}))))
    (is (false? (mcp.session/valid-id? (extended-session-id {:v 1 :ui "true"})))))
  (testing "known payload versions preserve the UI capability hint"
    (let [session-id (extended-session-id {:v 1 :ui true})]
      (is (true? (mcp.session/valid-id? session-id)))
      (is (true? (mcp.session/supports-mcp-ui? session-id)))))
  (testing "unknown keys in a known-version hint are ignored, not rejected"
    (let [session-id (extended-session-id {:v 1 :ui true :a 1})]
      (is (true? (mcp.session/valid-id? session-id)))
      (is (true? (mcp.session/supports-mcp-ui? session-id)))))
  (testing "unknown payload versions keep the session valid but disable UI capability"
    (let [session-id (extended-session-id {:v 2 :ui true})]
      (is (true? (mcp.session/valid-id? session-id)))
      (is (false? (mcp.session/supports-mcp-ui? session-id)))))
  (testing "two-part session ids must fit the persisted query-handle session id column"
    (is (false? (mcp.session/valid-id? (extended-session-id {:v 1 :ui true :padding (apply str (repeat 300 "x"))}))))))

(deftest derive-embedding-session-key-is-uuid-formatted-test
  (testing "derived key is UUID-formatted so it passes server.middleware.session/valid-session-key?"
    ;; If this regresses, the embedding SDK iframe will get 403s from /api when it sends the
    ;; derived key as X-Metabase-Session, because the middleware rejects non-UUID keys up-front.
    (let [session-id (mcp.session/create! (mt/user->id :crowberto) nil)
          key        (@#'mcp.session/derive-embedding-session-key session-id)
          parsed     (parse-uuid key)]
      (is (some? parsed)
          "derive-embedding-session-key must return a UUID-formatted string")
      (is (= 8 (.version ^java.util.UUID parsed))
          "should be a v8 (custom/vendor-defined) UUID per RFC 9562")
      (is (= 2 (.variant ^java.util.UUID parsed))
          "should carry the RFC 4122 variant (10xx)"))))

(deftest ui-credential-validation-test
  (let [user-id    (mt/user->id :crowberto)
        session-id (mcp.session/create! user-id nil)
        scopes     #{metabot.scope/agent-content-read metabot.scope/agent-query-run}
        credential (mcp.session/issue-ui-credential session-id user-id scopes)]
    (testing "a fresh credential resolves to its user and MCP session"
      (is (=? {:uid user-id :sid session-id}
              (mcp.session/resolve-ui-credential credential))))
    (testing "invalid credentials are rejected"
      (is (nil? (mcp.session/resolve-ui-credential (str credential "x")))))
    (testing "expired credentials are rejected"
      (with-redefs [mcp.session/ui-credential-lifetime-seconds -1]
        (is (nil? (mcp.session/resolve-ui-credential
                   (mcp.session/issue-ui-credential session-id user-id scopes))))))))

(deftest ui-credential-carries-minting-session-scopes-test
  (testing "GHY-4318: the credential is stamped unrestricted for the endpoint scope middleware, so the minting
            session's real scopes have to travel on the signed claims for downstream gates to see them"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          scopes-of  (fn [token-scopes]
                       (:token-scopes (mcp.session/resolve-ui-credential
                                       (mcp.session/issue-ui-credential session-id user-id token-scopes))))]
      (testing "named scopes round-trip"
        (is (= #{metabot.scope/agent-content-read metabot.scope/agent-query-run}
               (scopes-of #{metabot.scope/agent-content-read metabot.scope/agent-query-run}))))
      (testing "an empty grant round-trips as an empty set, not as nil"
        (is (= #{} (scopes-of #{}))))
      (testing "the unrestricted sentinel round-trips as the keyword, not as a string"
        (is (= #{::scope/unrestricted} (scopes-of #{::scope/unrestricted}))))
      (testing "a granted scope that spells the sentinel out cannot become it — the sentinel rides its own claim"
        (is (= #{(str ::scope/unrestricted)}
               (scopes-of #{(str ::scope/unrestricted)}))))
      (testing "a credential minted before the claim existed fails closed rather than reading as unrestricted"
        ;; A rolling deploy can hand this node a credential from an older one for the 300s it stays valid.
        (mt/with-dynamic-fn-redefs [mcp.session/encode-token-scopes (constantly {})]
          (is (= #{} (scopes-of #{metabot.scope/agent-sql-run}))))))))

(deftest v1-credential-is-marked-legacy-test
  (testing "GHY-4318: v1's frozen surface mints through the 2-arity, with no scope claim. The native-SQL guard has
            to tell such a credential apart from one that merely arrived without the claim — a rolling deploy can
            produce the latter, and it must fail closed — so the v1 arity stamps an explicit `:legacy` marker
            rather than relying on the absence of `:scp`.

            TRIPWIRE: retiring v1 means deleting this arity AND the `:legacy` branch in
            [[metabase.agent-api.query-guards/check-mcp-ui-native-query!]]. Deleting only the arity leaves the
            skip in place as dead-looking but live code."
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          claims     (mcp.session/resolve-ui-credential
                      (mcp.session/issue-ui-credential session-id user-id))]
      (is (true? (:legacy claims)))
      (is (not (contains? claims :scp))
          "a legacy credential carries no scope claim at all, so `:legacy` is the only thing marking it")
      (is (= #{} (:token-scopes claims))
          "and it still decodes to the empty scope set, never to unrestricted")
      (testing "a v2 credential carries the claim and is never marked legacy"
        (let [v2-claims (mcp.session/resolve-ui-credential
                         (mcp.session/issue-ui-credential session-id user-id
                                                          #{metabot.scope/agent-query-run}))]
          (is (nil? (:legacy v2-claims)))
          (is (contains? v2-claims :scp)))))))

(deftest v1-shim-retires-with-v1-test
  (testing "GHY-4318: the `:legacy` credential shim exists only to keep v1's iframe working while v1 still
            serves. It is a fail-open branch, so it must not outlive v1 — and a comment saying so does not
            enforce anything: the retire-v1 branch already carries this arity's own \"delete me with v1\"
            comment, undeleted.

            So the deletion is keyed on v1's own disappearance rather than on someone remembering. This is
            inert while v1 ships and fires the day its namespace goes, naming both halves of the change."
    (if (io/resource "metabase/mcp/api.clj")
      (is (= 2 (count (:arglists (meta #'mcp.session/issue-ui-credential))))
          "v1 still ships, so the 2-arity shim is still load-bearing")
      (is (= 1 (count (:arglists (meta #'mcp.session/issue-ui-credential))))
          (str "v1 is retired, so its credential shim must go: delete `issue-ui-credential`'s 2-arity, "
               "`issue-legacy-ui-credential` itself, the `:legacy` branch in "
               "`metabase.agent-api.query-guards/check-mcp-ui-native-query!`, and the tripwire assertions "
               "covering them (here, in query-guards-test, and v2-credentials-are-never-legacy-test). Leaving "
               "the guard branch keeps a fail-open path alive for any credential shaped `{:legacy true}`.")))))

(deftest get-or-create-embedding-session-test
  (testing "first call materializes the core_session backing this MCP session and returns the row"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          row        (mcp.session/get-or-create-embedding-session! session-id user-id)]
      (is (some? (:id row)))
      (is (t2/exists? :core_session :key_hashed (derived-hash session-id))
          "core_session should now exist")
      (testing "subsequent calls collapse to the same row rather than creating duplicates"
        (is (= (:id row) (:id (mcp.session/get-or-create-embedding-session! session-id user-id))))
        (is (= 1 (t2/count :core_session :key_hashed (derived-hash session-id))))))))

(deftest embedding-session-key-never-escapes-the-namespace-test
  (testing "GHY-4333: `derive-embedding-session-key` takes only the MCP session id, which is client-supplied and
            unsigned, so two users presenting the same id derive the SAME plaintext key — and `core_session`
            lookups resolve a key by `key_hashed` alone, with no user filter and no ordering. Any public fn
            handing out that plaintext is therefore an account-takeover primitive: a caller who learns another
            user's session id gets a working session key for whoever else materialized a row under it.

            `get-or-create-session-key!` was exactly such a fn. It had no production caller anywhere (dead since
            #79312 replaced it with the signed UI credential), so it was deleted rather than guarded. The
            derivation is private so the plaintext cannot leave this namespace at all; inside it, the value is
            only ever hashed. This test is what stops that from being quietly undone."
    (is (:private (meta #'mcp.session/derive-embedding-session-key))
        (str "derive-embedding-session-key must stay private: its output authenticates as whichever user's "
             "colliding core_session row the DB happens to return first. A caller needing the row should use "
             "get-or-create-embedding-session!, which returns the row and never the key."))
    (is (not (contains? (ns-publics 'metabase.mcp.session) 'get-or-create-session-key!))
        "get-or-create-session-key! handed out that plaintext and must not come back")))

(deftest delete-test
  (testing "delete! removes the core_session if one was created"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          _          (mcp.session/get-or-create-embedding-session! session-id user-id)]
      (is (t2/exists? :core_session :key_hashed (derived-hash session-id)))
      (mcp.session/delete! session-id user-id)
      (is (not (t2/exists? :core_session :key_hashed (derived-hash session-id)))))))

(deftest delete-scoped-to-user-test
  (testing "delete! only removes sessions owned by the given user"
    (let [user-id    (mt/user->id :crowberto)
          other-id   (mt/user->id :rasta)
          session-id (mcp.session/create! user-id nil)
          _          (mcp.session/get-or-create-embedding-session! session-id user-id)]
      (is (t2/exists? :core_session :key_hashed (derived-hash session-id)))
      (mcp.session/delete! session-id other-id)
      (is (t2/exists? :core_session :key_hashed (derived-hash session-id))
          "Session should still exist — wrong user")
      (mcp.session/delete! session-id user-id)
      (is (not (t2/exists? :core_session :key_hashed (derived-hash session-id)))
          "Session should be deleted by the owning user"))))

(deftest owned-by-user-test
  (testing "returns true when no core_session exists yet"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto) nil)]
      (is (true? (mcp.session/owned-by-user? session-id (mt/user->id :crowberto))))
      (is (true? (mcp.session/owned-by-user? session-id (mt/user->id :rasta))))))
  (testing "returns true for the owning user, false for others"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          _          (mcp.session/get-or-create-embedding-session! session-id user-id)]
      (is (true? (mcp.session/owned-by-user? session-id user-id)))
      (is (false? (mcp.session/owned-by-user? session-id (mt/user->id :rasta)))))))

(deftest owned-by-user-tolerates-cross-user-rows-test
  (testing "GHY-4333: an Mcp-Session-Id is client-supplied and unsigned, so two users can each materialize a
            core_session for the same id. Each must keep access to its own row — checking ownership on key_hashed
            alone picks one of them arbitrarily and locks the other out of every subsequent request."
    (let [owner-id   (mt/user->id :crowberto)
          other-id   (mt/user->id :rasta)
          session-id (mcp.session/create! owner-id nil)]
      (testing "both users pass the check while nothing has been materialized"
        (is (true? (mcp.session/owned-by-user? session-id owner-id)))
        (is (true? (mcp.session/owned-by-user? session-id other-id))))
      (mcp.session/get-or-create-embedding-session! session-id owner-id)
      (mcp.session/get-or-create-embedding-session! session-id other-id)
      (is (= 2 (t2/count :core_session :key_hashed (derived-hash session-id)))
          "rows are scoped to (key_hashed, user_id), so each user materializes their own")
      (testing "neither user is locked out by the other's row"
        (is (true? (mcp.session/owned-by-user? session-id owner-id)))
        (is (true? (mcp.session/owned-by-user? session-id other-id))))
      (testing "a third user with no row of their own is still rejected"
        (is (false? (mcp.session/owned-by-user? session-id (mt/user->id :lucky))))))))

(deftest delete-noop-without-session-test
  (testing "delete! is a no-op when no core_session was ever created"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto) nil)]
      ;; Should not throw — just a no-op delete
      (mcp.session/delete! session-id (mt/user->id :crowberto)))))

(deftest store-and-resolve-handle-test
  (testing "store-handle! returns a UUID handle that resolve-query-handle resolves to the encoded query"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          h1         (mcp.session/store-handle! session-id user-id "first")
          h2         (mcp.session/store-handle! session-id user-id "second")]
      (is (some? (parse-uuid h1)) "store-handle! must return a UUID string")
      (is (some? (parse-uuid h2)))
      (is (not= h1 h2) "successive calls must produce distinct handles")
      (is (= session-id (t2/select-one-fn :mcp_session_id :model/McpQueryHandle :id h1))
          "store-handle! stores the full MCP session id, including capability hints")
      (is (= "first"  (:encoded_query (mcp.session/resolve-query-handle session-id user-id h1))))
      (is (= "second" (:encoded_query (mcp.session/resolve-query-handle session-id user-id h2))))
      (is (nil? (mcp.session/resolve-query-handle session-id user-id (str (random-uuid))))
          "resolve-query-handle returns nil for unknown handles"))))

(deftest resolve-query-handle-falls-back-across-the-users-sessions-test
  (testing "resolve-query-handle resolves a handle stored in one session when called from another session of the same user"
    (let [user-id        (mt/user->id :crowberto)
          owner-session  (mcp.session/create! user-id nil)
          rotated-session (mcp.session/create! user-id nil)
          handle         (mcp.session/store-handle! owner-session user-id "payload")]
      (testing "same session → resolves"
        (is (= "payload" (:encoded_query (mcp.session/resolve-query-handle owner-session user-id handle)))))
      (testing "different session, same user → still resolves (cross-session fallback)"
        (is (= "payload" (:encoded_query (mcp.session/resolve-query-handle rotated-session user-id handle)))))))
  (testing "resolve-query-handle refuses to resolve handles owned by a different user"
    (let [owner-id    (mt/user->id :crowberto)
          attacker-id (mt/user->id :rasta)
          session-id  (mcp.session/create! owner-id nil)
          handle      (mcp.session/store-handle! session-id owner-id "payload")]
      (is (nil? (mcp.session/resolve-query-handle session-id attacker-id handle))))))

(deftest resolve-query-handle-returns-encoded-query-and-prompt-test
  (testing "resolve-query-handle returns the stored query and prompt"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          handle     (mcp.session/store-handle! session-id user-id "encoded" "what was my question")]
      (is (= {:encoded_query "encoded" :prompt "what was my question"}
             (mcp.session/resolve-query-handle session-id user-id handle))))))

(deftest store-handle-cascades-with-core-session-test
  (testing "deleting the backing core_session cascades to its handles"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          handle     (mcp.session/store-handle! session-id user-id "payload")]
      (is (= "payload" (:encoded_query (mcp.session/resolve-query-handle session-id user-id handle))))
      (t2/delete! :core_session :key_hashed (derived-hash session-id))
      (is (nil? (mcp.session/resolve-query-handle session-id user-id handle))
          "cascade should reap the handle when the core_session row goes"))))

(deftest delete-removes-handles-test
  (testing "delete! removes handles for the session"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          handle     (mcp.session/store-handle! session-id user-id "payload")
          _          (mcp.session/delete! session-id user-id)]
      (is (nil? (mcp.session/resolve-query-handle session-id user-id handle))))))

(deftest delete-does-not-reap-another-users-handles-test
  (testing "GHY-4333: an `Mcp-Session-Id` is client-supplied and unsigned, so two users can each materialize a
            core_session under one id — `owned-by-user?` tolerates that by design, and
            `owned-by-user-tolerates-cross-user-rows-test` pins it. Tearing down one user's session therefore has
            to scope the handle delete to that user: deleting by `mcp_session_id` alone destroys the other user's
            handles, which the FK cascade would never have touched."
    (let [owner-id   (mt/user->id :crowberto)
          other-id   (mt/user->id :rasta)
          session-id (mcp.session/create! owner-id nil)]
      (try
        (let [owner-handle (mcp.session/store-handle! session-id owner-id "owner payload")
              other-handle (mcp.session/store-handle! session-id other-id "other payload")]
          (is (= 2 (t2/count :model/McpQueryHandle :mcp_session_id session-id))
              "both users hold a handle under the same session id — otherwise this test proves nothing")
          (mcp.session/delete! session-id owner-id)
          (testing "the caller's own handle is gone"
            (is (nil? (mcp.session/resolve-query-handle session-id owner-id owner-handle))))
          (testing "the other user's handle survives, and stays resolvable for them"
            (is (some? (mcp.session/resolve-query-handle session-id other-id other-handle)))))
        (finally
          (mcp.session/delete! session-id owner-id)
          (mcp.session/delete! session-id other-id))))))

(deftest delete-reaps-unattributed-legacy-handles-test
  (testing "`core_session_id` is nullable, and released code predating the always-set write left rows with it
            NULL. Scoping the delete through `core_session` alone strands those forever — `NULL IN (subquery)`
            never matches and nothing else reaps them.

            They are safe to delete on session id alone, unlike attributed rows: `find-handle-row` inner-joins
            `core_session`, so a NULL row can never be read back by anyone. It is unreachable data, not another
            user's working handle, so reaping it cannot destroy anything usable."
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          legacy-id  (str (random-uuid))]
      (try
        (t2/insert! :model/McpQueryHandle {:id              legacy-id
                                           :mcp_session_id  session-id
                                           :core_session_id nil
                                           :encoded_query   "legacy payload"})
        (is (t2/exists? :model/McpQueryHandle :id legacy-id))
        (is (nil? (mcp.session/resolve-query-handle session-id user-id legacy-id))
            "the row is unreadable even before deletion — that is what makes it safe to reap unscoped")
        (mcp.session/delete! session-id user-id)
        (is (not (t2/exists? :model/McpQueryHandle :id legacy-id))
            "delete! must reclaim it rather than strand it")
        (finally
          (t2/delete! :model/McpQueryHandle :id legacy-id))))))

(deftest session-does-not-fire-login-event-test
  (testing "Creating a core_session via get-or-create-embedding-session! does not publish :event/user-login"
    ;; Observed through the event's one synchronous side effect — `metabase.users.events.last-login` stamps
    ;; `last_login` on the user — rather than by redefining `events/publish-event!`: it is a methodical
    ;; multimethod, and `with-dynamic-fn-redefs` permanently swaps its root for a plain-fn proxy, after which
    ;; any later `methodical/defmethod` on it (e.g. `metabase.api-routes.events`, loaded when the test web
    ;; server first starts) fails to macroexpand.
    (mt/with-temp [:model/User {user-id :id} {:last_login nil}]
      (let [session-id (mcp.session/create! user-id nil)]
        (mcp.session/get-or-create-embedding-session! session-id user-id)
        (is (nil? (t2/select-one-fn :last_login :model/User :id user-id))
            "No :event/user-login should be published for MCP embedding sessions")))))
