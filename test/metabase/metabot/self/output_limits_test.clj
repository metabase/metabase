(ns metabase.metabot.self.output-limits-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.output-limits :as output-limits]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private stubbed-cap
  "A cap no real row holds, so the table lookup is the only thing that could have put it on the wire."
  4242)

(deftest ^:parallel output-limits-wiring-test
  (testing "the OpenAI Responses body takes max_output_tokens from the model's output-limits row"
    ;; a map is IFn, so it stands in for the lookup and answers nil for every other model
    (mt/with-dynamic-fn-redefs [output-limits/max-output-tokens {"gpt-5.5" stubbed-cap}]
      (doseq [model ["gpt-5.5"                    ; OpenAI, as sent
                     "openai.gpt-5.5-2026-04-23"  ; Bedrock: vendor prefix and snapshot date
                     "GPT-5.5"]]                  ; Azure: an admin-cased deployment name
        (is (= stubbed-cap (:max_output_tokens (openai/openai-request-body {:model model :input []})))
            model))
      (testing "the caller's own cap still wins over the row"
        (is (= 512 (:max_output_tokens (openai/openai-request-body
                                        {:model "gpt-5.5" :max-tokens 512 :input []})))))
      (testing "a model with no row sends no cap"
        (is (not (contains? (openai/openai-request-body {:model "gpt-5.4" :input []})
                            :max_output_tokens)))))))

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

(deftest ^:parallel gpt-models-send-no-chat-cap-test
  (testing "GPT models omit max_output_tokens when the caller passes no cap (BOT-1858 D11)"
    (doseq [model (concat
                   ;; OpenAI, as sent — every GPT row in the table but gpt-5.4-nano, which the catalog
                   ;; does not offer
                   (keys openai/supported-models)
                   ;; Bedrock `openai.*` and Azure `openai/<deployment>` resolve to those same rows through
                   ;; output-limits-key, so these spellings check the translation rather than more rows —
                   ;; except gpt-5.4-nano, which is here because it is the one table row the catalog omits
                   ["openai.gpt-5.5" "openai.gpt-5.5-2026-04-23"
                    "GPT-5.5" "gpt-5.4-nano" "gpt-5.4-2026-03-05"])]
      (is (not (contains? (openai/openai-request-body {:model model :input []}) :max_output_tokens))
          model))))
