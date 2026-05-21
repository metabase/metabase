(ns metabase-enterprise.metabot-v3.client-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.suggested-prompts :as metabot-v3.suggested-prompts]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream Closeable PipedInputStream PipedOutputStream)
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

(mu/defn- make-mock-stream-response* [part-prefix finish-reason chunks usage :- ::metabot-v3.client.schema/usage]
  (str (->> chunks
            (map #(str part-prefix (json/encode %) "\n"))
            (str/join))
       "d:" (json/encode {:finishReason finish-reason :usage usage})))

(mu/defn make-mock-text-stream-response [chunks usage :- ::metabot-v3.client.schema/usage]
  (make-mock-stream-response* "0:" "stop" chunks usage))

(mu/defn make-mock-error-stream-response [chunks usage :- ::metabot-v3.client.schema/usage]
  (make-mock-stream-response* "3:" "error" chunks usage))

(defn mock-post! [^String body & [{:keys [delay-ms]
                                   :or   {delay-ms 0}}]]
  (fn [_url _opts]
    (let [ret  (PipedInputStream.)
          pipe (PipedOutputStream. ret)]
      (future
        (try
          (doseq [^String line (str/split body #"\n")]
            (.write pipe (.getBytes line "UTF-8"))
            (.write pipe (.getBytes "\n" "UTF-8"))
            (.flush pipe)
            (Thread/sleep ^long delay-ms))
          (finally
            (.close pipe))))
      {:status      200
       :headers     {"content-type" "text/event-stream"}
       :body        ret
       :http-client (reify Closeable
                      (close [_this]
                        (.close ret)))})))

(defn consume-streaming-response
  "Execute a StreamingResponse and capture its output"
  [^StreamingResponse streaming-response]
  (let [output-stream (ByteArrayOutputStream.)
        canceled-chan (a/promise-chan)]
    ;; Execute the streaming function
    ((.f streaming-response) output-stream canceled-chan)
    (.toString output-stream "UTF-8")))

(deftest client-test
  (mt/with-premium-features #{:metabot-v3}
    (let [input         ["a1" "a2" "a3"]
          mock-response (make-mock-text-stream-response input {"some-model" {:prompt 8 :completion 2}})
          cid           (str (random-uuid))
          req           {:context         {:some "context"}
                         :message         {:role :user :content "stuff"}
                         :history         []
                         :profile-id      "test-profile"
                         :conversation-id cid
                         :session-id      "test-session"
                         :state           {:some "state"}}]
      (mt/with-dynamic-fn-redefs [http/post (mock-post! mock-response)]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [res  (metabot-v3.client/streaming-request req)
                body (consume-streaming-response res)]
            (is (instance? StreamingResponse res))
            (is (= "text/event-stream; charset=utf-8" (:content-type (.options ^StreamingResponse res))))
            (is (string? body))
            (is (=? [{:_type :TEXT :content "a1a2a3"}
                     {:_type :FINISH_MESSAGE :finish_reason "stop"}]
                    (metabot-v3.util/aisdk->messages :assistant (str/split-lines body))))))))))

(deftest client-error-test
  (mt/with-premium-features #{:metabot-v3}
    (let [input         ["oof " "bad " "error!"]
          mock-response (make-mock-error-stream-response input {"some-model" {:prompt 8 :completion 2}})
          cid           (str (random-uuid))
          req           {:context         {:some "context"}
                         :message         {:role :user :content "stuff"}
                         :history         []
                         :profile-id      "test-profile"
                         :conversation-id cid
                         :session-id      "test-session"
                         :state           {:some "state"}}]
      (mt/with-dynamic-fn-redefs [http/post (mock-post! mock-response)]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [res  (metabot-v3.client/streaming-request req)
                body (consume-streaming-response res)]
            (is (instance? StreamingResponse res))
            (is (= "text/event-stream; charset=utf-8" (:content-type (.options ^StreamingResponse res))))
            (is (string? body))
            (is (=? [{:_type :ERROR :content "oof bad error!"}
                     {:_type :FINISH_MESSAGE :finish_reason "error"}]
                    (metabot-v3.util/aisdk->messages :assistant (str/split-lines body))))))))))

