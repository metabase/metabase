(ns metabase.mcp.session-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events.core :as events]
   [metabase.mcp.session :as mcp.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- recently-expired
  "Return a timestamp just past the 1-hour TTL, using DB time to match `ttl-cutoff`'s clock."
  []
  (t/minus (:now (t2/query-one {:select [[:%now :now]]}))
           (t/hours 1)
           (t/seconds 1)))

(deftest create-and-get-test
  (testing "create! returns a session ID that can be retrieved with get-valid"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          session    (mcp.session/get-valid session-id)]
      (is (string? session-id))
      (is (= {:user_id              user-id
              :initialized          false
              :embedding_session_key nil
              :embedding_session_id  nil}
             (select-keys session [:user_id :initialized :embedding_session_key :embedding_session_id]))))))

(deftest delete-test
  (testing "delete! removes the session"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      (mcp.session/delete! session-id)
      (is (nil? (mcp.session/get-valid session-id))))))

(deftest delete-cleans-up-embedding-session-test
  (testing "delete! also removes the associated embedding session from core_session"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          _          (mcp.session/get-or-create-embedding-session-key! session-id user-id)
          emb-id     (:embedding_session_id (t2/select-one :model/McpSession :id session-id))]
      (is (t2/exists? :model/Session :id emb-id))
      (mcp.session/delete! session-id)
      (is (not (t2/exists? :model/Session :id emb-id))
          "Embedding session should be deleted when MCP session is deleted"))))

(deftest mark-initialized-test
  (testing "mark-initialized! sets the initialized flag"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      (is (false? (:initialized (mcp.session/get-valid session-id))))
      (mcp.session/mark-initialized! session-id)
      (is (true? (:initialized (mcp.session/get-valid session-id)))))))

(deftest get-or-create-embedding-session-key-test
  (testing "first call creates an embedding session key and stores the FK"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          key        (mcp.session/get-or-create-embedding-session-key! session-id user-id)]
      (is (string? key))
      (is (:embedding_session_id (t2/select-one :model/McpSession :id session-id))
          "embedding_session_id FK should be set")
      (testing "subsequent calls return the same key"
        (is (= key (mcp.session/get-or-create-embedding-session-key! session-id user-id)))))))

(deftest get-valid-returns-nil-for-unknown-session-test
  (testing "get-valid returns nil for non-existent session IDs"
    (is (nil? (mcp.session/get-valid "nonexistent-session-id")))
    (is (nil? (mcp.session/get-valid nil)))
    (is (nil? (mcp.session/get-valid "")))))

(deftest get-valid-rejects-expired-session-test
  (testing "get-valid returns nil for sessions older than the TTL"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))]
      (is (some? (mcp.session/get-valid session-id))
          "Session is valid immediately after creation")
      (t2/update! :model/McpSession :id session-id {:created_at (recently-expired)})
      (is (nil? (mcp.session/get-valid session-id))
          "Session should be rejected after TTL expires"))))

(deftest sweep-expired-cleans-up-embedding-sessions-test
  (testing "sweep-expired! deletes expired MCP sessions and their embedding sessions"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          _          (mcp.session/get-or-create-embedding-session-key! session-id user-id)
          emb-id     (:embedding_session_id (t2/select-one :model/McpSession :id session-id))]
      (t2/update! :model/McpSession :id session-id {:created_at (recently-expired)})
      (is (t2/exists? :model/Session :id emb-id)
          "Embedding session exists before sweep")
      (mcp.session/sweep-expired!)
      (is (not (t2/exists? :model/McpSession :id session-id))
          "Expired MCP session should be deleted")
      (is (not (t2/exists? :model/Session :id emb-id))
          "Embedding session should be cleaned up by sweep"))))

(deftest embedding-session-does-not-fire-login-event-test
  (testing "Creating an embedding session via get-or-create-embedding-session-key! does not publish :event/user-login"
    (let [login-events (atom [])
          user-id      (mt/user->id :crowberto)
          session-id   (mcp.session/create! user-id)]
      (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic payload]
                                                          (when (= topic :event/user-login)
                                                            (swap! login-events conj payload)))]
        (mcp.session/get-or-create-embedding-session-key! session-id user-id))
      (is (empty? @login-events)
          "No :event/user-login should be published for internal embedding sessions"))))

