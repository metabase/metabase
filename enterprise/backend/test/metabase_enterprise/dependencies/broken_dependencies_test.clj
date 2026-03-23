(ns metabase-enterprise.dependencies.broken-dependencies-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.task.backfill :as deps.backfill]
   [metabase-enterprise.dependencies.task.entity-check :as deps.entity-check]
   [metabase.lib-be.core :as lib-be]
   [metabase.sync.sync :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(deftest ^:sequential deactivated-table-shown-as-breaking-test
  (testing "GHY-3257: A deactivated table should appear in /graph/breaking when a card depends on it"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card]
        (let [;; Use the ORDERS table as our target — it already exists in the test dataset
              table-id (mt/id :orders)

              ;; 1. Create a card that queries the table
              card-resp (mt/user-http-request :crowberto :post 200 "card"
                                              {:name                   "GHY-3257 Test Card"
                                               :display                :table
                                               :dataset_query          (mt/mbql-query orders)
                                               :visualization_settings {}})
              card-id   (:id card-resp)]
          (is (some? card-id) "Card should be created successfully")

          ;; 2. Run backfill so dependencies and analysis are established
          (while (#'deps.backfill/backfill-dependencies!))
          (lib-be/with-metadata-provider-cache
            (#'deps.entity-check/check-entities!))

          ;; Preconditions
          (testing "precondition: card has a dependency on the table"
            (is (seq (t2/select :model/Dependency
                                :from_entity_type :card
                                :from_entity_id card-id
                                :to_entity_type :table
                                :to_entity_id table-id))
                "Card should depend on the orders table"))

          (testing "precondition: card analysis is passing"
            (is (= :fail (t2/select-one-fn :result :model/AnalysisFinding
                                           :analyzed_entity_type "card"
                                           :analyzed_entity_id card-id)))
            (is (= :fail (t2/select-one-fn :result :model/AnalysisFindingError
                                           :analyzed_entity_type "card"
                                           :analyzed_entity_id card-id)))
            (is (true? (t2/select-one-fn :result :model/AnalysisFinding
                                         :analyzed_entity_type "card"
                                         :analyzed_entity_id card-id))
                "Card should pass analysis before table deactivation"))

          ;; 3. Deactivate the table (simulating what DELETE /api/transform/:id/table does)
          (t2/update! :model/Table table-id {:active false})

          (try
            (sync/sync-database! (mt/db))
            ;; 4. Mark the card's analysis as stale so the background job will re-analyze it.
            ;;    In the real flow, this should happen via an event when the table is deactivated
            (deps.analysis-finding/mark-stale! :card [card-id])

            ;; 5. Run the entity check job to re-analyze the card
            (lib-be/with-metadata-provider-cache
              (#'deps.entity-check/check-entities!))

            ;; 6. Assert that the card is now broken
            (testing "card analysis should fail after table deactivation"
              (is (= :fail (t2/select-one-fn :result :model/AnalysisFinding
                                             :analyzed_entity_type "card"
                                             :analyzed_entity_id card-id)))
              (is (= :fail (t2/select-one-fn :result :model/AnalysisFindingError
                                             :analyzed_entity_type "card"
                                             :analyzed_entity_id card-id)))
              (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                            :analyzed_entity_type "card"
                                            :analyzed_entity_id card-id))
                  "Card analysis should fail when its source table is deactivated"))

            ;; 7. Assert the deactivated table appears in /graph/breaking
            (testing "deactivated table should appear as breaking in /graph/breaking"
              (let [breaking (mt/user-http-request :crowberto :get 200
                                                   "ee/dependencies/graph/breaking"
                                                   :types "table")]
                (is (= :fail (:data breaking)))
                (is (some #(= table-id (:id %))
                          (:data breaking))
                    "Deactivated table should appear as a breaking entity")))

            (finally
              ;; Restore the table so we don't break other tests
              (t2/update! :model/Table table-id {:active true}))))))))
