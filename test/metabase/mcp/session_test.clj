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

(deftest create-returns-uuid-string-test
  (testing "create! returns a UUID string without writing to the database"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      (is (string? session-id))
      (is (some? (parse-uuid session-id)))
      (is (not (t2/exists? :core_session :key_hashed (session/hash-session-key session-id)))
          "No core_session should exist yet"))))

(deftest get-or-create-session-key-test
  (testing "first call creates a core_session and returns the session-id as the key"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          key        (mcp.session/get-or-create-session-key! session-id user-id)]
      (is (= session-id key))
      (is (t2/exists? :core_session :key_hashed (session/hash-session-key session-id))
          "core_session should now exist")
      (testing "subsequent calls return the same key and don't create duplicates"
        (is (= key (mcp.session/get-or-create-session-key! session-id user-id)))
        (is (= 1 (t2/count :core_session :key_hashed (session/hash-session-key session-id))))))))

(deftest delete-test
  (testing "delete! removes the core_session if one was created"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          _          (mcp.session/get-or-create-session-key! session-id user-id)]
      (is (t2/exists? :core_session :key_hashed (session/hash-session-key session-id)))
      (mcp.session/delete! session-id)
      (is (not (t2/exists? :core_session :key_hashed (session/hash-session-key session-id)))))))

(deftest delete-noop-without-session-test
  (testing "delete! is a no-op when no core_session was ever created"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      ;; Should not throw — just a no-op delete
      (mcp.session/delete! session-id))))

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
