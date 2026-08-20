(ns metabase-enterprise.embeddings.client-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.embeddings.client :as embeddings.client]
   [metabase-enterprise.semantic-search.core :as semantic-search]))

(set! *warn-on-reflection* true)

(deftest legacy-model-dimensions-are-normalized-test
  (let [captured (atom nil)]
    (with-redefs [semantic-search/get-embeddings-batch
                  (fn [model texts & {:as opts}]
                    (reset! captured [model texts opts])
                    [[1.0 2.0]])]
      (is (= [[1.0 2.0]]
             (embeddings.client/get-embeddings-batch
              {:provider "ai-service" :model-name "model" :model-dimensions 2}
              ["text"]
              :record-tokens? false)))
      (is (= [{:provider "ai-service" :model-name "model" :vector-dimensions 2}
              ["text"]
              {:record-tokens? false}]
             @captured)))))

(deftest conflicting-dimension-keys-are-rejected-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"conflicting dimension values"
                        (embeddings.client/get-embeddings-batch
                         {:provider          "ai-service"
                          :model-name        "model"
                          :model-dimensions  2
                          :vector-dimensions 3}
                         ["text"]))))
