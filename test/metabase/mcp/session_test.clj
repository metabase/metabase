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
  "Derives a user's embedding session key, then hashes it the way core_session stores it."
  [user-id]
  (session/hash-session-key (mcp.session/derive-embedding-session-key user-id)))

(defn- session-correlator
  [session-id]
  (first (str/split session-id #"\.")))

(defn- extended-session-id
  [payload]
  (str (random-uuid)
       "."
       (->> (.getBytes (json/encode payload) StandardCharsets/UTF_8)
            (.encodeToString (.withoutPadding (Base64/getUrlEncoder))))))

;;; ------------------------------------------ Client capability hint ---------------------------------------------

(deftest create-mints-an-opaque-correlator-test
  (testing "create! mints a session id with a UUID correlator, and two of them never collide"
    (let [session-id (mcp.session/create! {:supports-mcp-ui? true})]
      (is (string? session-id))
      (is (some? (parse-uuid (session-correlator session-id))))
      (is (not= session-id (mcp.session/create! {:supports-mcp-ui? true}))))))

(deftest session-ui-capability-is-self-describing-test
  (testing "create! encodes MCP Apps UI support into the id itself, so nothing has to be stored"
    (let [ui-session-id    (mcp.session/create! {:supports-mcp-ui? true})
          plain-session-id (mcp.session/create! {:supports-mcp-ui? false})]
      (is (= 2 (count (str/split ui-session-id #"\.")))
          "A session id is a UUID correlator plus a base64url JSON capability hint")
      (is (true? (mcp.session/supports-mcp-ui? ui-session-id)))
      (is (false? (mcp.session/supports-mcp-ui? plain-session-id))))))

(deftest create-session-id-length-test
  (testing "generated session ids stay within header and log-column limits"
    (is (<= (count (mcp.session/create! {:supports-mcp-ui? true})) 254)))
  (testing "payload growth fails early in dev and tests"
    (mt/with-dynamic-fn-redefs [mcp.session/encode-capability-payload (fn [_payload]
                                                                        (apply str (repeat 300 "x")))]
      (is (thrown-with-msg? AssertionError
                            #"MCP session id is too long"
                            (mcp.session/create! {:supports-mcp-ui? true}))))))

(deftest session-parts-rejects-ids-we-never-minted-test
  (testing "an id this server minted parses back to its correlator"
    (let [session-id (mcp.session/create! {:supports-mcp-ui? true})]
      (is (=? {:uuid uuid?} (mcp.session/session-parts session-id)))))
  (testing "anything else does not parse. The header carrying it is client-controlled and its value
            reaches a log column, so parsing is what keeps a client from writing strings of its choosing
            into the analytics tables"
    (doseq [session-id [nil
                        ""
                        "not-a-session-id"
                        "../../etc/passwd"
                        "'; DROP TABLE mcp_tool_call_log; --"
                        (str (random-uuid) "." (random-uuid) "." (random-uuid))
                        (apply str (repeat 500 "x"))]]
      (testing (pr-str session-id)
        (is (nil? (mcp.session/session-parts session-id))))))
  (testing "an id longer than a header or log column should hold is refused even when it is well-formed"
    (is (nil? (mcp.session/session-parts (extended-session-id {:v 1 :ui true :pad (apply str (repeat 300 "x"))}))))))

(deftest supports-mcp-ui-without-a-hint-test
  (testing "an id carrying no capability hint tells us nothing, and neither does no id at all — the
            caller decides what an absent hint means"
    (is (nil? (mcp.session/supports-mcp-ui? nil)))
    (is (nil? (mcp.session/supports-mcp-ui? "not-a-session-id")))
    (is (nil? (mcp.session/supports-mcp-ui? (str (random-uuid))))
        "a plain UUID id predates capability hints")
    (is (nil? (mcp.session/supports-mcp-ui? (str (random-uuid) ".not-base64")))
        "an undecodable hint is no hint")))

(deftest capability-payload-versioning-test
  (testing "a readable hint carries the UI capability through"
    (is (true? (mcp.session/supports-mcp-ui? (extended-session-id {:v 1 :ui true}))))
    (is (false? (mcp.session/supports-mcp-ui? (extended-session-id {:v 1 :ui false})))))
  (testing "a hint this node cannot read degrades to no UI rather than erroring — during a rolling
            deploy a newer node may mint a hint shape this one does not know"
    (is (false? (mcp.session/supports-mcp-ui? (extended-session-id {:v 2 :ui true}))))
    (is (false? (mcp.session/supports-mcp-ui? (extended-session-id {:v 1}))))))

;;; ------------------------------------------ Embedding session key ----------------------------------------------

(deftest derive-embedding-session-key-is-uuid-formatted-test
  (testing "derived key is UUID-formatted so it passes server.middleware.session/valid-session-key?"
    ;; If this regresses, the embedding SDK iframe will get 403s from /api when it sends the
    ;; derived key as X-Metabase-Session, because the middleware rejects non-UUID keys up-front.
    (let [key    (mcp.session/derive-embedding-session-key (mt/user->id :crowberto))
          parsed (parse-uuid key)]
      (is (some? parsed)
          "derive-embedding-session-key must return a UUID-formatted string")
      (is (= 8 (.version ^java.util.UUID parsed))
          "should be a v8 (custom/vendor-defined) UUID per RFC 9562")
      (is (= 2 (.variant ^java.util.UUID parsed))
          "should carry the RFC 4122 variant (10xx)"))))

(deftest derive-embedding-session-key-is-per-user-test
  (testing "each user derives their own key, and it is stable across connections"
    (let [crowberto (mcp.session/derive-embedding-session-key (mt/user->id :crowberto))
          rasta     (mcp.session/derive-embedding-session-key (mt/user->id :rasta))]
      (is (not= crowberto rasta))
      (is (= crowberto (mcp.session/derive-embedding-session-key (mt/user->id :crowberto)))))))

(deftest get-or-create-session-key-test
  (testing "first call creates a core_session and returns the derived embedding key"
    (let [user-id (mt/user->id :crowberto)
          key     (mcp.session/get-or-create-session-key! user-id)]
      (is (= (mcp.session/derive-embedding-session-key user-id) key))
      (is (t2/exists? :core_session :key_hashed (derived-hash user-id))
          "core_session should now exist")
      (testing "a later cold request returns the same key and does not create a duplicate"
        (is (= key (mcp.session/get-or-create-session-key! user-id)))
        (is (= 1 (t2/count :core_session :key_hashed (derived-hash user-id))))))))

(deftest session-does-not-fire-login-event-test
  (testing "Creating a core_session via get-or-create-session-key! does not publish :event/user-login"
    (let [login-events (atom [])
          user-id      (mt/user->id :crowberto)]
      (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic payload]
                                                          (when (= topic :event/user-login)
                                                            (swap! login-events conj payload)))]
        (mcp.session/get-or-create-session-key! user-id))
      (is (empty? @login-events)
          "No :event/user-login should be published for MCP embedding sessions"))))
