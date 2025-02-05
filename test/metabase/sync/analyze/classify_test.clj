(ns metabase.sync.analyze.classify-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.analyze.classify :as classify]
   [metabase.sync.interface :as i]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest ^:parallel fields-to-classify-test
  (testing "Finds current fingerprinted versions that are not analyzed"
    (mt/with-temp [:model/Table table {}
                   :model/Field _ {:table_id            (u/the-id table)
                                   :name                "expected"
                                   :description         "Current fingerprint, not analyzed"
                                   :fingerprint_version i/*latest-fingerprint-version*
                                   :last_analyzed       nil}
                   :model/Field _ {:table_id            (u/the-id table)
                                   :name                "not expected 1"
                                   :description         "Current fingerprint, already analzed"
                                   :fingerprint_version i/*latest-fingerprint-version*
                                   :last_analyzed       #t "2017-08-09"}
                   :model/Field _ {:table_id            (u/the-id table)
                                   :name                "not expected 2"
                                   :description         "Old fingerprint, not analyzed"
                                   :fingerprint_version (dec i/*latest-fingerprint-version*)
                                   :last_analyzed       nil}
                   :model/Field _ {:table_id            (u/the-id table)
                                   :name                "not expected 3"
                                   :description         "Old fingerprint, already analzed"
                                   :fingerprint_version (dec i/*latest-fingerprint-version*)
                                   :last_analyzed       #t "2017-08-09"}]
      (is (= ["expected"]
             (for [field (#'classify/fields-to-classify table)]
               (:name field)))))))

(deftest ^:parallel fields-to-classify-test-2
  (testing "Finds previously marked :type/category fields for state"
    (mt/with-temp [:model/Table table {}
                   :model/Field _ {:table_id            (u/the-id table)
                                   :name                "expected"
                                   :description         "Current fingerprint, not analyzed"
                                   :fingerprint_version i/*latest-fingerprint-version*
                                   :last_analyzed       nil}
                   :model/Field _ {:table_id            (u/the-id table)
                                   :name                "not expected 1"
                                   :description         "Current fingerprint, already analzed"
                                   :fingerprint_version i/*latest-fingerprint-version*
                                   :last_analyzed       #t "2017-08-09"}
                   :model/Field _ {:table_id            (u/the-id table)
                                   :name                "not expected 2"
                                   :description         "Old fingerprint, not analyzed"
                                   :fingerprint_version (dec i/*latest-fingerprint-version*)
                                   :last_analyzed       nil}
                   :model/Field _ {:table_id            (u/the-id table)
                                   :name                "not expected 3"
                                   :description         "Old fingerprint, already analzed"
                                   :fingerprint_version (dec i/*latest-fingerprint-version*)
                                   :last_analyzed       #t "2017-08-09"}]
      (is (= ["expected"]
             (for [field (#'classify/fields-to-classify table)]
               (:name field)))))))

(deftest classify-fields-for-db!-test
  (testing "We classify decimal fields that have specially handled NaN values"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db)}
                   :model/Field    field {:table_id            (u/the-id table)
                                          :name                "Income"
                                          :base_type           :type/Float
                                          :semantic_type       nil
                                          :fingerprint_version i/*latest-fingerprint-version*
                                          :fingerprint         {:type   {:type/Number {:min "NaN"
                                                                                       :max "NaN"
                                                                                       :avg "NaN"}}
                                                                :global {:distinct-count 3}}
                                          :last_analyzed       nil}]
      (is (nil? (:semantic_type (t2/select-one :model/Field :id (u/the-id field)))))
      (classify/classify-fields-for-db! db (constantly nil))
      (is (= :type/Income (:semantic_type (t2/select-one :model/Field :id (u/the-id field))))))))

(deftest classify-decimal-fields-test
  (testing "We can classify decimal fields that have specially handled infinity values"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db)}
                   :model/Field    field {:table_id            (u/the-id table)
                                          :name                "Income"
                                          :base_type           :type/Float
                                          :semantic_type       nil
                                          :fingerprint_version i/*latest-fingerprint-version*
                                          :fingerprint         {:type   {:type/Number {:min "-Infinity"
                                                                                       :max "Infinity"
                                                                                       :avg "Infinity"}}
                                                                :global {:distinct-count 3}}
                                          :last_analyzed       nil}]
      (is (nil? (:semantic_type (t2/select-one :model/Field :id (u/the-id field)))))
      (classify/classify-fields-for-db! db (constantly nil))
      (is (= :type/Income (:semantic_type (t2/select-one :model/Field :id (u/the-id field))))))))
