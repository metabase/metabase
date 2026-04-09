(ns metabase.mcp.session-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.mcp.session :as mcp.session]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- derived-hash
  "Derives the embedding session key from an MCP session id, then hashes it."
  [session-id]
  (session/hash-session-key (mcp.session/derive-embedding-session-key session-id)))

(deftest create-returns-uuid-string-test
  (testing "create! returns a UUID string without writing to the database"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      (is (string? session-id))
      (is (some? (parse-uuid session-id)))
      (is (not (t2/exists? :core_session :key_hashed (derived-hash session-id)))
          "No core_session should exist yet"))))

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
