(ns build.embedder-model-test
  (:require
   [build.embedder-model :as embedder-model]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]))

(deftest model-catalog-test
  (let [{:keys [catalog-version models]} (embedder-model/model-catalog)
        [model-name model]                (first models)]
    (is (= 1 catalog-version))
    (is (= #{"Snowflake/snowflake-arctic-embed-l-v2.0"} (set (keys models))))
    (is (= "Snowflake/snowflake-arctic-embed-l-v2.0" model-name))
    (is (= 1024 (:vector-dimensions model)))
    (is (= #{"arm64" "avx2"} (set (keys (:architectures model)))))
    (is (= {:inference-contract-version 1
            :djl-version                "0.36.0"
            :engine                     "OnnxRuntime"
            :pooling                    "cls"
            :normalize?                 true
            :include-token-types?       false}
           (:runtime model)))
    (is (re-matches #"[0-9a-f]{40}" (:model-revision model)))
    (is (str/ends-with? (:bundle-name model) (:model-revision model))
        "the DJL resource URL must change when the pinned model revision changes")
    (testing "every downloaded artifact has a pinned SHA-256"
      (is (every? #(re-matches #"[0-9a-f]{64}" %)
                  (concat (vals (:tokenizer-files model))
                          (map :sha256 (vals (:architectures model)))))))))
