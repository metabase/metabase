(ns metabase.metabot.infer-dataset-query-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.infer-dataset-query :as mbql-inference]
   [metabase.metabot.protocols :as metabot-protocols]))

(deftest rank-data-by-prompt-test
  (let [embedder (reify metabot-protocols/Embedder
                   (single [_ _]
                     [0 0.25 0.5 0.25]))]
    (is (= [{:object "C", :cosine-similarity 0.5}
            {:object "B", :cosine-similarity 0.25}
            {:object "D", :cosine-similarity 0.25}
            {:object "A", :cosine-similarity 0.0}]
           (mbql-inference/rank-data-by-prompt
            embedder
            "This prompt should match C"
            {"A" [1 0 0 0]
             "B" [0 1 0 0]
             "C" [0 0 1 0]
             "D" [0 0 0 1]})))))
