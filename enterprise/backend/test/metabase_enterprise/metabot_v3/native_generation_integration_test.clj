(ns metabase-enterprise.metabot-v3.native-generation-integration-test
  "Integration tests for native example question generation path.

  Tests the full regenerate endpoint flow with `use-native-agent=true`."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.example-question-generator :as native-generator]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- make-native-prompt-generator
  "Create a mock that mimics the native generator's per-item output shape."
  [prompts-by-name]
  (fn [payload]
    {:table_questions  (mapv (fn [table]
                               {:questions (get prompts-by-name (:name table) [])})
                             (:tables payload))
     :metric_questions (mapv (fn [metric]
                               {:questions (get prompts-by-name (:name metric) [])})
                             (:metrics payload))}))

(deftest regenerate-endpoint-with-native-path-test
  (mt/dataset test-data
    (let [mp (mt/metadata-provider)
          model-source-query (lib/query mp (lib.metadata/table mp (mt/id :products)))
          metric-source-query (-> model-source-query
                                  (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                                  (lib/breakout (lib/with-temporal-bucket
                                                  (lib.metadata/field mp (mt/id :products :created_at)) :week)))
          metric-data {:description "Test metric"
                       :dataset_query (lib/->legacy-MBQL metric-source-query)
                       :type :metric}
          model-data  {:description "Test model"
                       :dataset_query (lib/->legacy-MBQL model-source-query)
                       :type :model}]
      (mt/with-premium-features #{:metabot-v3}
        (mt/with-temp [:model/Collection {coll-id :id}   {}
                       :model/Collection {child-id :id}  {:location (collection/location-path coll-id)}
                       :model/Card _ (assoc model-data  :name "NativeModel1"  :collection_id coll-id)
                       :model/Card _ (assoc metric-data :name "NativeMetric1" :collection_id child-id)
                       :model/Metabot {metabot-id :id} {:name "native-test-bot" :collection_id coll-id}]

          (let [prompts-by-name {"NativeModel1"  ["native q1" "native q2" "native q3" "native q4" "native q5"]
                                 "NativeMetric1" ["native m1" "native m2" "native m3" "native m4" "native m5"]}
                native-mock (make-native-prompt-generator prompts-by-name)]

            (testing "regenerate endpoint works with native path (use-native-agent=true)"
              (with-redefs [metabot-v3.settings/use-native-agent        (constantly true)
                            native-generator/generate-example-questions  native-mock]
                (mt/user-http-request :crowberto :post 204
                                      (format "ee/metabot-v3/metabot/%d/prompt-suggestions/regenerate" metabot-id)))

              (let [prompts (t2/select [:model/MetabotPrompt :prompt :model [:card.name :model_name]]
                                       :metabot_id metabot-id
                                       {:join     [[:report_card :card] [:= :card.id :card_id]]
                                        :order-by [:metabot_prompt.id]})]
                (is (= 10 (count prompts)))
                (is (= (set (mapcat val prompts-by-name))
                       (set (map :prompt prompts))))
                (is (= #{:model :metric}
                       (set (map :model prompts))))))

            (testing "native path prompts are replaced on re-regenerate"
              (let [old-ids (t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id)]
                (with-redefs [metabot-v3.settings/use-native-agent        (constantly true)
                              native-generator/generate-example-questions  native-mock]
                  (mt/user-http-request :crowberto :post 204
                                        (format "ee/metabot-v3/metabot/%d/prompt-suggestions/regenerate" metabot-id)))
                (let [new-ids (t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id)]
                  (is (= 10 (count new-ids)))
                  (is (empty? (set/intersection old-ids new-ids))))))))))))
