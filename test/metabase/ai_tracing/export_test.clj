(ns metabase.ai-tracing.export-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.ai-tracing.export]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private node->attrs   #'metabase.ai-tracing.export/node->semconv-attrs)
(def ^:private final-output  #'metabase.ai-tracing.export/final-llm-output)
(def ^:private parse-headers #'metabase.ai-tracing.export/parse-headers)

(deftest ^:parallel span-type-mapping-test
  (testing "domain span types map to Confident's span kinds"
    (is (= "agent" (get (node->attrs {:type :turn :attributes {}}) "confident.span.type")))
    (is (= "llm"   (get (node->attrs {:type :llm  :attributes {}}) "confident.span.type")))
    (is (= "tool"  (get (node->attrs {:type :tool :attributes {}}) "confident.span.type")))
    (testing "generic span -> no type (Confident renders \"Custom\")"
      (is (nil? (get (node->attrs {:type :span :attributes {}}) "confident.span.type"))))))

(deftest ^:parallel llm-io-mapping-test
  (let [m (node->attrs {:type :llm :attributes {:ai/model       "claude"
                                                :ai/output-text "answer"
                                                :ai/input-parts [{:role "user"}]}})]
    (is (= "claude" (get m "confident.llm.model")))
    (is (= (json/encode [{:role "user"}]) (get m "confident.span.input")))
    (is (= (json/encode "answer")         (get m "confident.span.output")))))

(deftest ^:parallel tool-io-mapping-test
  (let [m (node->attrs {:type :tool :attributes {:ai/tool-name   "search"
                                                 :ai/tool-args   {:q "x"}
                                                 :ai/tool-output [{:r 1}]}})]
    (is (= "search" (get m "confident.tool.name")))
    (is (= (json/encode {:q "x"})   (get m "confident.span.input")))
    (is (= (json/encode [{:r 1}])   (get m "confident.span.output")))))

(deftest ^:parallel metadata-is-scalars-only-test
  (testing "metadata never carries large payloads — regression guard for the ingest-size blowup"
    (let [big   (apply str (repeat 50000 \x))
          m     (node->attrs {:type :llm :attributes {:ai/model "m" :ai/iteration 1
                                                      :ai/system      big
                                                      :ai/input-parts [{:role "user"}]}})
          meta  (json/decode (get m "confident.span.metadata"))]
      (is (contains? meta "ai/model"))
      (is (contains? meta "ai/iteration"))
      (is (not (contains? meta "ai/system")))      ; the big blob must NOT be in metadata
      (is (< (count ^String (get m "confident.span.metadata")) 1000)))))

(deftest ^:parallel trace-level-io-test
  (testing "root turn carries trace.input (user question), trace.output (final answer), and name"
    (let [turn {:type       :turn
                :attributes {:ai/profile-id "internal" :ai/user-input "how many?"}
                :children   [{:type :llm :attributes {:ai/output-text ""}         :children []}
                             {:type :llm :attributes {:ai/output-text "42 people"} :children []}]}
          m    (node->attrs turn)]
      (is (= (json/encode "how many?")  (get m "confident.trace.input")))
      (is (= (json/encode "42 people")  (get m "confident.trace.output")))
      (is (= "internal" (get m "confident.trace.name")))
      (is (= "internal" (get m "confident.agent.name"))))))

(deftest ^:parallel final-llm-output-test
  (testing "picks the last non-blank LLM output anywhere in the subtree"
    (is (= "final"
           (final-output {:type :turn
                          :children [{:type :llm :attributes {:ai/output-text "first"} :children []}
                                     {:type :llm :attributes {:ai/output-text ""}
                                      :children [{:type :tool :attributes {} :children []}]}
                                     {:type :llm :attributes {:ai/output-text "final"} :children []}]})))
    (testing "nil when all LLM outputs are blank"
      (is (nil? (final-output {:type :turn
                               :children [{:type :llm :attributes {:ai/output-text ""} :children []}]}))))))

(deftest ^:parallel parse-headers-test
  (is (= {"x-confident-api-key" "abc"}     (parse-headers "x-confident-api-key=abc")))
  (is (= {"a" "1" "b" "2"}                 (parse-headers "a=1, b=2")))
  (is (= {}                                (parse-headers "")))
  (is (= {}                                (parse-headers nil)))
  (testing "values containing '=' are preserved (split on first '=' only)"
    (is (= {"Authorization" "Bearer x=y"}  (parse-headers "Authorization=Bearer x=y")))))
