(ns metabase-enterprise.metabot-v3.client-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.util]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu])
  (:import
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

(mu/defn make-mock-stream-response [chunks usage :- ::metabot-v3.client.schema/usage]
  (str (->> chunks
            (map #(str "0:" (json/encode %) "\n"))
            (str/join))
       "d:" (json/encode {:finishReason "stop" :usage usage})))

(defn mock-post! [^String body]
  (fn [_url _opts]
    {:status 200
     :headers {"content-type" "text/event-stream"}
     :body (ByteArrayInputStream. (.getBytes body "UTF-8"))}))

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
          mock-response (make-mock-stream-response input {"some-model" {:prompt 8 :completion 2}})
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
                    (metabot-v3.util/aisdk->messages "assistant" (str/split-lines body))))))))))
