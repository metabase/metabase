(ns metabase.mcp.callback-api-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.agent-api.handles :as agent-api.handles]
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
  "POST /api/embed-mcp/drills as `user` (default :crowberto), with an `expected-status` for
   non-200 cases."
  ([body]
   (post-drill :crowberto 200 body))
  ([user expected-status body]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/drills"
                                body)))

(defn- post-mcp-feedback
  [user expected-status body]
  (client/client-full-response (test.users/username->token user)
                               :post expected-status "embed-mcp/feedback"
                               body))

(deftest drills-post-stores-handle-test
  (testing "POST returns a UUID handle"
    (is (=? {:status 200
             :body   {:handle parse-uuid}}
            (post-drill {:encodedQuery "ZW5jb2RlZA=="})))))

(deftest drills-post-stores-under-the-authenticated-user-test
  (testing "the handle is stored for the caller — the iframe's session key is the whole ownership check,
            and only that user can read the query back"
    (let [handle (:handle (:body (post-drill {:encodedQuery "ZW5jb2RlZA=="})))]
      (is (some? (agent-api.handles/read-handle (mt/user->id :crowberto) handle)))
      (is (nil? (agent-api.handles/read-handle (mt/user->id :rasta) handle))))))

(deftest drills-post-rejects-blank-body-test
  (testing "blank encodedQuery returns 400"
    (is (=? {:status 400}
            (post-drill :crowberto 400 {:encodedQuery ""})))))

(deftest drills-post-requires-auth-test
  (testing "unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :post 401 "embed-mcp/drills"
                                         {:encodedQuery "ZW5jb2RlZA=="})))))

(deftest feedback-post-submits-mcp-visualization-context-test
  (testing "MCP feedback accepts visualization context without a Metabot message row"
    (let [store-url    "http://hm.example"
          fake-token   "test-fake-token-for-feedback"
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
          (post-mcp-feedback :rasta 204 body)
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
    (let [store-url "http://hm.example"
          body      {:feedback          {:message_id (str (random-uuid))
                                         :positive   true}
                     :conversation_data {:source "mcp"
                                         :prompt "show orders"
                                         :query  "encoded-query"}}
          posted?   (atom false)]
      (mt/with-temporary-setting-values [store-api-url store-url]
        (mt/with-dynamic-fn-redefs
          [premium-features/premium-embedding-token (constantly nil)
           http/post (fn [& _] (reset! posted? true))]
          (is (=? {:status 400}
                  (post-mcp-feedback :rasta 400 body)))
          (is (false? @posted?)
              "Harbormaster must not be contacted when the premium token is missing"))))))

(deftest feedback-post-returns-502-when-harbormaster-submission-fails-test
  (testing "MCP feedback surfaces Harbormaster submission failures without pretending the feedback was saved"
    (let [store-url "http://hm.example"
          body      {:feedback          {:message_id (str (random-uuid))
                                         :positive   true}
                     :conversation_data {:source "mcp"
                                         :prompt "show orders"
                                         :query  "encoded-query"}}]
      (mt/with-temporary-setting-values [store-api-url store-url]
        (mt/with-dynamic-fn-redefs
          [premium-features/premium-embedding-token (constantly "test-fake-token-for-feedback")
           http/post (fn [& _] (throw (ex-info "Harbormaster unavailable" {})))]
          (is (=? {:status 502}
                  (post-mcp-feedback :rasta 502 body))))))))

(deftest feedback-post-rejects-oversized-free-text-test
  (testing "MCP feedback bounds user-controlled free text before proxying to Harbormaster"
    (let [too-large (apply str (repeat 10001 "x"))
          base-body {:feedback          {:message_id (str (random-uuid))
                                         :positive   true}
                     :conversation_data {:source "mcp"}}
          posted?   (atom false)]
      (mt/with-dynamic-fn-redefs
        [http/post (fn [& _] (reset! posted? true))]
        (doseq [[path label] [[[:feedback :freeform_feedback] "freeform feedback"]
                              [[:conversation_data :prompt] "prompt"]
                              [[:conversation_data :query] "query"]]]
          (testing label
            (is (=? {:status 400}
                    (post-mcp-feedback :rasta 400 (assoc-in base-body path too-large)))))))
      (is (false? @posted?)
          "Harbormaster must not be contacted for oversized feedback payloads"))))

(deftest feedback-post-requires-auth-test
  (testing "unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :post 401 "embed-mcp/feedback"
                                         {:feedback          {:message_id (str (random-uuid))
                                                              :positive   true}
                                          :conversation_data {:source "mcp"}})))))
