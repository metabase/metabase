(ns metabase.mcp.callback-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.ui-test-util :as ui.tu]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- drill-body
  "A drills request body: a sort drill on a venues handle owned by `user-id`."
  [user-id]
  (let [mp (mt/metadata-provider)]
    {:handle    (ui.tu/store-query-handle! (mcp.session/create! user-id) user-id
                                           (lib/query mp (lib.metadata/table mp (mt/id :venues))))
     :operation {:type "drill-thru" :drill "sort" :context {:column "PRICE"} :direction "asc"}}))

(defn- post-drill
  [auth expected-status]
  (ui.tu/ui-request auth :post expected-status "embed-mcp/drills"
                    (drill-body (or (:user-id auth) (mt/user->id :rasta)))))

(defn- post-mcp-feedback
  [auth expected-status body]
  (ui.tu/ui-request auth :post expected-status "embed-mcp/feedback" body))

(defn- foreign-session-auth
  "A credential for rasta minted for an MCP session whose backing row belongs to crowberto."
  []
  (let [owner         (mt/user->id :crowberto)
        owner-session (mcp.session/create! owner)]
    (mcp.session/get-or-create-embedding-session! owner-session owner)
    {:user-id    (mt/user->id :rasta)
     :session-id owner-session
     :credential (mcp.session/issue-ui-credential owner-session (mt/user->id :rasta) ui.tu/query-scopes)}))

(deftest drills-post-stores-handle-test
  (testing "POST returns a UUID handle"
    (is (=? {:status 200
             :body   {:handle parse-uuid}}
            (post-drill (ui.tu/ui-auth! :crowberto) 200)))))

(deftest drills-post-validates-session-header-test
  (let [auth (ui.tu/ui-auth! :crowberto)]
    (testing "missing Mcp-Session-Id header returns 400"
      (is (=? {:status 400}
              (post-drill (dissoc auth :session-id) 400))))
    (testing "non-UUID Mcp-Session-Id returns 404"
      (is (=? {:status 404}
              (post-drill (assoc auth :session-id "not-a-uuid") 404)))))
  (testing "session owned by a different user returns 404"
    (is (=? {:status 404}
            (post-drill (foreign-session-auth) 404)))))

(deftest ui-credential-session-binding-test
  (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :crowberto)
        other-session-id                      (mcp.session/create! user-id)]
    (testing "a credential can use the callback surface for its own MCP session"
      (is (= 200 (:status (post-drill auth 200)))))
    (testing "a credential cannot be reused with another MCP session"
      (is (= 404 (:status (post-drill (assoc auth :session-id other-session-id) 404)))))
    (testing "invalid and expired credentials are rejected"
      (is (= 401 (:status (post-drill (assoc auth :credential "not-a-credential") 401))))
      (with-redefs [mcp.session/ui-credential-lifetime-seconds -1]
        (is (= 401 (:status (post-drill (assoc auth :credential (mcp.session/issue-ui-credential
                                                                 session-id user-id ui.tu/query-scopes))
                                        401))))))))

(deftest drills-post-rejects-blank-body-test
  (testing "a blank handle returns 400"
    (is (=? {:status 400}
            (ui.tu/ui-request (ui.tu/ui-auth! :crowberto) :post 400 "embed-mcp/drills"
                              (assoc (drill-body (mt/user->id :crowberto)) :handle ""))))))

(deftest drills-post-requires-auth-test
  (testing "unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :post 401 "embed-mcp/drills"
                                         (drill-body (mt/user->id :rasta)))))))

(deftest iframe-handlers-refuse-a-session-test
  (testing "The iframe handlers authenticate only the UI credential. A logged-in session is not a credential, so it
            is refused like an anonymous request, even with a valid MCP session id."
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))
          request    (fn [method url & [body]]
                       (apply client/client-full-response (test.users/username->token :crowberto)
                              method 401 url
                              {:request-options {:headers {"mcp-session-id" session-id}}}
                              (when body [body])))]
      (is (= 401 (:status (request :get "embed-mcp/bootstrap"))))
      (is (= 401 (:status (request :post "embed-mcp/drills" (drill-body (mt/user->id :crowberto))))))
      (is (= 401 (:status (request :post "embed-mcp/feedback" {:feedback          {:positive true}
                                                               :conversation_data {:source "mcp"}}))))
      (is (= 401 (:status (request :get (str "embed-mcp/queries/" (random-uuid)))))))))

