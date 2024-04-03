(ns metabase.models.query-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models :refer [Card]]
   [metabase.models.query :as query]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel query->database-and-table-ids-test
  (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id)
                                                      :type     :query
                                                      :query    {:source-table (mt/id :venues)}}}]
    (doseq [[message {:keys [expected query]}]
            {"A basic query"
             {:expected {:database-id 1, :table-id 1}
              :query    {:database 1
                         :type     :query
                         :query    {:source-table 1}}}

             "For native queries, table-id should be nil"
             {:expected {:database-id 1, :table-id nil}
              :query    {:database 1
                         :type     :native
                         :native   {:query "SELECT * FROM some_table;"}}}

             "If the query has a card__id source table, we should fetch database and table ID from the Card"
             {:expected {:database-id (mt/id)
                         :table-id    (mt/id :venues)}
              :query    {:database 1000
                         :type     :query
                         :query    {:source-table (format "card__%d" (:id card))}}}

             "If the query has a source-query we should recursively look at the database/table ID of the source query"
             {:expected {:database-id 5, :table-id 6}
              :query    {:database 5
                         :type     :query
                         :query    {:source-query {:source-table 6}}}}}]
      (testing message
        (is (= expected
               (into {} (query/query->database-and-table-ids query))))))))

(deftest ^:parallel query->database-and-table-ids-pMBQL-test
  (testing "Should work for pMBQL queries"
    (let [venues (lib.metadata/table meta/metadata-provider (meta/id :venues))
          query  (lib/query meta/metadata-provider venues)]
      (is (= {:database-id (meta/id), :table-id (meta/id :venues)}
             (query/query->database-and-table-ids query))))))

(deftest ^:parallel query->database-and-table-ids-pMBQL-source-card-test
  (testing "Should handle source-card lookup for pMBQL queries"
    (let [metadata-provider      (lib.tu/metadata-provider-with-cards-for-queries
                                  meta/metadata-provider
                                  [(lib/query meta/metadata-provider (lib.metadata/table meta/metadata-provider (meta/id :venues)))])
          query-with-source-card (lib/query metadata-provider (lib.metadata/card metadata-provider 1))]
      (is (=? {:stages [{:lib/type :mbql.stage/mbql, :source-card 1}]}
              query-with-source-card))
      (is (= {:database-id (meta/id), :table-id (meta/id :venues)}
             (query/query->database-and-table-ids query-with-source-card))))))

(deftest ^:parallel collect-card-ids-legacy-native-query-template-tags-test
  (let [query {:database 1
               :type     :native
               :native   {:query         "SELECT *;"
                          :template-tags {"tag_1" {:type    :card
                                                   :card-id 100}
                                          "tag_2" {:type    :card
                                                   :card-id 200}}}}]
    (is (= #{100 200}
           (set (query/collect-card-ids query))))))

(deftest ^:parallel collect-card-ids-legacy-query-source-card-test
  (let [query {:database 1
               :type     :query
               :query    {:source-query {:source-table "card__1000"}}}]
    (is (= #{1000}
           (set (query/collect-card-ids query))))))

(deftest ^:parallel collect-card-ids-pmbql-native-query-template-tags-test
  (let [query (lib/query meta/metadata-provider {:lib/type      :mbql.stage/native
                                                 :native        "SELECT *;"
                                                 :template-tags {"tag_1" {:name         "tag_1"
                                                                          :display-name "Tag 1"
                                                                          :type         :card
                                                                          :card-id      100}
                                                                 "tag_2" {:name         "tag_2"
                                                                          :display-name "Tag 2"
                                                                          :type         :card
                                                                          :card-id      200}}})]
    (is (= #{100 200}
           (set (query/collect-card-ids query))))))

(deftest ^:parallel collect-card-ids-pmbql-query-source-card-test
  (let [metadata-provider      (lib.tu/metadata-provider-with-cards-for-queries
                                meta/metadata-provider
                                [(lib/query meta/metadata-provider (lib.metadata/table meta/metadata-provider (meta/id :venues)))])
        query-with-source-card (lib/query metadata-provider (lib.metadata/card metadata-provider 1))]
    (is (= #{1}
           (set (query/collect-card-ids query-with-source-card))))))
