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
  "Assert that `ex-data` has no `:headers` key under `:request` or `:response`."
  [data]
  ;; Not folded into the parent `=?` because `=?` is a subset match — it would silently pass
  ;; if `:headers` reappeared in ex-data but was just absent from the expectation. We've had
  ;; that regression before; assert the absence explicitly per error case.
  (is (not (contains? (:request data) :headers))
      "request headers should be stripped from ex-data")
  (is (not (contains? (:response data) :headers))
      "response headers should be stripped from ex-data"))

(deftest ^:parallel body-preview-test
  (let [body-preview #'metabot-v3.client/body-preview]
    (testing "nil, blanks, bare non-collection scalars, and empty maps/arrays return nil (no preview)"
      (is (every? nil? (map body-preview [nil "" "   " 500 :error true [] {}]))))
    (testing "strings pass through trimmed"
      (is (= "Internal Server Error" (body-preview "  Internal Server Error  "))))
    (testing "JSON envelopes prefer [:error :message] over top-level :error/:detail/:message"
      (is (= "model decommissioned" (body-preview {:error {:message "model decommissioned" :type "x"}})))
      (is (= "invalid metric"       (body-preview {:error  "invalid metric" :request-id "abc"})))
      (is (= "missing prompt"       (body-preview {:detail "missing prompt"})))
      (is (= "bad request"          (body-preview {:message "bad request"}))))
    (testing "non-string, blank, or whitespace-only at one key falls through to a later key"
      (is (= "real error" (body-preview {:error {:message {:code 500}} :detail "real error"})))
      (is (= "real error" (body-preview {:error "" :detail "real error"})))
      (is (= "real error" (body-preview {:error "   " :detail "real error"}))))
    (testing "JSON arrays probe their first element"
      (is (= "rate limited"  (body-preview [{:error {:message "rate limited"}} {:type "x"}])))
      (is (= "first message" (body-preview ["first message" "ignored"]))))
    (testing "non-empty maps/arrays without a recognised error field pr-str into the preview"
      (doseq [body [{:request-id "abc" :trace ["frame1"]}
                    [42 :kw]
                    [{:request-id "abc"}]
                    {:error {:code 42 :type "x"}}
                    {:error {:message {:code 500}}}]]
        (is (= (pr-str body) (body-preview body))
            (str "pr-str fallback for " (pr-str body)))))
    (testing "long bodies are truncated to 500 chars with an ellipsis"
      (let [preview (body-preview (apply str (repeat 2000 \x)))]
        (is (str/ends-with? preview "…"))
        (is (= 501 (count preview)))))))

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
    (testing "bodies without a recognised error field pr-str into the exception message"
      (let [body {:request-id "abc" :trace ["frame1" "frame2"]}
            {:keys [response request]} (check-response!-input {:status        500
                                                               :reason-phrase "Internal Server Error"
                                                               :body          body})
            ex   (is (thrown? Exception (check! response request)))]
        (is (str/includes? (ex-message ex) "AI service request failed: HTTP 500 Internal Server Error"))
        (is (str/includes? (ex-message ex) ":request-id")
            "the unrecognised envelope's pr-str is appended so operators see what we got")
        (is (= body (get-in (ex-data ex) [:response :body])))
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
    (testing "streaming-response bodies route through quick-closing-body so the http-client is released"
      ;; Regression: non-2xx streaming responses must close the underlying :http-client.
      ;; ContentLengthInputStream doesn't close the connection on its own (clj-http#627).
      (let [closed?    (atom false)
            stream     (java.io.ByteArrayInputStream. (.getBytes "stream body" "UTF-8"))
            {:keys [request]} (check-response!-input {})
            response   {:status        500
                        :reason-phrase "ISE"
                        :body          stream
                        :headers       {"x-secret" "hide-me"}
                        :http-client   (reify Closeable (close [_] (reset! closed? true)))}
            ex         (is (thrown? Exception (check! response request)))]
        (is @closed?
            ":http-client must be closed after slurping the stream body")
        (is (= "stream body" (get-in (ex-data ex) [:response :body])))))
    (testing "InputStream bodies are bounded — a multi-MB upstream payload doesn't get fully slurped"
      ;; ByteArrayInputStream.available() returns unread bytes, so we can measure how much
      ;; coerce-body actually pulled off the stream without proxying read methods.
      (let [body-bytes (.getBytes ^String (apply str (repeat 2000000 \x)))
            stream     (java.io.ByteArrayInputStream. body-bytes)
            {:keys [request]} (check-response!-input {})
            response   {:status 502 :reason-phrase "Bad Gateway" :body stream}
            _          (is (thrown? Exception (check! response request)))
            consumed   (- (alength body-bytes) (.available stream))]
        (is (< consumed (alength body-bytes))
            "should not consume the entire 2MB stream just to surface an error preview")))
    (testing "long bodies are truncated in the exception message but kept in full in ex-data"
      (let [long-body (apply str (repeat 2000 \x))
            {:keys [response request]} (check-response!-input {:status        500
                                                               :reason-phrase "ISE"
                                                               :body          long-body})
            ex (is (thrown? Exception (check! response request)))]
        (is (str/includes? (ex-message ex) "…"))
        (is (< (count (ex-message ex)) 1200) "exception message is truncated near the body-preview cap")
        (is (= long-body (get-in (ex-data ex) [:response :body])))
        (assert-no-headers! (ex-data ex))))
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
            ex   (is (thrown? Exception (check! response request)))]
        (is (=? {:response {:status 500 :reason-phrase "ISE" :body "boom"}} (ex-data ex)))
        (is (= #{:status :reason-phrase :body} (set (keys (:response (ex-data ex))))))))))

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
