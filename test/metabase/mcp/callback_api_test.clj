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

(defn- post-context
  "POST /api/embed-mcp/context as `user` (default :crowberto), with optional
   headers and an `expected-status` for non-200 cases."
  ([body extra-headers]
   (post-context :crowberto 200 body extra-headers))
  ([user expected-status body extra-headers]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/context"
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- delete-context
  "DELETE /api/embed-mcp/context/:view-instance-id as `user` (default :crowberto)."
  ([view-instance-id extra-headers]
   (delete-context :crowberto 200 view-instance-id extra-headers))
  ([user expected-status view-instance-id extra-headers]
   (client/client-full-response (test.users/username->token user)
                                :delete expected-status (str "embed-mcp/context/" view-instance-id)
                                {:request-options {:headers extra-headers}})))

(defn- touch-context
  "POST /api/embed-mcp/context/:view-instance-id/touch as `user` (default :crowberto)."
  ([view-instance-id extra-headers]
   (touch-context :crowberto 200 view-instance-id extra-headers))
  ([user expected-status view-instance-id extra-headers]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status (str "embed-mcp/context/" view-instance-id "/touch")
                                {:request-options {:headers extra-headers}}
                                {})))

(deftest drills-post-stores-handle-test
  (testing "POST returns a UUID handle that round-trips through read-handle"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          response   (post-drill {:encodedQuery "ZW5jb2RlZA=="}
                                 {"mcp-session-id" session-id})
          handle     (get-in response [:body :handle])]
      (is (=? {:status 200
               :body   {:handle parse-uuid}}
              response))
      (is (= "ZW5jb2RlZA==" (mcp.session/read-handle handle))))))

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
          _       (mcp.session/get-or-create-session-key! session owner)]
      (is (=? {:status 404}
              (post-drill :rasta 404 {:encodedQuery "ZW5jb2RlZA=="}
                          {"mcp-session-id" session}))))))

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

(deftest context-post-stores-view-context-test
  (testing "POST stores drill encodedQuery as a query handle and drops the raw payload"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          response   (post-context {:viewInstanceId "view-1"
                                    :activeViewRole "drill"
                                    :visibleViews   [{:viewId       "drill"
                                                      :role         "drill"
                                                      :active       true
                                                      :name         "Drill table"
                                                      :display      "table"
                                                      :encodedQuery "ZW5jb2RlZA=="
                                                      :nextCard     {:display       "table"
                                                                     :dataset_query {:database 1}}}]
                                    :recentViews    []}
                                   {"mcp-session-id" session-id})
          handle     (-> response :body :context :visibleViews first :query_handle)]
      (is (=? {:status 200
               :body   {:context {:viewInstanceId "view-1"
                                  :visibleViews   [{:query_handle parse-uuid
                                                    :nextCard     {:display       "table"
                                                                   :dataset_query {:database 1}}}]}
                        :contexts [{:viewInstanceId "view-1"
                                    :visibleViews   [{:query_handle parse-uuid
                                                      :nextCard     {:display       "table"
                                                                     :dataset_query {:database 1}}}]}]}}
              response))
      (is (nil? (-> response :body :context :visibleViews first :encodedQuery)))
      (is (nil? (-> response :body :contexts first :visibleViews first :encodedQuery)))
      (is (= "ZW5jb2RlZA==" (mcp.session/read-handle handle)))
      (is (= 1 (t2/count :model/McpViewContext :mcp_session_id session-id))))))

(deftest context-post-returns-merged-session-contexts-test
  (testing "POST returns latest contexts for the current MCP session only"
    (let [user-id       (mt/user->id :crowberto)
          session-id    (mcp.session/create! user-id)
          other-session (mcp.session/create! user-id)]
      (mcp.session/upsert-view-context! other-session user-id
                                        {:viewInstanceId "other-view"
                                         :visibleViews   [{:name "Other"}]})
      (post-context {:viewInstanceId "view-1"
                     :visibleViews   [{:name "First"}]}
                    {"mcp-session-id" session-id})
      (let [response (post-context {:viewInstanceId "view-2"
                                    :visibleViews   [{:name "Second"}]}
                                   {"mcp-session-id" session-id})]
        (is (= 200 (:status response)))
        (is (= #{"view-1" "view-2"}
               (set (map :viewInstanceId (get-in response [:body :contexts])))))
        (is (= #{"First" "Second"}
               (set (map #(-> % :visibleViews first :name)
                         (get-in response [:body :contexts])))))))))

(deftest context-post-validates-session-header-test
  (testing "missing Mcp-Session-Id header returns 400"
    (is (=? {:status 400}
            (post-context :crowberto 400 {:viewInstanceId "view-1"} {}))))

  (testing "non-UUID Mcp-Session-Id returns 404"
    (is (=? {:status 404}
            (post-context :crowberto 404 {:viewInstanceId "view-1"}
                          {"mcp-session-id" "not-a-uuid"}))))

  (testing "session owned by a different user returns 404"
    (let [owner   (mt/user->id :crowberto)
          session (mcp.session/create! owner)
          _       (mcp.session/get-or-create-session-key! session owner)]
      (is (=? {:status 404}
              (post-context :rasta 404 {:viewInstanceId "view-1"}
                            {"mcp-session-id" session}))))))

(deftest context-post-rejects-missing-view-instance-id-test
  (testing "missing viewInstanceId returns 400"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (is (=? {:status 400}
              (post-context :crowberto 400 {:visibleViews []}
                            {"mcp-session-id" session-id}))))))

(deftest context-post-updates-existing-view-instance-test
  (testing "posting the same viewInstanceId updates one row"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (post-context {:viewInstanceId "view-1"
                     :visibleViews   [{:name "First"}]}
                    {"mcp-session-id" session-id})
      (post-context {:viewInstanceId "view-1"
                     :visibleViews   [{:name "Second"}]}
                    {"mcp-session-id" session-id})
      (is (= 1 (t2/count :model/McpViewContext :mcp_session_id session-id)))
      (is (= "Second" (get-in (first (mcp.session/read-view-contexts session-id 5))
                              [:visibleViews 0 :name]))))))

(deftest context-delete-removes-view-instance-test
  (testing "DELETE removes only the requested view instance for the MCP session"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (post-context {:viewInstanceId "view-1"
                     :visibleViews   [{:name "First"}]}
                    {"mcp-session-id" session-id})
      (post-context {:viewInstanceId "view-2"
                     :visibleViews   [{:name "Second"}]}
                    {"mcp-session-id" session-id})
      (is (=? {:status 200
               :body   {:ok true}}
              (delete-context "view-1" {"mcp-session-id" session-id})))
      (is (= ["view-2"] (mapv :viewInstanceId (mcp.session/read-view-contexts session-id 5)))))))

(deftest context-touch-refreshes-view-instance-test
  (testing "POST touch refreshes a view context heartbeat"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (post-context {:viewInstanceId "view-1"
                     :visibleViews   [{:name "First"}]}
                    {"mcp-session-id" session-id})
      (is (=? {:status 200
               :body   {:contexts [{:viewInstanceId "view-1"}]}}
              (touch-context "view-1" {"mcp-session-id" session-id}))))))

(deftest context-post-requires-auth-test
  (testing "unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :post 401 "embed-mcp/context"
                                         {:viewInstanceId "view-1"})))))
