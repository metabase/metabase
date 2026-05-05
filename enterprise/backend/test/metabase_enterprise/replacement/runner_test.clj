(ns metabase-enterprise.replacement.runner-test
  "Tests for bulk metadata loading in the replacement runner."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.runner :as replacement.runner]
   [metabase-enterprise.replacement.source-swap :as replacement.source-swap]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-user-settings]
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
            loaded            (#'replacement.runner/bulk-load-metadata-for-entities!
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
              value             (#'replacement.runner/bulk-load-metadata-for-entities!
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
            loaded            (#'replacement.runner/bulk-load-metadata-for-entities!
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
          loaded            (#'replacement.runner/bulk-load-metadata-for-entities!
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
            loaded            (#'replacement.runner/bulk-load-metadata-for-entities!
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
            (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus]
              ;; populate dependencies
              (events/publish-event! :event/card-create {:object old-card :user-id (mt/user->id :rasta)})
              (events/publish-event! :event/card-create {:object child-card :user-id (mt/user->id :rasta)})
              (deps.test/synchronously-run-backfill!)

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
                #_{:clj-kondo/ignore [:unresolved-var]}
                (replacement.runner/run-swap-source! [:card old-id] [:card new-id] progress)

                (testing "child card's source-card is updated to new model"
                  (is (= new-id (get-in (t2/select-one-fn :dataset_query :model/Card :id child-id)
                                        [:stages 0 :source-card]))))

                (testing "progress was tracked"
                  (is (some #(= :set-total (first %)) @progress-log)
                      "set-total! should have been called")
                  (is (seq (filter #(= :advance (first %)) @progress-log))
                      "advance! should have been called"))))))))))

(deftest run-swap-source!-partial-failure-test
  (testing "run-swap-source! continues past individual swap failures and throws composite error"
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

                         :model/Card {child-1-id :id :as child-1}
                         {:database_id   (mt/id)
                          :dataset_query (lib/query mp (lib.metadata/card mp old-id))
                          :type          :question
                          :name          "Child 1"}

                         :model/Card {child-2-id :id :as child-2}
                         {:database_id   (mt/id)
                          :dataset_query (lib/query mp (lib.metadata/card mp old-id))
                          :type          :question
                          :name          "Child 2"}]
            (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus]
              (doseq [card [old-card child-1 child-2]]
                (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :rasta)}))
              (deps.test/synchronously-run-backfill!)

              (let [original-swap! replacement.source-swap/swap-source!]
                (with-redefs [replacement.source-swap/swap-source!
                              (fn [entity object old-source new-source]
                                (if (= (second entity) child-1-id)
                                  (throw (ex-info "Simulated swap failure" {:entity entity}))
                                  (original-swap! entity object old-source new-source)))]
                  (let [ex (is (thrown-with-msg? clojure.lang.ExceptionInfo #"1 of 2 entities failed"
                                                 (replacement.runner/run-swap-source!
                                                  [:card old-id] [:card new-id])))]
                    (testing "failure details are in ex-data"
                      (is (= 1 (count (:failures (ex-data ex))))))

                    (testing "child-2 was still swapped successfully"
                      (is (= new-id (get-in (t2/select-one-fn :dataset_query :model/Card :id child-2-id)
                                            [:stages 0 :source-card]))))

                    (testing "child-1 retains original source (swap failed)"
                      (is (= old-id (get-in (t2/select-one-fn :dataset_query :model/Card :id child-1-id)
                                            [:stages 0 :source-card]))))))))))))))

(deftest copy-model-metadata-overrides!-test
  (testing "copies user-edited metadata from model result_metadata to Field and FieldUserSettings"
    (mt/with-temp [:model/Table {table-id :id} {:name   "transform_output"
                                                :db_id  (mt/id)
                                                :active true}
                   :model/Field {field-1-id :id} {:name         "TOTAL"
                                                  :table_id     table-id
                                                  :base_type    :type/Float
                                                  :display_name "Total"
                                                  :description  nil
                                                  :semantic_type nil}
                   :model/Field {field-2-id :id} {:name         "CREATED_AT"
                                                  :table_id     table-id
                                                  :base_type    :type/DateTimeWithLocalTZ
                                                  :display_name "Created At"
                                                  :description  nil
                                                  :semantic_type nil}
                   :model/Card {card-id :id} {:type          :model
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query orders)}]
      ;; Set result_metadata directly via SQL to bypass Card hooks that recompute metadata
      (t2/query-one {:update :report_card
                     :set    {:result_metadata
                              (json/encode [{:name          "TOTAL"
                                             :display_name  "Order Total"
                                             :description   "The total amount"
                                             :semantic_type "type/Currency"
                                             :base_type     "type/Float"}
                                            {:name          "CREATED_AT"
                                             :display_name  "Order Date"
                                             :semantic_type "type/CreationTimestamp"
                                             :base_type     "type/DateTimeWithLocalTZ"}])}
                     :where  [:= :id card-id]})

      (#'replacement.runner/copy-model-metadata-overrides! card-id table-id)

      (testing "Field records are updated with overrides from model metadata"
        (let [field-1 (t2/select-one :model/Field :id field-1-id)
              field-2 (t2/select-one :model/Field :id field-2-id)]
          (is (= "Order Total" (:display_name field-1)))
          (is (= "The total amount" (:description field-1)))
          (is (= :type/Currency (:semantic_type field-1)))

          (is (= "Order Date" (:display_name field-2)))
          (is (= :type/CreationTimestamp (:semantic_type field-2)))))

      (testing "FieldUserSettings are created so overrides survive sync"
        (let [fus-1 (t2/select-one :model/FieldUserSettings :field_id field-1-id)
              fus-2 (t2/select-one :model/FieldUserSettings :field_id field-2-id)]
          (is (some? fus-1))
          (is (= "Order Total" (:display_name fus-1)))
          (is (= "The total amount" (:description fus-1)))
          (is (= :type/Currency (:semantic_type fus-1)))

          (is (some? fus-2))
          (is (= "Order Date" (:display_name fus-2)))
          (is (= :type/CreationTimestamp (:semantic_type fus-2)))))))

  (testing "matches joined columns using :lib/desired-column-alias instead of :name"
    (mt/with-temp [:model/Table {table-id :id} {:name   "transform_joined_output"
                                                :db_id  (mt/id)
                                                :active true}
                   ;; The output table has a field named Products__ID (from the join)
                   :model/Field {field-id :id} {:name         "Products__ID"
                                                :table_id     table-id
                                                :base_type    :type/Integer
                                                :display_name "Products  ID"
                                                :description  nil
                                                :semantic_type nil}
                   :model/Card {card-id :id} {:type          :model
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query orders)}]
      ;; result_metadata has :name "ID" but :lib/desired-column-alias "Products__ID"
      (t2/query-one {:update :report_card
                     :set    {:result_metadata
                              (json/encode [{:name                      "ID"
                                             :lib/desired-column-alias  "Products__ID"
                                             :display_name              "Product ID"
                                             :description               "The product identifier"
                                             :base_type                 "type/Integer"}])}
                     :where  [:= :id card-id]})

      (#'replacement.runner/copy-model-metadata-overrides! card-id table-id)

      (let [field (t2/select-one :model/Field :id field-id)]
        (is (= "Product ID" (:display_name field)))
        (is (= "The product identifier" (:description field))))

      (let [fus (t2/select-one :model/FieldUserSettings :field_id field-id)]
        (is (some? fus))
        (is (= "Product ID" (:display_name fus)))
        (is (= "The product identifier" (:description fus)))))))
