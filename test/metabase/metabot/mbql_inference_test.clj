(ns metabase.metabot.mbql-inference-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.mbql-inference :as mbql-inference]
   [metabase.metabot.metabot-test-models :as mtm]
   [metabase.metabot.precomputes :as precomputes]
   [metabase.metabot.task-api :as task-api]
   [metabase.metabot.inference-ws.task-impl :as task-impl]
   [metabase.metabot.util :as metabot-util]
   [metabase.test :as mt]
   [metabase.models :as models]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest rank-data-by-prompt-test
  (let [embedder (reify task-api/Embedder
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

(deftest infer-mbql-test
  (testing "The context generated from a model should conform to the schema."
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [test-prompt     "Show data where tax is greater than zero"
              test-model-name "My infer mbql test model"
              expected-result {:mbql  {:source-table "card__1"
                                       :filter       [">"
                                                      ["field" "TAX"
                                                       {:base-type :type/Float}]
                                                      0]},
                               :model "my_model"}
              source-query    {:database (mt/id)
                               :type     :query
                               :query    (mtm/full-join-orders-test-query)}]
          (let [inferencer        (reify task-api/MBQLInferencer
                                    (infer-mbql [_ _]
                                      expected-result))
                embedder          (reify task-api/Embedder
                                    (single [_ _]
                                      [0 1 0 0]))
                context-generator (task-impl/inference-ws-context-generator)]
            (t2.with-temp/with-temp
             [models/Card model {:name          test-model-name
                                 :table_id      (mt/id :orders)
                                 :dataset_query source-query
                                 :dataset       true}]
              (with-redefs [mbql-inference/precomputes (constantly
                                                        (reify precomputes/Precomputes
                                                          (embeddings [_]
                                                            {[:table (:id model)]       [0 1 0 0]
                                                             [:table (inc (:id model))] [1 0 0 0]
                                                             [:table (dec (:id model))] [0 0 0 1]})))]
                (is (= expected-result
                       (mbql-inference/infer-mbql
                        {:inferencer        inferencer
                         :embedder          embedder
                         :context-generator context-generator}
                        test-prompt)))))))))))

