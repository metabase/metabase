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
        (mcp.session/get-or-create-session-key! owner-session (mt/user->id :crowberto))
        (is (=? {:status 404}
                (post-mcp-feedback :rasta 404 body owner-session)))))))
