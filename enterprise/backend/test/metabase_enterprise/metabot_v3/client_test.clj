(ns metabase-enterprise.metabot-v3.client-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as m3.client]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
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
    (let [mock-response (make-mock-stream-response ["a1" "a2" "a3"] {"some-model" {:prompt 8 :completion 2}})
          cid           (str (random-uuid))
          req           {:context         {:some "context"}
                         :messages        [{:role :user :content "stuff"}]
                         :profile-id      "test-profile"
                         :conversation-id cid
                         :session-id      "test-session"
                         :state           {:some "state"}}]
      (mt/with-dynamic-fn-redefs [http/post (mock-post! mock-response)]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-model-cleanup [:model/MetabotMessage
                                  [:model/MetabotConversation :created_at]]
            (let [res (m3.client/streaming-request req)]
              (is (instance? StreamingResponse res))
              (is (= "text/event-stream; charset=utf-8" (:content-type (.options ^StreamingResponse res))))

              (let [body     (consume-streaming-response res)
                    conv     (t2/select-one :model/MetabotConversation :id cid)
                    messages (t2/select :model/MetabotMessage :conversation_id cid)]
                (is (string? body))
                (is (=? {:user_id (mt/user->id :crowberto)}
                        conv))
                (is (=? [{:total 0
                          :role  :user
                          :data  {:role "user" :content "stuff"}}
                         {:total 10
                          :role  :assistant
                          :data  {:role "assistant" :content "a1a2a3"}}]
                        messages))))))))))
