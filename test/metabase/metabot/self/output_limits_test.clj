(ns metabase.metabot.self.output-limits-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.output-limits :as output-limits]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private stubbed-cap
  "A cap no real row holds, so the table lookup is the only thing that could have put it on the wire."
  4242)

(deftest ^:parallel chat-completions-output-limits-wiring-test
  (testing "the OpenRouter, Moonshot and Mistral bodies take max_tokens from the model's output-limits row"
    ;; Kimi and Mistral Medium hold nil rows, so a stub is the only way to observe the lookup happening at all:
    ;; against the real table those two bodies are byte-identical before and after the wiring.
    (mt/with-dynamic-fn-redefs [output-limits/max-output-tokens {"kimi-k3"            stubbed-cap
                                                                 "mistral-medium-3-5" stubbed-cap
                                                                 "gpt-5.5"            stubbed-cap}]
      (is (= stubbed-cap (:max_tokens (moonshot/moonshot-request-body {:model "kimi-k3" :input []}))))
      (is (= stubbed-cap (:max_tokens (mistral/mistral-request-body {:model "mistral-medium-3-5" :input []}))))
      (testing "OpenRouter drops the vendor segment before the lookup"
        (is (= stubbed-cap (:max_tokens (openrouter/openrouter-request-body
                                         {:model "openai/gpt-5.5" :input []})))))
      (testing "the caller's own cap still wins over the row"
        (is (= 512 (:max_tokens (moonshot/moonshot-request-body
                                 {:model "kimi-k3" :max-tokens 512 :input []}))))
        (is (= 512 (:max_tokens (openrouter/openrouter-request-body
                                 {:model "openai/gpt-5.5" :max-tokens 512 :input []})))))
      (testing "a model with no row sends no cap"
        (is (not (contains? (mistral/mistral-request-body {:model "mistral-medium-latest" :input []})
                            :max_tokens)))
        (is (not (contains? (openrouter/openrouter-request-body {:model "openai/gpt-4o" :input []})
                            :max_tokens)))))))
