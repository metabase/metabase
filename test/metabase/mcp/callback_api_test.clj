(ns metabase.mcp.callback-api-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.mcp.session :as mcp.session]
   [metabase.metabot.config :as metabot.config]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]))

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
  (testing "POST returns a UUID handle that round-trips through read-handle"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          response   (post-drill {:encodedQuery "ZW5jb2RlZA=="}
                                 {"mcp-session-id" session-id})
          handle     (get-in response [:body :handle])]
      (is (=? {:status 200
               :body   {:handle parse-uuid}}
              response))
      (is (= "ZW5jb2RlZA==" (mcp.session/read-handle session-id handle))))))

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

(deftest feedback-post-submits-mcp-visualization-context-test
  (testing "MCP feedback accepts visualization context without a Metabot message row"
    (let [store-url    "http://hm.example"
          fake-token   "test-fake-token-for-feedback"
          session-id   (mcp.session/create! (mt/user->id :rasta))
          captured     (atom nil)
          body         {:feedback          {:message_id        (str (random-uuid))
                                            :positive          false
                                            :issue_type        "wrong-visualization"
                                            :freeform_feedback "wrong chart"}
                        :conversation_data {:source "mcp"
                                            :prompt "show orders"
                                            :query  "encoded-query"}}
          expected-url (str store-url "/api/v2/metabot/feedback/" fake-token)]
      (mt/with-temporary-setting-values [store-api-url store-url]
        (mt/with-dynamic-fn-redefs
          [premium-features/premium-embedding-token (constantly fake-token)
           http/post (fn [url opts]
                       (reset! captured {:url  url
                                         :opts opts
                                         :body (json/decode+kw (:body opts))}))]
          (post-mcp-feedback :rasta 204 body session-id)
          (is (= expected-url (:url @captured)))
          (is (pos-int? (get-in @captured [:opts :conn-timeout])))
          (is (pos-int? (get-in @captured [:opts :socket-timeout])))
          (is (= (metabot.config/normalize-metabot-id metabot.config/embedded-metabot-id)
                 (get-in @captured [:body :metabot_id])))
          (is (= (:feedback body) (get-in @captured [:body :feedback])))
          (is (= (:conversation_data body) (get-in @captured [:body :conversation_data])))
          (is (contains? (:body @captured) :version))
          (is (contains? (:body @captured) :submission_time))
          (is (false? (get-in @captured [:body :is_admin]))))))))

(deftest feedback-post-returns-400-when-harbormaster-cannot-be-reached-test
  (testing "MCP feedback fails when there is no Harbormaster fallback"
    (let [store-url   "http://hm.example"
          session-id  (mcp.session/create! (mt/user->id :rasta))
          body        {:feedback          {:message_id (str (random-uuid))
                                           :positive   true}
                       :conversation_data {:source "mcp"
                                           :prompt "show orders"
                                           :query  "encoded-query"}}
          posted?     (atom false)]
      (mt/with-temporary-setting-values [store-api-url store-url]
        (mt/with-dynamic-fn-redefs
          [premium-features/premium-embedding-token (constantly nil)
           http/post (fn [& _] (reset! posted? true))]
          (is (=? {:status 400}
                  (post-mcp-feedback :rasta 400 body session-id)))
          (is (false? @posted?)
              "Harbormaster must not be contacted when the premium token is missing"))))))

(deftest feedback-post-validates-session-header-test
  (testing "MCP feedback validates the MCP session header"
    (let [body {:feedback          {:message_id (str (random-uuid))
                                    :positive   true}
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
