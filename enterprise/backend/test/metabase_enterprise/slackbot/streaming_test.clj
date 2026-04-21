(ns metabase-enterprise.slackbot.streaming-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.premium-features.core :as premium-features]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.events :as slackbot.events]
   [metabase.slackbot.streaming :as slackbot.streaming]
   [metabase.slackbot.test-util :as tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(use-fixtures :once (fixtures/initialize :db))

(deftest slackbot-posts-free-trial-limit-error-when-managed-provider-is-locked-test
  (let [posted-message (atom nil)
        event          {:channel "C1" :ts "123.456" :channel_type "im"}]
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [llm-metabot-provider
                                         "metabase/anthropic/claude-sonnet-4-6"]
        (with-redefs [premium-features/token-status
                      (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                                 :is-locked   true}}})
                      slackbot.events/event->reply-context
                      (constantly {:channel "C1" :thread_ts "123.456"})
                      slackbot.events/dm?
                      (constantly true)
                      slackbot.client/post-thread-reply
                      (fn [_ message-ctx text & _]
                        (reset! posted-message {:message-ctx message-ctx :text text})
                        {:ok true})]
          (slackbot.streaming/send-response {:token "xoxb-test"} event)
          (is (= {:message-ctx {:channel "C1" :thread_ts "123.456"}
                  :text        "You've used all of your included AI service tokens. To keep using AI features, end your trial early and start your subscription, or add your own AI provider API key."}
                 @posted-message)))))))

(deftest slackbot-streaming-sets-ai-proxied-on-messages-test
  (testing "store-message! receives ai-proxy? = true for metabase/ prefixed provider"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event
            store-opts (atom [])]
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [{:keys [stop-stream-calls]}]
            (mt/with-premium-features #{:metabase-ai-managed}
              (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"]
                (with-redefs [premium-features/token-status
                              (constantly nil)
                              metabot.persistence/store-message!
                              (fn [_conv-id _profile-id _messages & {:as opts}]
                                (swap! store-opts conj opts)
                                nil)]
                  (mt/client :post 200 "metabot/slack/events"
                             (tu/slack-request-options event-body)
                             event-body)
                  (u/poll {:thunk      #(>= (count @stop-stream-calls) 1)
                           :done?      true?
                           :timeout-ms 5000}))))
            (testing "user + assistant store-message! calls both received ai-proxy? = true"
              (is (=? [{:ai-proxy? true}
                       {:ai-proxy? true}]
                      @store-opts)))))))))
