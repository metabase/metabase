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
          (is (=? {:url  expected-url
                   :opts {:conn-timeout   pos-int?
                          :socket-timeout pos-int?}
                   :body {:metabot_id        (metabot.config/normalize-metabot-id
                                              metabot.config/embedded-metabot-id)
                          :feedback          (:feedback body)
                          :conversation_data (:conversation_data body)
                          :version           some?
                          :submission_time   some?
                          :is_admin          false}}
                  @captured)))))))

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

(deftest feedback-post-returns-502-when-harbormaster-submission-fails-test
  (testing "MCP feedback surfaces Harbormaster submission failures without pretending the feedback was saved"
    (let [store-url  "http://hm.example"
          session-id (mcp.session/create! (mt/user->id :rasta))
          body       {:feedback          {:message_id (str (random-uuid))
                                          :positive   true}
                      :conversation_data {:source "mcp"
                                          :prompt "show orders"
                                          :query  "encoded-query"}}]
      (mt/with-temporary-setting-values [store-api-url store-url]
        (mt/with-dynamic-fn-redefs
          [premium-features/premium-embedding-token (constantly "test-fake-token-for-feedback")
           http/post (fn [& _] (throw (ex-info "Harbormaster unavailable" {})))]
          (is (=? {:status 502}
                  (post-mcp-feedback :rasta 502 body session-id))))))))

(deftest feedback-post-rejects-oversized-free-text-test
  (testing "MCP feedback bounds user-controlled free text before proxying to Harbormaster"
    (let [session-id (mcp.session/create! (mt/user->id :rasta))
          too-large  (apply str (repeat 10001 "x"))
          base-body  {:feedback          {:message_id (str (random-uuid))
                                          :positive   true}
                      :conversation_data {:source "mcp"}}
          posted?    (atom false)]
      (mt/with-dynamic-fn-redefs
        [http/post (fn [& _] (reset! posted? true))]
        (doseq [[path label] [[[:feedback :freeform_feedback] "freeform feedback"]
                              [[:conversation_data :prompt] "prompt"]
                              [[:conversation_data :query] "query"]]]
          (testing label
            (is (=? {:status 400}
                    (post-mcp-feedback :rasta 400 (assoc-in base-body path too-large) session-id))))))
      (is (false? @posted?)
          "Harbormaster must not be contacted for oversized feedback payloads"))))

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