(deftest feedback-post-persists-mcp-visualization-feedback-test
  (testing "MCP feedback is persisted to mcp_feedback with the visualization context inline"
    (mt/with-model-cleanup [:model/McpFeedback]
      (post-mcp-feedback (ui.tu/ui-auth! :rasta) 204 {:feedback          {:positive          false
                                                                          :issue_type        "wrong-visualization"
                                                                          :freeform_feedback "wrong chart"}
                                                      :conversation_data {:source "mcp"
                                                                          :prompt "show orders"
                                                                          :query  "encoded-query"}})
      (is (=? {:user_id           (mt/user->id :rasta)
               :positive          false
               :issue_type        "wrong-visualization"
               :freeform_feedback "wrong chart"
               :prompt            "show orders"
               :query             "encoded-query"
               :created_at        some?}
              (t2/select-one :model/McpFeedback :user_id (mt/user->id :rasta)
                             {:order-by [[:id :desc]]}))))))

(deftest feedback-post-persists-minimal-payload-test
  (testing "MCP feedback with only a rating persists a row with the optional fields nil"
    (mt/with-model-cleanup [:model/McpFeedback]
      (post-mcp-feedback (ui.tu/ui-auth! :rasta) 204 {:feedback          {:positive true}
                                                      :conversation_data {:source "mcp"}})
      (is (=? {:user_id           (mt/user->id :rasta)
               :positive          true
               :issue_type        nil
               :freeform_feedback nil
               :prompt            nil
               :query             nil}
              (t2/select-one :model/McpFeedback :user_id (mt/user->id :rasta)
                             {:order-by [[:id :desc]]}))))))

(deftest feedback-post-requires-metabot-enabled-test
  (testing "MCP feedback returns 403 and persists nothing when no metabot instance is enabled"
    (mt/with-model-cleanup [:model/McpFeedback]
      (mt/with-temporary-setting-values [metabot-enabled? false
                                         embedded-metabot-enabled? false]
        (is (=? {:status 403}
                (post-mcp-feedback (ui.tu/ui-auth! :rasta) 403 {:feedback          {:positive true}
                                                                :conversation_data {:source "mcp"}})))
        (is (zero? (t2/count :model/McpFeedback :user_id (mt/user->id :rasta))))))))

(deftest feedback-post-rejects-oversized-free-text-test
  (testing "MCP feedback bounds user-controlled free text before persisting"
    (mt/with-model-cleanup [:model/McpFeedback]
      (let [too-large (apply str (repeat 10001 "x"))
            base-body {:feedback          {:positive true}
                       :conversation_data {:source "mcp"}}]
        (doseq [[path label] [[[:feedback :freeform_feedback] "freeform feedback"]
                              [[:conversation_data :prompt] "prompt"]
                              [[:conversation_data :query] "query"]]]
          (testing label
            (is (=? {:status 400}
                    (post-mcp-feedback (ui.tu/ui-auth! :rasta) 400 (assoc-in base-body path too-large))))))
        (is (zero? (t2/count :model/McpFeedback :user_id (mt/user->id :rasta)))
            "Oversized feedback payloads must not be persisted")))))

(deftest feedback-post-validates-session-header-test
  (testing "MCP feedback validates the MCP session header"
    (let [body {:feedback          {:positive true}
                :conversation_data {:source "mcp"
                                    :prompt "show orders"
                                    :query  "encoded-query"}}
          auth (ui.tu/ui-auth! :rasta)]
      (is (=? {:status 400}
              (post-mcp-feedback (dissoc auth :session-id) 400 body)))
      (is (=? {:status 404}
              (post-mcp-feedback (assoc auth :session-id "not-a-uuid") 404 body)))
      (is (=? {:status 404}
              (post-mcp-feedback (foreign-session-auth) 404 body))))))

