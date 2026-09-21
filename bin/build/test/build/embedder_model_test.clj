(ns build.embedder-model-test
  (:require
   [build.embedder-model :as embedder-model]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]))

(deftest model-catalog-test
  (let [{:keys [catalog-version models]} (embedder-model/model-catalog)]
    (is (= 1 catalog-version))
    (is (= #{"Snowflake/snowflake-arctic-embed-xs"
             "sentence-transformers/all-MiniLM-L6-v2"}
           (set (keys models))))
    (is (= {"Snowflake/snowflake-arctic-embed-xs"
            {:vector-dimensions 384
             :runtime           {:inference-contract-version 1
                                 :djl-version                "0.36.0"
                                 :engine                     "OnnxRuntime"
                                 :pooling                    "cls"
                                 :normalize?                 true
                                 :include-token-types?       true}}
            "sentence-transformers/all-MiniLM-L6-v2"
            {:vector-dimensions 384
             :runtime           {:inference-contract-version 1
                                 :djl-version                "0.36.0"
                                 :engine                     "OnnxRuntime"
                                 :pooling                    "mean"
                                 :normalize?                 true
                                 :include-token-types?       true}}}
           (update-vals models #(select-keys % [:vector-dimensions :runtime]))))
    (doseq [[model-name model] models]
      (is (= #{"arm64" "avx2"} (set (keys (:architectures model)))))
      (is (re-matches #"[0-9a-f]{40}" (:model-revision model)))
      (is (str/ends-with? (:bundle-name model) (:model-revision model))
          "the DJL resource URL must change when the pinned model revision changes")
      (testing (str model-name " has a pinned SHA-256 for every downloaded artifact")
        (is (every? #(re-matches #"[0-9a-f]{64}" %)
                    (concat (vals (:tokenizer-files model))
                            (map :sha256 (vals (:architectures model))))))))))
