(ns metabase.metabot.usage-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- managed-free-limit-reached?
  [provider token-status]
  (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-provider (constantly provider)
                              premium-features/token-status               (constantly token-status)]
    (boolean (metabot.usage/managed-free-limit-reached?))))

(deftest ^:parallel managed-free-limit-reached?-test
  (let [managed-4-6 "metabase/anthropic/claude-sonnet-4-6"
        managed-5   "metabase/anthropic/claude-sonnet-5"
        locked-4-6  {:meters {:anthropic:claude-sonnet-4-6:tokens {:is-locked true}}}
        locked-5    {:meters {:anthropic:claude-sonnet-5:tokens {:is-locked true}}}]
    (doseq [[description expected provider token-status]
            [["nil token status"                          false managed-5 nil]
             ["missing meters"                            false managed-5 {}]
             ["nil meters"                                false managed-5 {:meters nil}]
             ["missing selected-model meter"              false managed-5
              {:meters {:openai:gpt-5-4:tokens {:is-locked true}}}]
             ["unlocked Sonnet 5 meter"                   false managed-5
              {:meters {:anthropic:claude-sonnet-5:tokens {:is-locked false}}}]
             ["locked Sonnet 5 meter"                     true  managed-5 locked-5]
             ["locked 4.6 meter while Sonnet 5 selected"  false managed-5 locked-4-6]
             ["locked 4.6 meter while Sonnet 4.6 selected" true  managed-4-6 locked-4-6]
             ["direct provider with matching meter key"   false "anthropic/claude-sonnet-5" locked-5]]]
      (testing description
        (is (= expected (managed-free-limit-reached? provider token-status)))))))
