(ns metabase.mcp.session-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.mcp.session :as mcp.session]
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
  (session/hash-session-key (mcp.session/derive-embedding-session-key session-id)))

(defn- session-correlator
  [session-id]
  (first (str/split session-id #"\.")))

(defn- extended-session-id
  [payload]
  (str (random-uuid)
       "."
       (->> (.getBytes (json/encode payload) StandardCharsets/UTF_8)
            (.encodeToString (.withoutPadding (Base64/getUrlEncoder))))))

(deftest create-returns-uuid-string-test
  (testing "create! returns a session id with a UUID correlator without writing to the database"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      (is (string? session-id))
      (is (some? (parse-uuid (session-correlator session-id))))
      (is (not (t2/exists? :core_session :key_hashed (derived-hash session-id)))
          "No core_session should exist yet"))))

(deftest session-ui-capability-is-stateless-test
  (testing "create! encodes MCP Apps UI support in an unsigned client capability hint"
    (let [ui-session-id    (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? true})
          plain-session-id (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? false})]
      (is (= 2 (count (str/split ui-session-id #"\.")))
          "New MCP session ids should include a UUID correlator and a base64url JSON capability hint")
      (is (some? (parse-uuid (session-correlator ui-session-id))))
      (is (true? (mcp.session/supports-mcp-ui? ui-session-id)))
      (is (false? (mcp.session/supports-mcp-ui? plain-session-id)))
      (is (not (t2/exists? :core_session :key_hashed (derived-hash ui-session-id)))
          "Capability tracking should not materialize a core_session")
      (is (not (t2/exists? :core_session :key_hashed (derived-hash plain-session-id)))
          "Capability tracking should not materialize a core_session"))))

(deftest create-session-id-length-test
  (testing "generated session ids fit the persisted mcp_query_handle.mcp_session_id column"
    (is (<= (count (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? true})) 254)))
  (testing "payload growth fails early in dev and tests"
    (mt/with-dynamic-fn-redefs [mcp.session/encode-session-payload (fn [_payload]
                                                                     (apply str (repeat 300 "x")))]
      (is (thrown-with-msg? AssertionError
                            #"MCP session id is too long"
                            (mcp.session/create! (mt/user->id :crowberto) {:supports-mcp-ui? true}))))))

(deftest legacy-session-ui-capability-test
  (testing "plain UUID sessions minted before capability hints keep the old tools/list behavior"
    (is (true? (mcp.session/supports-mcp-ui? (str (java.util.UUID/randomUUID)))))))

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
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))
          key        (mcp.session/derive-embedding-session-key session-id)
          parsed     (parse-uuid key)]
      (is (some? parsed)
          "derive-embedding-session-key must return a UUID-formatted string")
      (is (= 8 (.version ^java.util.UUID parsed))
          "should be a v8 (custom/vendor-defined) UUID per RFC 9562")
      (is (= 2 (.variant ^java.util.UUID parsed))
          "should carry the RFC 4122 variant (10xx)"))))

(deftest get-or-create-session-key-test
  (testing "first call creates a core_session and returns the derived embedding key"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          key        (mcp.session/get-or-create-session-key! session-id user-id)]
      (is (= (mcp.session/derive-embedding-session-key session-id) key))
      (is (not= session-id key)
          "Derived key must not equal the MCP session id that travels on the wire")
      (is (t2/exists? :core_session :key_hashed (derived-hash session-id))
          "core_session should now exist")
      (testing "subsequent calls return the same key and don't create duplicates"
        (is (= key (mcp.session/get-or-create-session-key! session-id user-id)))
        (is (= 1 (t2/count :core_session :key_hashed (derived-hash session-id))))))))

(deftest delete-test
  (testing "delete! removes the core_session if one was created"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          _          (mcp.session/get-or-create-session-key! session-id user-id)]
      (is (t2/exists? :core_session :key_hashed (derived-hash session-id)))
      (mcp.session/delete! session-id user-id)
      (is (not (t2/exists? :core_session :key_hashed (derived-hash session-id)))))))

(deftest delete-scoped-to-user-test
  (testing "delete! only removes sessions owned by the given user"
    (let [user-id    (mt/user->id :crowberto)
          other-id   (mt/user->id :rasta)
          session-id (mcp.session/create! user-id)
          _          (mcp.session/get-or-create-session-key! session-id user-id)]
      (is (t2/exists? :core_session :key_hashed (derived-hash session-id)))
      (mcp.session/delete! session-id other-id)
      (is (t2/exists? :core_session :key_hashed (derived-hash session-id))
          "Session should still exist — wrong user")
      (mcp.session/delete! session-id user-id)
      (is (not (t2/exists? :core_session :key_hashed (derived-hash session-id)))
          "Session should be deleted by the owning user"))))

