(ns metabase.mcp.callback-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.session :as mcp.session]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- post-drill
  "POST /api/embed-mcp/drills as `user` (default :crowberto), with optional headers
   and an `expected-status` for non-200 cases."
  ([body extra-headers]
   (post-drill :crowberto 200 body extra-headers))
  ([user expected-status body extra-headers]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/drills"
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- post-mcp-feedback
  ([user expected-status body session-id]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/feedback"
                                {:request-options {:headers {"mcp-session-id" session-id}}}
                                body))
  ([user expected-status body]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/feedback"
                                body)))

(defn- post-drill-with-ui-credential
  [expected-status credential session-id]
  (client/client-full-response :post expected-status "embed-mcp/drills"
                               {:request-options {:headers {"x-metabase-mcp-ui-auth" credential
                                                            "mcp-session-id" session-id}}}
                               {:encodedQuery "ZW5jb2RlZA=="}))

(deftest drills-post-stores-handle-test
  (testing "POST returns a UUID handle"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          response   (post-drill {:encodedQuery "ZW5jb2RlZA=="}
                                 {"mcp-session-id" session-id})]
      (is (=? {:status 200
               :body   {:handle parse-uuid}}
              response)))))

(deftest drills-post-validates-session-header-test
  (testing "missing Mcp-Session-Id header returns 400"
    (is (=? {:status 400}
            (post-drill :crowberto 400 {:encodedQuery "ZW5jb2RlZA=="} {}))))
  (testing "non-UUID Mcp-Session-Id returns 404"
    (is (=? {:status 404}
            (post-drill :crowberto 404 {:encodedQuery "ZW5jb2RlZA=="}
                        {"mcp-session-id" "not-a-uuid"}))))
  (testing "session owned by a different user returns 404"
    (let [owner   (mt/user->id :crowberto)
          session (mcp.session/create! owner)
          _       (mcp.session/get-or-create-embedding-session! session owner)]
      (is (=? {:status 404}
              (post-drill :rasta 404 {:encodedQuery "ZW5jb2RlZA=="}
                          {"mcp-session-id" session}))))))

(deftest ui-credential-session-binding-test
  (let [user-id          (mt/user->id :crowberto)
        credential-id    (mcp.session/create! user-id)
        other-session-id (mcp.session/create! user-id)
        credential       (mcp.session/issue-ui-credential credential-id user-id)]
    (testing "a credential can use the callback surface for its own MCP session"
      (is (= 200 (:status (post-drill-with-ui-credential 200 credential credential-id)))))
    (testing "a credential cannot be reused with another MCP session"
      (is (= 404 (:status (post-drill-with-ui-credential 404 credential other-session-id)))))
    (testing "invalid and expired credentials are rejected"
      (is (= 401 (:status (post-drill-with-ui-credential 401 "not-a-credential" credential-id))))
      (with-redefs [mcp.session/ui-credential-lifetime-seconds -1]
        (is (= 401 (:status (post-drill-with-ui-credential
                             401
                             (mcp.session/issue-ui-credential credential-id user-id)
                             credential-id))))))))

(deftest drills-post-rejects-blank-body-test
  (testing "blank encodedQuery returns 400"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (is (=? {:status 400}
              (post-drill :crowberto 400 {:encodedQuery ""}
                          {"mcp-session-id" session-id}))))))

(deftest drills-post-requires-auth-test
  (testing "unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :post 401 "embed-mcp/drills"
                                         {:encodedQuery "ZW5jb2RlZA=="})))))

