(ns build.embedder-model-test
  (:require
   [build.embedder-model :as embedder-model]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]))

(deftest model-catalog-test
  (let [{:keys [catalog-version models]} (embedder-model/model-catalog)]
    (is (= 1 catalog-version))
    (is (= #{"Snowflake/snowflake-arctic-embed-l-v2.0"
             "sentence-transformers/all-MiniLM-L6-v2"}
           (set (keys models))))
    (doseq [[model-name model] models]
      (is (contains? #{384 1024} (:vector-dimensions model)))
      (is (= #{"arm64" "avx2"} (set (keys (:architectures model)))))
      (is (= {:inference-contract-version 1
              :djl-version                "0.36.0"
              :engine                     "OnnxRuntime"
              :normalize?                 true}
             (select-keys (:runtime model) [:inference-contract-version :djl-version :engine :normalize?])))
      (is (re-matches #"[0-9a-f]{40}" (:model-revision model)))
      (is (str/ends-with? (:bundle-name model) (:model-revision model))
          "the DJL resource URL must change when the pinned model revision changes")
      (testing (str model-name " has a pinned SHA-256 for every downloaded artifact")
        (is (every? #(re-matches #"[0-9a-f]{64}" %)
                    (concat (vals (:tokenizer-files model))
                            (map :sha256 (vals (:architectures model))))))))))
