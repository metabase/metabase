(ns metabase-enterprise.osi-generation.generate-test
  "Focused generator-seam tests. Persistence, conditional write-back, batching, and error isolation
  live in core-test; these tests keep the LLM call canned and verify only prompt/call/response wiring."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.generate :as generate]
   [metabase-enterprise.osi-generation.prompt :as prompt]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.metabot.self :as self]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(comment generate/keep-me)

(deftest generate-context-wiring-test
  (testing "the seam renders the candidate, passes messages + response-json-schema through, sources
           provider/credentials/source from settings/llm-call-opts, and returns the exact call identity"
    (let [candidate {:llm-input {:entity-type "table", :name "Orders"}}
          call      (atom nil)]
      (mt/with-dynamic-fn-redefs [settings/llm-call-opts (constantly {:model-ref "test/model"
                                                                      :source "test-source"})
                                  self/call-llm-structured+usage
                                  (fn [& args]
                                    (reset! call args)
                                    {:result {:synonyms ["purchases"]}
                                     :usage  {:input-tokens 11, :output-tokens 7}})]
        (is (= {:ai_context {:synonyms ["purchases"]}
                :generator-version (generate/generator-version "test/model")
                :usage      {:input-tokens 11, :output-tokens 7}}
               (generate/generate-context candidate)))
        (is (= ["test/model" (prompt/build-messages candidate) prompt/response-json-schema 0.3 8192]
               (take 5 @call)))
        (is (= "test-source" (get (last @call) :source)))))))

(deftest generate-context-empty-response-test
  (testing "empty/blank output returns an empty context with usage so the caller can stamp convergence"
    (doseq [result [{} {:synonyms [], :examples []} {:instructions "  "}]]
      (mt/with-dynamic-fn-redefs [settings/llm-call-opts (constantly {:model-ref "test/model"})
                                  prompt/build-messages (constantly [])
                                  self/call-llm-structured+usage
                                  (constantly {:result result, :usage {:input-tokens 1, :output-tokens 2}})]
        (is (= {:ai_context {}
                :generator-version (generate/generator-version "test/model")
                :usage {:input-tokens 1, :output-tokens 2}}
               (generate/generate-context {})))))))

(deftest generator-version-tracks-prompt-revisions-test
  (testing "generator-version embeds the prompt content identity, so a template/schema revision — or a
           model change — yields a distinct stamp, while the same prompt + model stays stable"
    (let [v (generate/generator-version "test/model")]
      (is (= v (generate/generator-version "test/model")))
      (is (not= v (generate/generator-version "other/model")))
      (mt/with-dynamic-fn-redefs [prompt/version (constantly "0000deadbeef")]
        (is (not= v (generate/generator-version "test/model")))))))

(deftest generate-context-invalid-response-test
  (testing "a malformed result throws with usage attached for the caller's per-candidate isolation"
    (mt/with-dynamic-fn-redefs [settings/llm-call-opts (constantly {:model-ref "test/model"})
                                prompt/build-messages (constantly [])
                                self/call-llm-structured+usage
                                (constantly {:result {:instructions (apply str (repeat (inc entity-retrieval/max-instructions-len) "x"))}
                                             :usage  {:input-tokens 4, :output-tokens 5}})]
      (try
        (generate/generate-context {})
        (is false "expected invalid response to throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= {:input-tokens 4, :output-tokens 5} (:usage (ex-data e)))))))))
