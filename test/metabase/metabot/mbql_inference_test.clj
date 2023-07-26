(ns metabase.metabot.mbql-inference-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.inference-ws-client :as inference-ws-client]
   [metabase.metabot.mbql-inference :as mbql-inference]
   [metabase.metabot.metabot-test-models :as mtm]
   [metabase.metabot.precomputes :as precomputes]
   [metabase.test :as mt]
   [metabase.models :as models]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest rank-data-by-prompt-test
  (with-redefs [inference-ws-client/bulk-embeddings
                (fn fake-bulk-embeddings
                  ([_base-url args]
                   (update-vals args {"This prompt should match C" [0 0.25 0.5 0.25]}))
                  ([_args] nil))]
    (is (= [{:object "C", :cosine-similarity 0.5}
            {:object "B", :cosine-similarity 0.25}
            {:object "D", :cosine-similarity 0.25}
            {:object "A", :cosine-similarity 0.0}]
           (mbql-inference/rank-data-by-prompt
            "http://example.com"
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
              test-url        "http://example.com"
              expected-result {:mbql  {:source-table "card__1"
                                       :filter       [">"
                                                      ["field" "TAX"
                                                       {:base-type :type/Float}]
                                                      0]},
                               :model "my_model"}
              source-query    {:database (mt/id)
                               :type     :query
                               :query    (mtm/full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [models/Card model {:name          test-model-name
                               :table_id      (mt/id :orders)
                               :dataset_query source-query
                               :dataset       true}]
            (with-redefs [mbql-inference/precomputes          (constantly
                                                               (reify precomputes/Precomputes
                                                                 (embeddings [_]
                                                                   {[:table (:id model)]       [0 1 0 0]
                                                                    [:table (inc (:id model))] [1 0 0 0]
                                                                    [:table (dec (:id model))] [0 0 0 1]})))
                          inference-ws-client/bulk-embeddings (fn [url objects-to-embed]
                                                                {:pre [(= url url)
                                                                       (= {test-prompt test-prompt} objects-to-embed)]}
                                                                {test-prompt [0 1 0 0]})
                          inference-ws-client/infer           (fn [url {:keys [prompt context]}]
                                                                {:pre [(= test-url url)
                                                                       (= test-prompt prompt)
                                                                       (= test-model-name (-> context first :table_name))]}
                                                                expected-result)]
              (is (= expected-result
                     (mbql-inference/infer-mbql
                      test-url
                      test-prompt))))))))))