(deftest feedback-post-persists-mcp-visualization-feedback-test
  (testing "MCP feedback is persisted to mcp_feedback with the visualization context inline"
    (mt/with-model-cleanup [:model/McpFeedback]
      (let [session-id (mcp.session/create! (mt/user->id :rasta))
            body       {:feedback          {:positive          false
                                            :issue_type        "wrong-visualization"
                                            :freeform_feedback "wrong chart"}
                        :conversation_data {:source "mcp"
                                            :prompt "show orders"
                                            :query  "encoded-query"}}]
        (post-mcp-feedback :rasta 204 body session-id)
        (is (=? {:user_id           (mt/user->id :rasta)
                 :positive          false
                 :issue_type        "wrong-visualization"
                 :freeform_feedback "wrong chart"
                 :prompt            "show orders"
                 :query             "encoded-query"
                 :created_at        some?}
                (t2/select-one :model/McpFeedback :user_id (mt/user->id :rasta)
                               {:order-by [[:id :desc]]})))))))

(deftest feedback-post-persists-minimal-payload-test
  (testing "MCP feedback with only a rating persists a row with the optional fields nil"
    (mt/with-model-cleanup [:model/McpFeedback]
      (let [session-id (mcp.session/create! (mt/user->id :rasta))
            body       {:feedback          {:positive true}
                        :conversation_data {:source "mcp"}}]
        (post-mcp-feedback :rasta 204 body session-id)
        (is (=? {:user_id           (mt/user->id :rasta)
                 :positive          true
                 :issue_type        nil
                 :freeform_feedback nil
                 :prompt            nil
                 :query             nil}
                (t2/select-one :model/McpFeedback :user_id (mt/user->id :rasta)
                               {:order-by [[:id :desc]]})))))))

(deftest feedback-post-requires-metabot-enabled-test
  (testing "MCP feedback returns 403 and persists nothing when no metabot instance is enabled"
    (mt/with-model-cleanup [:model/McpFeedback]
      (mt/with-temporary-setting-values [metabot-enabled? false
                                         embedded-metabot-enabled? false]
        (let [session-id (mcp.session/create! (mt/user->id :rasta))
              body       {:feedback          {:positive true}
                          :conversation_data {:source "mcp"}}]
          (is (=? {:status 403}
                  (post-mcp-feedback :rasta 403 body session-id)))
          (is (zero? (t2/count :model/McpFeedback :user_id (mt/user->id :rasta)))))))))

(deftest feedback-post-rejects-oversized-free-text-test
  (testing "MCP feedback bounds user-controlled free text before persisting"
    (mt/with-model-cleanup [:model/McpFeedback]
      (let [session-id (mcp.session/create! (mt/user->id :rasta))
            too-large  (apply str (repeat 10001 "x"))
            base-body  {:feedback          {:positive true}
                        :conversation_data {:source "mcp"}}]
        (doseq [[path label] [[[:feedback :freeform_feedback] "freeform feedback"]
                              [[:conversation_data :prompt] "prompt"]
                              [[:conversation_data :query] "query"]]]
          (testing label
            (is (=? {:status 400}
                    (post-mcp-feedback :rasta 400 (assoc-in base-body path too-large) session-id)))))
        (is (zero? (t2/count :model/McpFeedback :user_id (mt/user->id :rasta)))
            "Oversized feedback payloads must not be persisted")))))

(deftest feedback-post-validates-session-header-test
  (testing "MCP feedback validates the MCP session header"
    (let [body {:feedback          {:positive true}
                :conversation_data {:source "mcp"
                                    :prompt "show orders"
                                    :query  "encoded-query"}}]
      (is (=? {:status 400}
              (post-mcp-feedback :rasta 400 body)))
      (is (=? {:status 404}
              (post-mcp-feedback :rasta 404 body "not-a-uuid")))
      (let [owner-session (mcp.session/create! (mt/user->id :crowberto))]
        (mcp.session/get-or-create-embedding-session! owner-session (mt/user->id :crowberto))
        (is (=? {:status 404}
                (post-mcp-feedback :rasta 404 body owner-session)))))))

;;; ------------------------------------------------- Bootstrap --------------------------------------------------

