(ns metabase.mcp.callback-api-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.agent-api.handles :as agent-api.handles]
   [metabase.mcp.callback-api :as mcp.callback-api]
   [metabase.metabot.config :as metabot.config]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [throttle.core :as throttle]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- do-with-single-request-budget!
  "Run `thunk` with every callback route's per-user budget cut to one request per minute, so the second
   request a user makes is over budget."
  [thunk]
  (let [budget-of-one (fn [] (throttle/make-throttler :user-id :attempts-threshold 1 :attempt-ttl-ms (* 60 1000)))]
    (with-redefs-fn {#'mcp.callback-api/throttlers {"/drills"   (budget-of-one)
                                                    "/feedback" (budget-of-one)}}
      thunk)))

(defn- encoded-query
  "Base64 of a serialized `dataset_query`, the shape the iframe posts to `/drills`. `n` varies the query
   so each call yields a distinct handle."
  ([]
   (encoded-query 1))
  ([n]
   (u/encode-base64 (json/encode {:database 1
                                  :type     "query"
                                  :query    {:source-table n}}))))

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
            (post-drill {:encodedQuery (encoded-query)})))))

(deftest drills-post-stores-under-the-authenticated-user-test
  (testing "the handle is stored for the caller — the iframe's session key is the whole ownership check,
            and only that user can read the query back"
    (let [handle (:handle (:body (post-drill {:encodedQuery (encoded-query)})))]
      (is (some? (agent-api.handles/read-handle (mt/user->id :crowberto) handle)))
      (is (nil? (agent-api.handles/read-handle (mt/user->id :rasta) handle))))))

(deftest drills-post-rejects-blank-body-test
  (testing "blank encodedQuery returns 400"
    (is (=? {:status 400}
            (post-drill :crowberto 400 {:encodedQuery ""})))))

(deftest drills-post-rejects-payload-that-is-not-a-query-test
  (testing "a payload that is not a serialized query is refused rather than stashed"
    (doseq [[label payload] [["not base64"                "definitely-not-base64!!"]
                             ["base64 of something else"  (u/encode-base64 "just some text")]
                             ["base64 of a JSON scalar"   (u/encode-base64 (json/encode "nope"))]]]
      (testing label
        (is (=? {:status 400}
                (post-drill :crowberto 400 {:encodedQuery payload})))))))

(deftest drills-post-requires-auth-test
  (testing "unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :post 401 "embed-mcp/drills"
                                         {:encodedQuery (encoded-query)})))))

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

(deftest feedback-post-rejects-non-uuid-message-id-test
  (testing "a message id the iframe would never send is refused before Harbormaster is contacted"
    (let [posted? (atom false)]
      (mt/with-dynamic-fn-redefs
        [http/post (fn [& _] (reset! posted? true))]
        (is (=? {:status 400}
                (post-mcp-feedback :rasta 400 {:feedback          {:message_id (apply str (repeat 5000 "x"))
                                                                   :positive   true}
                                               :conversation_data {:source "mcp"}}))))
      (is (false? @posted?)
          "Harbormaster must not be contacted for a payload that fails validation"))))

(deftest drills-post-rejects-oversized-query-test
  (testing "a well-formed query is still refused once it is large enough to bloat a handle row"
    (let [oversized (u/encode-base64 (json/encode {:database 1
                                                   :type     "query"
                                                   :query    {:source-table 1
                                                              :padding      (apply str (repeat 100000 "x"))}}))]
      (is (=? {:status 400}
              (post-drill :crowberto 400 {:encodedQuery oversized}))))))

(deftest drills-post-throttles-per-user-test
  (testing "a session cookie buys a bounded number of stashed handles, and the budget is per user"
    (do-with-single-request-budget!
     (fn []
       (is (=? {:status 200} (post-drill :rasta 200 {:encodedQuery (encoded-query 1)})))
       (testing "the same user over budget is refused"
         (is (=? {:status 429} (post-drill :rasta 429 {:encodedQuery (encoded-query 2)}))))
       (testing "another user still has their own budget"
         (is (=? {:status 200} (post-drill :crowberto 200 {:encodedQuery (encoded-query 3)}))))))))

(deftest feedback-post-throttles-per-user-test
  (testing "an over-budget caller cannot keep driving outbound requests to Harbormaster"
    (let [body     {:feedback          {:message_id (str (random-uuid))
                                        :positive   true}
                    :conversation_data {:source "mcp"}}
          post-count (atom 0)]
      (mt/with-temporary-setting-values [store-api-url "http://hm.example"]
        (mt/with-dynamic-fn-redefs
          [premium-features/premium-embedding-token (constantly "test-fake-token-for-feedback")
           http/post                                (fn [& _] (swap! post-count inc))]
          (do-with-single-request-budget!
           (fn []
             (post-mcp-feedback :rasta 204 body)
             (is (=? {:status 429}
                     (post-mcp-feedback :rasta 429 (assoc-in body [:feedback :message_id] (str (random-uuid))))))
             (is (= 1 @post-count)
                 "Harbormaster must not be contacted once the caller is over budget"))))))))
