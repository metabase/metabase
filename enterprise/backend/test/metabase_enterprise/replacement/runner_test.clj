(ns metabase-enterprise.replacement.runner-test
  "Tests for bulk metadata loading in the replacement runner."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.runner :as runner]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment
  metabase-enterprise.dependencies.events/keep-me)

(deftest bulk-load-metadata-for-entities-test
  (testing "bulk-load-metadata-for-entities! fetches all entity types in bulk"
    (mt/with-temp [:model/Card {card-id-1 :id} {:name          "Card 1"
                                                :database_id   (mt/id)
                                                :dataset_query (mt/mbql-query venues)}
                   :model/Card {card-id-2 :id} {:name          "Card 2"
                                                :database_id   (mt/id)
                                                :dataset_query (mt/mbql-query checkins)}
                   :model/Table {table-id :id} {:name   "Custom Table"
                                                :db_id  (mt/id)
                                                :active true}
                   :model/Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                    :name       "Test Segment"
                                                    :definition (mt/mbql-query venues
                                                                  {:filter [:> $price 3]})}]
      (let [entities          [[:card card-id-1]
                               [:card card-id-2]
                               [:table table-id]
                               [:segment segment-id]]
            metadata-provider (lib-be/application-database-metadata-provider (mt/id))
            loaded            (#'runner/bulk-load-metadata-for-entities!
                               metadata-provider
                               entities)]

        (testing "returns map with all fetched entities"
          (is (map? loaded))
          (is (= 4 (count loaded))))

        (testing "card entities are keyed by [:card id]"
          (is (contains? loaded [:card card-id-1]))
          (is (contains? loaded [:card card-id-2]))
          (let [card1 (get loaded [:card card-id-1])
                card2 (get loaded [:card card-id-2])]
            (is (= "Card 1" (:name card1)))
            (is (= "Card 2" (:name card2)))
            (is (some? (:dataset_query card1)))
            (is (some? (:dataset_query card2)))))

        (testing "table entities are keyed by [:table id]"
          (is (contains? loaded [:table table-id]))
          (let [table (get loaded [:table table-id])]
            (is (= "Custom Table" (:name table)))))

        (testing "segment entities are keyed by [:segment id]"
          (is (contains? loaded [:segment segment-id]))
          (let [segment (get loaded [:segment segment-id])]
            (is (= "Test Segment" (:name segment)))
            (is (some? (:definition segment)))))))))

(deftest bulk-load-metadata-extracts-referenced-entities-test
  (testing "bulk-load-metadata-for-entities! extracts and loads referenced entities"
    (mt/with-temp [:model/Card {source-card-id :id} {:name          "Source Card"
                                                     :database_id   (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card {dep-1-card-id :id} {:name          "Dependent Card 1"
                                                    :database_id   (mt/id)
                                                    :dataset_query (mt/mbql-query venues
                                                                     {:source-table (str "card__" source-card-id)})}
                   :model/Card {dep-2-card-id :id} {:name          "Dependent Card 2"
                                                    :database_id   (mt/id)
                                                    :dataset_query (mt/mbql-query venues
                                                                     {:source-table (str "card__" dep-1-card-id)})}]
      (lib-be/with-metadata-provider-cache
        (let [entities          [[:card source-card-id]
                                 [:card dep-1-card-id]
                                 [:card dep-2-card-id]]
              metadata-provider (lib-be/application-database-metadata-provider (mt/id))
              value             (#'runner/bulk-load-metadata-for-entities!
                                 metadata-provider
                                 entities)
              ;; After bulk loading, the source card should be in the metadata provider's cache
              source-card-meta  (lib.metadata/card metadata-provider source-card-id)]

          (testing "referenced cards are loaded into metadata provider cache"
            (is (some? source-card-meta))
            (is (= "Source Card" (:name source-card-meta)))
            (is (some? (lib.metadata.protocols/cached-value
                        metadata-provider :metadata/card source-card-id)))
            (is (some? (lib.metadata.protocols/cached-value
                        metadata-provider :metadata/card dep-1-card-id)))
            (is (some? (lib.metadata.protocols/cached-value
                        metadata-provider :metadata/card dep-2-card-id)))
            (is (some? (lib.metadata/card metadata-provider dep-2-card-id)))
            (is (=? #{[:card source-card-id] [:card dep-1-card-id] [:card dep-2-card-id]}
                    (-> value keys set)))))))))

(deftest bulk-load-handles-multiple-entity-types-test
  (testing "bulk-load-metadata-for-entities! handles mixed entity types"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Test Card"
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query venues)}
                   :model/Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                    :name       "Test Segment"
                                                    :definition (mt/mbql-query venues
                                                                  {:filter [:> $price 3]})}
                   :model/Measure {measure-id :id} {:table_id   (mt/id :venues)
                                                    :name       "Test Measure"
                                                    :definition (let [mp (mt/metadata-provider)
                                                                      table-metadata (lib.metadata/table mp (mt/id :venues))]
                                                                  (-> (lib/query mp table-metadata)
                                                                      (lib/aggregate (lib/count))))}
                   :model/Dashboard {dashboard-id :id} {:name        "Test Dashboard"
                                                        :parameters [{:id "param1" :type :string/= :name "Test Param"}]}]
      (let [entities          [[:card card-id]
                               [:segment segment-id]
                               [:measure measure-id]
                               [:dashboard dashboard-id]]
            metadata-provider (lib-be/application-database-metadata-provider (mt/id))
            loaded            (#'runner/bulk-load-metadata-for-entities!
                               metadata-provider
                               entities)]

        (testing "handles cards, segments, measures, and dashboards in one batch"
          (is (= 4 (count loaded)))
          (is (contains? loaded [:card card-id]))
          (is (contains? loaded [:segment segment-id]))
          (is (contains? loaded [:measure measure-id]))
          (is (contains? loaded [:dashboard dashboard-id])))

        (testing "all entities have required fields"
          (is (some? (:dataset_query (get loaded [:card card-id]))))
          (is (some? (:definition (get loaded [:segment segment-id]))))
          (is (some? (:definition (get loaded [:measure measure-id]))))
          (is (= [{:id "param1" :type :string/= :name "Test Param"}] (:parameters (get loaded [:dashboard dashboard-id])))))))))