(defn- get-bootstrap
  ([user expected-status session-id]
   (client/client-full-response (test.users/username->token user)
                                :get expected-status "embed-mcp/bootstrap"
                                {:request-options {:headers {"mcp-session-id" session-id}}}))
  ([user expected-status]
   (client/client-full-response (test.users/username->token user)
                                :get expected-status "embed-mcp/bootstrap")))

(defn- get-bootstrap-with-ui-credential
  [expected-status credential session-id]
  (client/client-full-response :get expected-status "embed-mcp/bootstrap"
                               {:request-options {:headers {"x-metabase-mcp-ui-auth" credential
                                                            "mcp-session-id" session-id}}}))

(defn- bootstrap-for!
  [user]
  (:body (get-bootstrap user 200 (mcp.session/create! (mt/user->id user)))))

(deftest bootstrap-user-projection-test
  (testing "GHY-4400: the bootstrap user is a fixed projection, not whatever `GET /api/user/current` returns"
    (doseq [username [:crowberto :rasta]]
      (testing username
        (let [user (:user (bootstrap-for! username))]
          (is (= #{:id :locale :is_superuser :is_data_analyst :is_qbnewb
                   :tenant_id :personal_collection_id :permissions}
                 (set (keys user)))
              "Adding a field here must be a deliberate edit to ::bootstrap-user, not an accident")
          (is (= (mt/user->id username) (:id user)))
          (is (some? (:personal_collection_id user))
              "hydrated, not merely schema-optional — the iframe's collection picker reads it")
          (is (= #{:can_create_queries :can_create_native_queries}
                 (set (keys (:permissions user))))))))
    (testing "the projection still reports who the user is"
      (is (true? (:is_superuser (:user (bootstrap-for! :crowberto)))))
      (is (false? (:is_superuser (:user (bootstrap-for! :rasta))))))))

(deftest bootstrap-omits-admin-only-settings-test
  (testing "GHY-4400: an admin's credential reads only the settings a non-admin would, so a narrow MCP scope cannot
            widen into instance configuration"
    (let [admin-settings (:settings (bootstrap-for! :crowberto))]
      (is (contains? (mt/user-http-request :crowberto :get 200 "session/properties")
                     :custom-geojson-enabled)
          "`custom-geojson-enabled` is admin-visible, so it anchors this test only while it reaches admins")
      (is (not (contains? admin-settings :custom-geojson-enabled)))
      (is (contains? admin-settings :site-locale)
          "Settings a non-admin may read are still served")
      (is (= (set (keys (:settings (bootstrap-for! :rasta))))
             (set (keys admin-settings)))
          "the projection is the same whoever holds the credential"))))

(deftest bootstrap-validates-session-header-test
  (testing "bootstrap validates the MCP session header like the other callback routes"
    (is (=? {:status 400} (get-bootstrap :rasta 400)))
    (is (=? {:status 404} (get-bootstrap :rasta 404 "not-a-uuid")))
    (testing "a session owned by another user is rejected"
      (let [owner-session (mcp.session/create! (mt/user->id :crowberto))]
        (mcp.session/get-or-create-embedding-session! owner-session (mt/user->id :crowberto))
        (is (=? {:status 404} (get-bootstrap :rasta 404 owner-session)))))))

(deftest bootstrap-accepts-ui-credential-test
  (testing "the UI credential can bootstrap the iframe, and only for its own MCP session"
    (let [user-id          (mt/user->id :crowberto)
          credential-id    (mcp.session/create! user-id)
          other-session-id (mcp.session/create! user-id)
          credential       (mcp.session/issue-ui-credential credential-id user-id #{"agent:query:run"})]
      (is (=? {:status 200 :body {:user {:id user-id}}}
              (get-bootstrap-with-ui-credential 200 credential credential-id)))
      (is (= 404 (:status (get-bootstrap-with-ui-credential 404 credential other-session-id))))
      (is (= 401 (:status (get-bootstrap-with-ui-credential 401 "not-a-credential" credential-id)))))))
