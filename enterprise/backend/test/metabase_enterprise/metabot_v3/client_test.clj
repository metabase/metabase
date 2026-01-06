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

(deftest example-generation-payload-unknown-field-types-test
  (let [mp (mt/metadata-provider)]
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
                   (let [metabot-eid (get-in metabot-v3.config/metabot-config [metabot-v3.config/internal-metabot-id
                                                                               :entity-id])
                         metabot-id (t2/select-one-fn :id :model/Metabot :entity_id metabot-eid)]
                     (metabot-v3.suggested-prompts/generate-sample-prompts metabot-id)
                     :not-thrown))
                 (catch Exception e
                   e))))))))