(deftest bulk-load-handles-empty-batch-test
  (testing "bulk-load-metadata-for-entities! handles empty batch gracefully"
    (let [entities          []
          metadata-provider (lib-be/application-database-metadata-provider (mt/id))
          loaded            (#'runner/bulk-load-metadata-for-entities!
                             metadata-provider
                             entities)]

      (testing "returns empty map for empty batch"
        (is (= {} loaded))))))

(deftest bulk-load-handles-dashboards-and-documents-test
  (testing "bulk-load-metadata-for-entities! pre-loads dashboards but ignores documents"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name        "Test Dashboard"
                                                        :parameters [{:id "param1" :type :string/= :name "Test Param"}]}]
      (let [entities          [[:dashboard dashboard-id]
                               [:document 123]]
            metadata-provider (lib-be/application-database-metadata-provider (mt/id))
            loaded            (#'runner/bulk-load-metadata-for-entities!
                               metadata-provider
                               entities)]

        (testing "dashboards are pre-loaded"
          (is (= [{:id "param1" :type :string/= :name "Test Param"}] (:parameters (get loaded [:dashboard dashboard-id])))))

        (testing "documents are not fetched (no-op entities)"
          (is (not (contains? loaded [:document 123]))))))))

(deftest run-swap-source!-updates-dependent-cards-test
  (testing "run-swap-source! upgrades field refs and swaps source for all transitive dependents"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Card {old-id :id :as old-card}
                         {:database_id   (mt/id)
                          :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                          :type          :model
                          :name          "Old Model"}

                         :model/Card {new-id :id}
                         {:database_id   (mt/id)
                          :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                          :type          :model
                          :name          "New Model"}

                         :model/Card {child-id :id :as child-card}
                         {:database_id   (mt/id)
                          :dataset_query (lib/query mp (lib.metadata/card mp old-id))
                          :type          :question
                          :name          "Child Card"}]
            (mt/with-model-cleanup [:model/Dependency]
              ;; populate dependencies
              (events/publish-event! :event/card-create {:object old-card :user-id (mt/user->id :rasta)})
              (events/publish-event! :event/card-create {:object child-card :user-id (mt/user->id :rasta)})

              (testing "child card initially points to old model"
                (is (= old-id (get-in (t2/select-one-fn :dataset_query :model/Card :id child-id)
                                      [:stages 0 :source-card]))))

              (let [progress-log (atom [])
                    progress     (reify replacement.protocols/IRunnerProgress
                                   (set-total! [_ total] (swap! progress-log conj [:set-total total]))
                                   (advance! [_] (swap! progress-log conj [:advance 1]))
                                   (advance! [_ n] (swap! progress-log conj [:advance n]))
                                   (canceled? [_] false)
                                   (start-run! [_])
                                   (succeed-run! [_])
                                   (fail-run! [_ _]))]
                (runner/run-swap-source! [:card old-id] [:card new-id] progress)

                (testing "child card's source-card is updated to new model"
                  (is (= new-id (get-in (t2/select-one-fn :dataset_query :model/Card :id child-id)
                                        [:stages 0 :source-card]))))

                (testing "progress was tracked"
                  (is (some #(= :set-total (first %)) @progress-log)
                      "set-total! should have been called")
                  (is (seq (filter #(= :advance (first %)) @progress-log))
                      "advance! should have been called"))))))))))
