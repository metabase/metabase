(ns metabase.mcp.session-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.mcp.session :as mcp.session]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

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

(deftest store-and-read-handle-test
  (testing "store-handle! returns a UUID handle that read-handle resolves to the encoded query"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          h1         (mcp.session/store-handle! session-id user-id "first")
          h2         (mcp.session/store-handle! session-id user-id "second")]
      (is (some? (parse-uuid h1)) "store-handle! must return a UUID string")
      (is (some? (parse-uuid h2)))
      (is (not= h1 h2) "successive calls must produce distinct handles")
      (is (= "first"  (mcp.session/read-handle h1)))
      (is (= "second" (mcp.session/read-handle h2)))
      (is (nil? (mcp.session/read-handle (str (random-uuid))))
          "read-handle returns nil for unknown handles"))))

(deftest store-handle-cascades-with-core-session-test
  (testing "deleting the backing core_session cascades to its handles"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          handle     (mcp.session/store-handle! session-id user-id "payload")]
      (is (= "payload" (mcp.session/read-handle handle)))
      (t2/delete! :core_session :key_hashed (derived-hash session-id))
      (is (nil? (mcp.session/read-handle handle))
          "cascade should reap the handle when the core_session row goes"))))

(deftest delete-removes-handles-test
  (testing "delete! removes handles for the session"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          handle     (mcp.session/store-handle! session-id user-id "payload")
          _          (mcp.session/delete! session-id user-id)]
      (is (nil? (mcp.session/read-handle handle))))))

(deftest upsert-view-context-replaces-existing-test
  (testing "upserting the same view instance replaces context instead of creating duplicate rows"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          context    {:viewInstanceId "view-1"
                      :activeViewRole "drill"
                      :visibleViews   [{:viewId       "drill"
                                        :role         "drill"
                                        :active       true
                                        :name         "Drill result"
                                        :display      "table"
                                        :encodedQuery "first"}]}]
      (let [stored (mcp.session/upsert-view-context! session-id user-id context)
            handle (get-in stored [:visibleViews 0 :query_handle])]
        (is (some? (parse-uuid handle)))
        (is (= "first" (mcp.session/read-handle handle)))
        (is (nil? (get-in stored [:visibleViews 0 :encodedQuery])))
        (is (= 1 (t2/count :model/McpViewContext :mcp_session_id session-id))))
      (let [stored (mcp.session/upsert-view-context! session-id user-id
                                                     (assoc-in context [:visibleViews 0 :encodedQuery] "second"))
            handle (get-in stored [:visibleViews 0 :query_handle])]
        (is (= "second" (mcp.session/read-handle handle)))
        (is (= 1 (t2/count :model/McpViewContext :mcp_session_id session-id)))
        (is (= "Drill result" (get-in (first (mcp.session/read-view-contexts session-id 5))
                                      [:visibleViews 0 :name])))))))

(deftest view-context-cascades-with-core-session-test
  (testing "deleting the backing core_session cascades to view contexts"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (mcp.session/upsert-view-context! session-id user-id
                                        {:viewInstanceId "view-1"
                                         :visibleViews   []})
      (is (= 1 (t2/count :model/McpViewContext :mcp_session_id session-id)))
      (t2/delete! :core_session :key_hashed (derived-hash session-id))
      (is (zero? (t2/count :model/McpViewContext :mcp_session_id session-id))))))

(deftest delete-removes-view-contexts-test
  (testing "delete! removes stored view contexts for the session"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (mcp.session/upsert-view-context! session-id user-id
                                        {:viewInstanceId "view-1"
                                         :visibleViews   []})
      (mcp.session/delete! session-id user-id)
      (is (empty? (mcp.session/read-view-contexts session-id 5))))))

(deftest view-contexts-are-isolated-by-mcp-session-test
  (testing "read-view-contexts only returns contexts for the requested MCP session"
    (let [user-id    (mt/user->id :crowberto)
          session-a  (mcp.session/create! user-id)
          session-b  (mcp.session/create! user-id)]
      (mcp.session/upsert-view-context! session-a user-id
                                        {:viewInstanceId "view-a"
                                         :visibleViews   [{:name "A"}]})
      (mcp.session/upsert-view-context! session-b user-id
                                        {:viewInstanceId "view-b"
                                         :visibleViews   [{:name "B"}]})
      (is (= ["A"] (mapv #(get-in % [:visibleViews 0 :name])
                         (mcp.session/read-view-contexts session-a 5))))
      (is (= ["B"] (mapv #(get-in % [:visibleViews 0 :name])
                         (mcp.session/read-view-contexts session-b 5)))))))

(deftest read-view-contexts-only-returns-recently-touched-contexts-test
  (testing "old iframe contexts are ignored until they heartbeat again"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (mcp.session/upsert-view-context! session-id user-id
                                        {:viewInstanceId "old-view"
                                         :visibleViews   [{:name "Old"}]})
      (mcp.session/upsert-view-context! session-id user-id
                                        {:viewInstanceId "live-view"
                                         :visibleViews   [{:name "Live"}]})
      (t2/update! :model/McpViewContext
                  {:mcp_session_id session-id
                   :view_instance_id "old-view"}
                  {:updated_at (OffsetDateTime/parse "2000-01-01T00:00:00Z")})
      (is (= ["Live"] (mapv #(get-in % [:visibleViews 0 :name])
                            (mcp.session/read-view-contexts session-id 5))))
      (mcp.session/touch-view-context! session-id user-id "old-view")
      (is (= #{"Old" "Live"}
             (set (map #(get-in % [:visibleViews 0 :name])
                       (mcp.session/read-view-contexts session-id 5))))))))

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
