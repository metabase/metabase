(ns metabase-enterprise.dependencies.broken-dependencies-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.task.backfill :as deps.backfill]
   [metabase.lib-be.core :as lib-be]
   [metabase.test :as mt]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(deftest ^:sequential delete-transform-table-shown-as-broken-dependency-test
  (testing "GHY-3257: Deleting a transform's table causes dependent cards to show as broken"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [table-name "ghy_3257_test"]
            (let [schema   (transforms.tu/get-test-schema)
                  query    (mt/mbql-query transforms_products)
                  ;; 1. POST a transform
                  transform-resp (mt/user-http-request :crowberto :post 200 "transform"
                                                       {:name   "GHY-3257 Test Transform"
                                                        :source {:type  "query"
                                                                 :query query}
                                                        :target {:type   "table"
                                                                 :schema schema
                                                                 :name   table-name}})
                  transform-id   (:id transform-resp)]
              (is (some? transform-id) "Transform should be created successfully")

              ;; 2. POST a transform run
              (transforms.tu/test-run transform-id)

              ;; Find the output table
              (let [output-table (transforms.tu/wait-for-table table-name 10000)
                    output-table-id (:id output-table)]
                (is (some? output-table-id) "Transform run should create an output table")

                ;; 3. POST a card querying the transform's output table
                (mt/with-model-cleanup [:model/Card]
                  (let [card-resp (mt/user-http-request :crowberto :post 200 "card"
                                                        {:name                   "GHY-3257 Dependent Card"
                                                         :display                :table
                                                         :dataset_query          {:database (mt/id)
                                                                                  :type     :query
                                                                                  :query    {:source-table output-table-id}}
                                                         :visualization_settings {}})
                        card-id   (:id card-resp)]
                    (is (some? card-id) "Card should be created successfully")

                    ;; Run dependency backfill and analysis
                    (while (#'deps.backfill/backfill-dependencies!))
                    (lib-be/with-metadata-provider-cache
                      (deps.findings/upsert-analysis! (t2/select-one :model/Card :id card-id)))

                    ;; 4. GET dependency graph for the card
                    (let [graph (mt/user-http-request :crowberto :get 200
                                                      (format "ee/dependencies/graph?type=card&id=%d" card-id))]

                      (testing "precondition: card depends on the output table in the dependency graph"
                        (let [table-nodes (->> (:nodes graph)
                                               (filter #(= "table" (:type %)))
                                               (filter #(= output-table-id (:id %))))]
                          (is (seq table-nodes)
                              "Output table should appear in the card's upstream dependency graph")))

                      (testing "precondition: card analysis is passing (not broken)"
                        (let [finding (t2/select-one :model/AnalysisFinding
                                                     :analyzed_entity_type "card"
                                                     :analyzed_entity_id card-id)]
                          (is (true? (:result finding))
                              "Card should pass analysis before table deletion"))))

                    ;; === Reproduce the bug ===

                    ;; 5. DELETE the transform's table
                    ;; 6. DELETE the transform
                    (mt/user-http-request :crowberto :delete 204 (format "transform/%s/table" transform-id))
                    (mt/user-http-request :crowberto :delete 204 (format "transform/%s" transform-id))

                    ;; Re-run analysis on the card with fresh metadata
                    #_(lib-be/with-metadata-provider-cache
                        (deps.findings/upsert-analysis! (t2/select-one :model/Card :id card-id)))

                    ;; 7. REPRO BUG: card should now show as broken
                    (testing "REPRO GHY-3257: card should be broken because its source table was deactivated"
                      (let [finding (t2/select-one :model/AnalysisFinding :analyzed_entity_type "card" :analyzed_entity_id card-id)]
                        (is (=? {:result false} (t2/select-one :model/AnalysisFinding :analyzed_entity_type "card" :analyzed_entity_id card-id))
                            "Card analysis should fail when its source table is deactivated"))

                      (testing "deactivated table should appear as breaking in /graph/breaking"
                        (let [breaking (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking" :types "table")]
                          ;; TODO - What should be the assertion here? Is the card broken? Is the table broken?
                          (is (=? [{:id output-table-id}] (:data breaking)) "Deactivated table should appear as a breaking entity"))))))))))))))

; Create query based on table
; Directly mark table as inactive (update with T2)
; Run backfill-dependencies!
; Assert that broken dependencies are returned

