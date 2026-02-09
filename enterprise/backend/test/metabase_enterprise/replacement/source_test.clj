(ns metabase-enterprise.replacement.source-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.source :as replacement.source]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest table-replaceable-with-itself-test
  (testing "Every table in test-data is replaceable with itself"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables]
          (testing (str "table: " (:name table))
            (is (empty? (replacement.source/check-replace-source mp table table)))))))))

(deftest card-swappable-with-underlying-table-test
  (testing "A card built on a table is swappable with that table in both directions"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables
                legacy? [true false]]
          (let [query (cond-> (lib/query mp table)
                        legacy? lib.convert/->legacy-MBQL)]
            (mt/with-temp [:model/Card card {:dataset_query query
                                             :database_id   (mt/id)
                                             :type          :question}]
              (let [card-meta (lib.metadata/card mp (:id card))]
                (testing (str "table: " (:name table))
                  (testing "card -> table"
                    (is (empty? (replacement.source/check-replace-source mp card-meta table))))
                  (testing "table -> card"
                    (is (empty? (replacement.source/check-replace-source mp table card-meta)))))))))))))

(deftest two-cards-on-same-table-swappable-test
  (testing "Two cards built on the same table are swappable in both directions"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables
                legacy-original? [true false]
                legacy-replacement? [true false]]
          (mt/with-temp [:model/Card card-a {:dataset_query (cond-> (lib/query mp table)
                                                              legacy-original? lib.convert/->legacy-MBQL)
                                             :database_id   (mt/id)
                                             :type          :question}
                         :model/Card card-b {:dataset_query (cond-> (lib/query mp table)
                                                              legacy-replacement? lib.convert/->legacy-MBQL)
                                             :database_id   (mt/id)
                                             :type          :question}]
            (let [meta-a (lib.metadata/card mp (:id card-a))
                  meta-b (lib.metadata/card mp (:id card-b))]
              (testing (str "table: " (:name table))
                (testing "card-a -> card-b"
                  (is (empty? (replacement.source/check-replace-source mp meta-a meta-b))))
                (testing "card-b -> card-a"
                  (is (empty? (replacement.source/check-replace-source mp meta-b meta-a))))))))))))