(deftest owned-by-user-test
  (testing "returns true when no core_session exists yet"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      (is (true? (mcp.session/owned-by-user? session-id (mt/user->id :crowberto))))
      (is (true? (mcp.session/owned-by-user? session-id (mt/user->id :rasta))))))
  (testing "returns true for the owning user, false for others"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          _          (mcp.session/get-or-create-session-key! session-id user-id)]
      (is (true? (mcp.session/owned-by-user? session-id user-id)))
      (is (false? (mcp.session/owned-by-user? session-id (mt/user->id :rasta)))))))

(deftest delete-noop-without-session-test
  (testing "delete! is a no-op when no core_session was ever created"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      ;; Should not throw — just a no-op delete
      (mcp.session/delete! session-id (mt/user->id :crowberto)))))

(deftest store-and-read-handle-test
  (testing "store-handle! returns a UUID handle that read-handle resolves to the encoded query"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          h1         (mcp.session/store-handle! session-id user-id "first")
          h2         (mcp.session/store-handle! session-id user-id "second")]
      (is (some? (parse-uuid h1)) "store-handle! must return a UUID string")
      (is (some? (parse-uuid h2)))
      (is (not= h1 h2) "successive calls must produce distinct handles")
      (is (= session-id (t2/select-one-fn :mcp_session_id :model/McpQueryHandle :id h1))
          "store-handle! stores the full MCP session id, including capability hints")
      (is (= "first"  (mcp.session/read-handle session-id user-id h1)))
      (is (= "second" (mcp.session/read-handle session-id user-id h2)))
      (is (nil? (mcp.session/read-handle session-id user-id (str (random-uuid))))
          "read-handle returns nil for unknown handles"))))

(deftest read-handle-falls-back-across-the-users-sessions-test
  (testing "read-handle resolves a handle stored in one session when called from another session of the same user"
    (let [user-id        (mt/user->id :crowberto)
          owner-session  (mcp.session/create! user-id)
          rotated-session (mcp.session/create! user-id)
          handle         (mcp.session/store-handle! owner-session user-id "payload")]
      (testing "same session → resolves"
        (is (= "payload" (mcp.session/read-handle owner-session user-id handle))))
      (testing "different session, same user → still resolves (cross-session fallback)"
        (is (= "payload" (mcp.session/read-handle rotated-session user-id handle))))))
  (testing "read-handle refuses to resolve handles owned by a different user"
    (let [owner-id    (mt/user->id :crowberto)
          attacker-id (mt/user->id :rasta)
          session-id  (mcp.session/create! owner-id)
          handle      (mcp.session/store-handle! session-id owner-id "payload")]
      (is (nil? (mcp.session/read-handle session-id attacker-id handle))))))

(deftest resolve-query-handle-returns-encoded-query-and-prompt-test
  (testing "resolve-query-handle returns the stored query and prompt"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          handle     (mcp.session/store-handle! session-id user-id "encoded" "what was my question")]
      (is (= {:encoded_query "encoded" :prompt "what was my question"}
             (mcp.session/resolve-query-handle session-id user-id handle))))))

(deftest store-handle-cascades-with-core-session-test
  (testing "deleting the backing core_session cascades to its handles"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          handle     (mcp.session/store-handle! session-id user-id "payload")]
      (is (= "payload" (mcp.session/read-handle session-id user-id handle)))
      (t2/delete! :core_session :key_hashed (derived-hash session-id))
      (is (nil? (mcp.session/read-handle session-id user-id handle))
          "cascade should reap the handle when the core_session row goes"))))

(deftest delete-removes-handles-test
  (testing "delete! removes handles for the session"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          handle     (mcp.session/store-handle! session-id user-id "payload")
          _          (mcp.session/delete! session-id user-id)]
      (is (nil? (mcp.session/read-handle session-id user-id handle))))))

(deftest session-does-not-fire-login-event-test
  (testing "Creating a core_session via get-or-create-session-key! does not publish :event/user-login"
    (let [login-events (atom [])
          user-id      (mt/user->id :crowberto)
          session-id   (mcp.session/create! user-id)]
      (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic payload]
                                                          (when (= topic :event/user-login)
                                                            (swap! login-events conj payload)))]
        (mcp.session/get-or-create-session-key! session-id user-id))
      (is (empty? @login-events)
          "No :event/user-login should be published for MCP embedding sessions"))))