(deftest streaming-request-error-excludes-headers-test
  (testing "When streaming-request gets an error response, the exception should not include headers"
    (mt/with-premium-features #{:metabot-v3}
      (let [req {:context         {:some "context"}
                 :message         {:role :user :content "stuff"}
                 :history         []
                 :profile-id      "test-profile"
                 :conversation-id (str (random-uuid))
                 :session-id      "test-session"
                 :state           {:some "state"}}]
        (mt/with-dynamic-fn-redefs [http/post (fn [_url _opts]
                                                {:status        500
                                                 :reason-phrase "Internal Server Error"
                                                 :headers       {"x-secret-header" "sensitive-value"
                                                                 "x-request-id"    "abc123"}
                                                 :body          "Error message"})]
          (mt/with-current-user (mt/user->id :crowberto)
            (let [ex (try
                       (metabot-v3.client/streaming-request req)
                       nil
                       (catch Exception e
                         e))]
              (is (some? ex) "Expected an exception to be thrown")
              (when ex
                (testing "outer wrapper preserves the rich ex-data from check-response!"
                  (is (=? {:error-code :ai-service-error :status 500} (ex-data ex))
                      "downstream readers shouldn't need to walk ex-cause to find the structured fields"))
                (doseq [data [(ex-data ex) (ex-data (ex-cause ex))]]
                  (is (not (contains? (:request data) :headers))
                      "Exception data should not contain :headers in request")
                  (is (not (contains? (:response data) :headers))
                      "Exception data should not contain :headers in response"))))))))))

(defn- check-response!-input
  "Build a failing-response + request pair that always includes secret-headers so each test
   exercise can independently verify they get stripped from `ex-data`."
  [response-overrides]
  {:response (merge {:headers {"x-secret-response" "hide-me"}} response-overrides)
   :request  {:foo :bar :headers {"x-secret-request" "hide-me-too"}}})

(defn- assert-no-headers!
  "`=?` is a subset match — it silently passes if `:headers` is present in `ex-data` but
   absent from the expectation. Headers leaking into logs/ex-data has bitten us before,
   so each error case asserts the absence explicitly."
  [data]
  (is (not (contains? (:request data) :headers))
      "request headers should be stripped from ex-data")
  (is (not (contains? (:response data) :headers))
      "response headers should be stripped from ex-data"))

