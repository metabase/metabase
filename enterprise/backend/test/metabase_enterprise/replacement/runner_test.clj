(ns metabase-enterprise.replacement.runner-test
  "Tests for bulk metadata loading in the replacement runner."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.replacement.runner :as runner]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
                                                    :definition (mt/mbql-query venues
                                                                  {:aggregation [[:count]]})}]
      (let [entities          [[:card card-id]
                               [:segment segment-id]
                               [:measure measure-id]]
            metadata-provider (lib-be/application-database-metadata-provider (mt/id))
            loaded            (#'runner/bulk-load-metadata-for-entities!
                               metadata-provider
                               entities)]

        (testing "handles cards, segments, and measures in one batch"
          (is (= 3 (count loaded)))
          (is (contains? loaded [:card card-id]))
          (is (contains? loaded [:segment segment-id]))
          (is (contains? loaded [:measure measure-id])))

        (testing "all entities have required fields"
          (is (some? (:dataset_query (get loaded [:card card-id]))))
          (is (some? (:definition (get loaded [:segment segment-id]))))
          (is (some? (:definition (get loaded [:measure measure-id])))))))))

(deftest bulk-load-handles-empty-batch-test
  (testing "bulk-load-metadata-for-entities! handles empty batch gracefully"
    (let [entities          []
          metadata-provider (lib-be/application-database-metadata-provider (mt/id))
          loaded            ((requiring-resolve 'metabase-enterprise.replacement.runner/bulk-load-metadata-for-entities!)
                             metadata-provider
                             entities)]

      (testing "returns empty map for empty batch"
        (is (= {} loaded))))))

(deftest bulk-load-handles-dashboards-and-documents-test
  (testing "bulk-load-metadata-for-entities! ignores dashboards and documents (no-op entities)"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}]
      (let [entities          [[:dashboard dashboard-id]
                               [:document 123]]
            metadata-provider (lib-be/application-database-metadata-provider (mt/id))
            loaded            (#'runner/bulk-load-metadata-for-entities!
                               metadata-provider
                               entities)]

        (testing "dashboards and documents are not fetched (they don't need field ref upgrades)"
          (is (= {} loaded)))))))