;;; ------------------------------------------------- Bootstrap --------------------------------------------------

(defn- get-bootstrap
  [auth expected-status]
  (ui.tu/ui-request auth :get expected-status "embed-mcp/bootstrap"))

(defn- bootstrap-for!
  [username]
  (:body (get-bootstrap (ui.tu/ui-auth! username) 200)))

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
    (let [auth (ui.tu/ui-auth! :rasta)]
      (is (=? {:status 400} (get-bootstrap (dissoc auth :session-id) 400)))
      (is (=? {:status 404} (get-bootstrap (assoc auth :session-id "not-a-uuid") 404))))
    (testing "a session owned by another user is rejected"
      (is (=? {:status 404} (get-bootstrap (foreign-session-auth) 404))))))

(deftest bootstrap-accepts-ui-credential-test
  (testing "the UI credential can bootstrap the iframe, and only for its own MCP session"
    (let [{:keys [user-id] :as auth} (ui.tu/ui-auth! :crowberto)
          other-session-id           (mcp.session/create! user-id)]
      (is (=? {:status 200 :body {:user {:id user-id}}}
              (get-bootstrap auth 200)))
      (is (= 404 (:status (get-bootstrap (assoc auth :session-id other-session-id) 404))))
      (is (= 401 (:status (get-bootstrap (assoc auth :credential "not-a-credential") 401)))))))

;;; --------------------------------------- GET /queries/:handle ---------------------------------------------

(defn- get-query-by-handle
  "GET /api/embed-mcp/queries/:handle with a UI credential, the way the iframe calls it."
  [auth expected-status handle]
  (ui.tu/ui-request auth :get expected-status (str "embed-mcp/queries/" handle)))

(deftest queries-get-resolves-handle-test
  (testing "the iframe exchanges a handle for the encoded query and its prompt"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :crowberto)
            handle (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==" "show me orders")]
        (is (=? {:status 200
                 :body   {:query "ZW5jb2RlZA==" :prompt "show me orders"}}
                (get-query-by-handle auth 200 handle))))))
  (testing "a handle stored without a prompt resolves with a nil one"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :crowberto)
            handle (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==")]
        (is (=? {:status 200
                 :body   {:query "ZW5jb2RlZA==" :prompt nil}}
                (get-query-by-handle auth 200 handle)))))))

(deftest queries-get-is-user-scoped-test
  (testing "a handle minted by another user is not resolvable, even with a valid credential"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [owner-id      (mt/user->id :crowberto)
            owner-session (mcp.session/create! owner-id)
            handle        (mcp.session/store-handle! owner-session owner-id "ZW5jb2RlZA==")]
        (is (= 404 (:status (get-query-by-handle (ui.tu/ui-auth! :rasta) 404 handle))))))))

(deftest queries-get-rejects-bad-input-test
  (let [auth (ui.tu/ui-auth! :crowberto)]
    (testing "an unknown handle is a 404, not a 500"
      (is (= 404 (:status (get-query-by-handle auth 404 (str (random-uuid)))))))
    (testing "a non-UUID handle matches no iframe route"
      (is (= 404 (:status (get-query-by-handle auth 404 "not-a-uuid")))))
    (testing "an invalid credential is rejected"
      (is (= 401 (:status (get-query-by-handle (assoc auth :credential "not-a-credential") 401
                                               (str (random-uuid)))))))))

(deftest query-routes-cost-the-query-scope-test
  (testing "GHY-4400: a credential whose minting session lacked agent:query:run is refused the query routes, while
            the routes that cost no scope still serve it"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :crowberto #{"agent:search"})
            handle (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==")]
        (is (= 403 (:status (post-drill auth 403))))
        (is (= 403 (:status (get-query-by-handle auth 403 handle))))
        (is (= 200 (:status (get-bootstrap auth 200))))))))