(deftest check-response!-test
  (let [check! #'metabot-v3.client/check-response!]
    (testing "200/202 returns the body unchanged"
      (is (= {:ok true} (check! {:status 200 :body {:ok true}} {:req :body})))
      (is (= {:ok true} (check! {:status 202 :body {:ok true}} {:req :body}))))
    (testing "non-2xx throws an :ai-service-error with the status, body preview, and full body in ex-data"
      (let [{:keys [response request]} (check-response!-input {:status        500
                                                               :reason-phrase "Internal Server Error"
                                                               :body          "Internal Server Error"})
            ex   (is (thrown-with-msg?
                      Exception
                      #"AI service request failed: HTTP 500 Internal Server Error — Internal Server Error"
                      (check! response request)))
            data (ex-data ex)]
        (is (=? {:error-code :ai-service-error
                 :status     500
                 :request    {:foo :bar}
                 :response   {:status 500 :body "Internal Server Error"}}
                data))
        (assert-no-headers! data)))
    (testing "structured JSON error bodies surface the upstream :error/:detail/:message"
      (let [{:keys [response request]} (check-response!-input {:status        400
                                                               :reason-phrase "Bad Request"
                                                               :body          {:error      "invalid metric"
                                                                               :request-id "abc"}})
            ex (is (thrown-with-msg?
                    Exception
                    #"AI service request failed: HTTP 400 Bad Request — invalid metric"
                    (check! response request)))]
        (testing "and the full body survives into ex-data"
          (is (=? {:response {:body {:error "invalid metric" :request-id "abc"}}}
                  (ex-data ex))))
        (assert-no-headers! (ex-data ex))))
    (testing "nested {:error {:message ...}} envelopes are unwrapped — wrapper map doesn't leak into the message"
      (let [{:keys [response request]} (check-response!-input {:status        500
                                                               :reason-phrase "Internal Server Error"
                                                               :body          {:error {:message "upstream went boom"
                                                                                       :code    500}}})
            ex  (is (thrown-with-msg?
                     Exception
                     #"AI service request failed: HTTP 500 Internal Server Error — upstream went boom"
                     (check! response request)))
            msg (ex-message ex)]
        (is (not (str/includes? msg ":code"))
            "the :code sibling field shouldn't leak into the user-facing message")
        (is (=? {:response {:body {:error {:message "upstream went boom" :code 500}}}}
                (ex-data ex))
            "the full nested envelope still lives in ex-data for debugging")
        (assert-no-headers! (ex-data ex))))
    (testing "stream bodies get slurped — preview surfaces in the message and the full body survives in ex-data"
      (let [stream (java.io.ByteArrayInputStream. (.getBytes "boom from upstream" "UTF-8"))
            {:keys [response request]} (check-response!-input {:status        502
                                                               :reason-phrase "Bad Gateway"
                                                               :body          stream})
            ex (is (thrown-with-msg?
                    Exception
                    #"boom from upstream"
                    (check! response request)))]
        (is (= "boom from upstream" (get-in (ex-data ex) [:response :body])))
        (assert-no-headers! (ex-data ex))))
    (testing "long bodies are truncated in the exception message but kept in full in ex-data"
      (let [long-body (apply str (repeat 2000 \x))
            {:keys [response request]} (check-response!-input {:status        500
                                                               :reason-phrase "ISE"
                                                               :body          long-body})
            ex (is (thrown? Exception (check! response request)))
            msg (ex-message ex)]
        (is (str/includes? msg "…"))
        (is (< (count msg) 1200) "exception message is truncated near the body-preview cap")
        (is (= long-body (get-in (ex-data ex) [:response :body]))
            "full body is preserved in ex-data")
        (assert-no-headers! (ex-data ex))))
    (testing "structured maps without :error/:detail/:message keep the user-facing message clean"
      (let [body {:request-id "abc" :trace ["frame1" "frame2"]}
            {:keys [response request]} (check-response!-input {:status        500
                                                               :reason-phrase "Internal Server Error"
                                                               :body          body})
            ex   (is (thrown? Exception (check! response request)))
            msg  (ex-message ex)]
        (is (= "AI service request failed: HTTP 500 Internal Server Error" msg)
            "no internal body fields leak into the exception message")
        (is (= body (get-in (ex-data ex) [:response :body]))
            "the full body is still preserved in ex-data for debugging")
        (assert-no-headers! (ex-data ex))))
    (testing "{:error <map-without-:message>} doesn't stringify the raw envelope into the user message"
      (let [body {:error {:code 500 :request-id "abc"}}
            {:keys [response request]} (check-response!-input {:status        500
                                                               :reason-phrase "Internal Server Error"
                                                               :body          body})
            ex   (is (thrown? Exception (check! response request)))
            msg  (ex-message ex)]
        (is (= "AI service request failed: HTTP 500 Internal Server Error" msg)
            "the nested error map shouldn't leak into the user-facing message")
        (is (= body (get-in (ex-data ex) [:response :body]))
            "the full body is still preserved in ex-data for debugging")
        (assert-no-headers! (ex-data ex))))
    (testing "{:error {:message <non-scalar>}} doesn't stringify the raw envelope into the user message"
      (doseq [body [{:error {:message {:code 500}}}
                    {:error {:message ["a" "b"]}}]]
        (let [{:keys [response request]} (check-response!-input {:status        500
                                                                 :reason-phrase "Internal Server Error"
                                                                 :body          body})
              ex  (is (thrown? Exception (check! response request)))
              msg (ex-message ex)]
          (is (= "AI service request failed: HTTP 500 Internal Server Error" msg)
              (str "non-scalar nested :error :message shouldn't leak for " (pr-str body)))
          (is (= body (get-in (ex-data ex) [:response :body]))
              "the full body is still preserved in ex-data for debugging")
          (assert-no-headers! (ex-data ex)))))
    (testing "structured :detail/:message values fall through to nil instead of getting str-coerced"
      (doseq [body [{:detail [{:loc ["body" "prompt"] :msg "field required"}]}
                    {:message {:code "missing" :type "validation"}}]]
        (let [{:keys [response request]} (check-response!-input {:status        422
                                                                 :reason-phrase "Unprocessable Entity"
                                                                 :body          body})
              ex  (is (thrown? Exception (check! response request)))
              msg (ex-message ex)]
          (is (= "AI service request failed: HTTP 422 Unprocessable Entity" msg)
              (str "raw envelope shouldn't leak into the message for " (pr-str body)))
          (is (= body (get-in (ex-data ex) [:response :body]))
              "the full structured body is still preserved in ex-data")
          (assert-no-headers! (ex-data ex)))))
    (testing "ex-data :response is an explicit allow-list, not a passthrough of clj-http internals"
      (let [{:keys [request]} (check-response!-input {})
            ;; clj-http responses can carry `:http-client` (a Closeable), `:trace-redirects`,
            ;; `:orig-content-encoding`, etc. — none of those should land in ex-data.
            response {:status                500
                      :reason-phrase         "ISE"
                      :body                  "boom"
                      :headers               {"x-secret" "hide-me"}
                      :http-client           (reify java.io.Closeable (close [_]))
                      :trace-redirects       ["http://elsewhere"]
                      :orig-content-encoding "gzip"}
            ex   (is (thrown? Exception (check! response request)))
            data (ex-data ex)]
        (is (= #{:status :reason-phrase :body} (set (keys (:response data))))
            "only the allow-listed response keys appear in ex-data")
        (is (= {:status 500 :reason-phrase "ISE" :body "boom"} (:response data)))))))

(deftest example-generation-payload-unknown-field-types-test
  (let [mp (mt/metadata-provider)
        metabot-eid (get-in metabot-v3.config/metabot-config [metabot-v3.config/internal-metabot-id
                                                              :entity-id])
        original-collection-id (t2/select-one-fn :collection_id :model/Metabot :entity_id metabot-eid)]
    ;; Ensure internal metabot is set to the root collection for generating prompts
    (t2/update! :model/Metabot :entity_id metabot-eid {:collection_id nil})
    (try
      (mt/with-temp [:model/Card c {:type :metric
                                    :dataset_query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                       (lib/aggregate
                                                        (lib/count (lib.metadata/field mp (mt/id :orders :total)))))
                                    ;; Set large view count to ensure metric is picked in `generate-sample-prompts`.
                                    :view_count 1000}]
        ;; Add column with type/* to metric result_metadata
        (t2/update! :model/Card :id (:id c)
                    {:result_metadata (conj (:result_metadata (t2/select-one :model/Card :id (:id c)))
                                            {:database_type "point"
                                             :base_type :type/*
                                             :effective_type :type/*
                                             :name "dummy"})})
        (testing "No exception is thrown when type/* column is present it result_metadata"
          (is (= :not-thrown
                 (try
                   ;; Override calls to ai service as we are interested in no exception being thrown
                   ;; prior to those calls.
                   (with-redefs [metabot-v3.client/post! (constantly {:status 200
                                                                      :body {:table_questions []
                                                                             :metric_questions []}})]
                     (let [metabot-id (t2/select-one-fn :id :model/Metabot :entity_id metabot-eid)]
                       (metabot-v3.suggested-prompts/generate-sample-prompts metabot-id)
                       :not-thrown))
                   (catch Exception e
                     e))))))
      (finally
        (t2/update! :model/Metabot :entity_id metabot-eid {:collection_id original-collection-id})))))
