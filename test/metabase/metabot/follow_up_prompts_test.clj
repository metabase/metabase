(ns metabase.metabot.follow-up-prompts-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.follow-up-prompts :as follow-up-prompts]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.settings :as settings]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest output-schema-test
  (is (mr/validate self.core/LLMRequestOpts {:schema @#'follow-up-prompts/output-schema})))

(deftest clean-prompts-test
  (doseq [[input expected] [[[] []]
                            [[" Show the trend "] ["Show the trend"]]
                            [["A" "B"] ["A" "B"]]
                            [["A" "B" "C" "D"] ["A" "B" "C"]]
                            [["A" " A "] []]
                            [["A" ""] []]
                            [["A" nil] []]
                            [nil []]
                            ["A" []]]]
    (is (= expected (#'follow-up-prompts/clean-prompts input)))))

(deftest prompt-context-test
  (let [rows [{:role "user" :data [{:type "text" :text "Original question"}]}
              {:role "assistant" :data [{:type "reasoning" :text "Private reasoning"}
                                        {:type "tool-result" :result "Large payload"}
                                        {:type "text" :text (str (apply str (repeat 7000 "x")) "The next step")}]}]
        context (#'follow-up-prompts/prompt-context rows)]
    (is (<= (count context) 6000))
    (is (str/includes? context "The next step"))
    (is (not (str/includes? context "Private reasoning")))
    (is (not (str/includes? context "Large payload")))))

(deftest generate-test
  (let [message-id (str (random-uuid))
        message {:external_id message-id :role :assistant :finished true
                 :profile_id "internal" :data [{:type "text" :text "Sales grew."}]}
        calls (atom [])]
    (mt/with-dynamic-fn-redefs [metabot.db/recent-messages (fn [_ _] [message])
                                settings/llm-mini-model (constantly "mini/test")
                                self/call-llm-structured (fn [& args]
                                                           (swap! calls conj args)
                                                           {:prompts ["Show the trend"]})]
      (is (= ["Show the trend"] (follow-up-prompts/generate "conversation" message-id)))
      (let [[model _ _ _ budget opts] (first @calls)]
        (is (= "mini/test" model))
        (is (= 512 budget))
        (is (false? (:retry? opts)))
        (is (false? (:reasoning? opts))))
      (testing "obsolete, unfinished, or errored responses do not call the model"
        (doseq [row [(assoc message :external_id "another-message")
                     (assoc message :finished false)
                     (assoc message :error "failed")
                     (assoc message :role "user")]]
          (mt/with-dynamic-fn-redefs [metabot.db/recent-messages (fn [_ _] [row])]
            (is (= [] (follow-up-prompts/generate "conversation" message-id)))))
        (is (= 1 (count @calls))))
      (testing "provider failures are best effort"
        (mt/with-dynamic-fn-redefs [self/call-llm-structured (fn [& _] (throw (ex-info "unavailable" {})))]
          (is (= [] (follow-up-prompts/generate "conversation" message-id))))))))

(deftest stored-message-test
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {}
                 :model/MetabotMessage {message-id :external_id}
                 {:conversation_id conversation-id :role :assistant :finished true
                  :data_version 2 :data [{:type "text" :text "Sales grew."}]}]
    (mt/with-dynamic-fn-redefs [self/call-llm-structured (constantly {:prompts ["Show the trend"]})]
      (is (= ["Show the trend"] (follow-up-prompts/generate conversation-id message-id)))
      (is (= [] (follow-up-prompts/generate conversation-id (str (random-uuid)))))
      (mt/with-temp [:model/MetabotMessage _ {:conversation_id conversation-id :role :user}]
        (is (= [] (follow-up-prompts/generate conversation-id message-id)))))))

(deftest generation-timeout-test
  (let [interrupted (promise)
        message-id (str (random-uuid))]
    (with-redefs [follow-up-prompts/timeout-ms 20]
      (mt/with-dynamic-fn-redefs [metabot.db/recent-messages
                                  (fn [_ _] [{:external_id message-id :role :assistant :finished true}])
                                  self/call-llm-structured
                                  (fn [& _]
                                    (try
                                      @(promise)
                                      (finally (deliver interrupted true))))]
        (is (= [] (follow-up-prompts/generate "conversation" message-id)))
        (is (true? (deref interrupted 1000 :timed-out)))))))
