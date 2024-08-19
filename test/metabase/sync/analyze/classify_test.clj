(ns metabase.sync.analyze.classify-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.sync.analyze.classify :as classify]
   [metabase.sync.interface :as i]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest fields-to-classify-test
  (testing "Finds current fingerprinted versions that are not analyzed"
    (t2.with-temp/with-temp [Table table {}
                             Field _ {:table_id            (u/the-id table)
                                      :name                "expected"
                                      :description         "Current fingerprint, not analyzed"
                                      :fingerprint_version i/*latest-fingerprint-version*
                                      :last_analyzed       nil}
                             Field _ {:table_id            (u/the-id table)
                                      :name                "not expected 1"
                                      :description         "Current fingerprint, already analzed"
                                      :fingerprint_version i/*latest-fingerprint-version*
                                      :last_analyzed       #t "2017-08-09"}
                             Field _ {:table_id            (u/the-id table)
                                      :name                "not expected 2"
                                      :description         "Old fingerprint, not analyzed"
                                      :fingerprint_version (dec i/*latest-fingerprint-version*)
                                      :last_analyzed       nil}
                             Field _ {:table_id            (u/the-id table)
                                      :name                "not expected 3"
                                      :description         "Old fingerprint, already analzed"
                                      :fingerprint_version (dec i/*latest-fingerprint-version*)
                                      :last_analyzed       #t "2017-08-09"}]
      (is (= ["expected"]
             (for [field (#'classify/fields-to-classify table)]
               (:name field)))))))

(deftest fields-to-classify-test-2
  (testing "Finds previously marked :type/category fields for state"
    (t2.with-temp/with-temp [Table table {}
                             Field _ {:table_id            (u/the-id table)
                                      :name                "expected"
                                      :description         "Current fingerprint, not analyzed"
                                      :fingerprint_version i/*latest-fingerprint-version*
                                      :last_analyzed       nil}
                             Field _ {:table_id            (u/the-id table)
                                      :name                "not expected 1"
                                      :description         "Current fingerprint, already analzed"
                                      :fingerprint_version i/*latest-fingerprint-version*
                                      :last_analyzed       #t "2017-08-09"}
                             Field _ {:table_id            (u/the-id table)
                                      :name                "not expected 2"
                                      :description         "Old fingerprint, not analyzed"
                                      :fingerprint_version (dec i/*latest-fingerprint-version*)
                                      :last_analyzed       nil}
                             Field _ {:table_id            (u/the-id table)
                                      :name                "not expected 3"
                                      :description         "Old fingerprint, already analzed"
                                      :fingerprint_version (dec i/*latest-fingerprint-version*)
                                      :last_analyzed       #t "2017-08-09"}])))

(deftest classify-fields-for-db!-test
  (testing "We classify decimal fields that have specially handled NaN values"
    (t2.with-temp/with-temp [Database db    {}
                             Table    table {:db_id (u/the-id db)}
                             Field    field {:table_id            (u/the-id table)
                                             :name                "Income"
                                             :base_type           :type/Float
                                             :semantic_type       nil
                                             :fingerprint_version i/*latest-fingerprint-version*
                                             :fingerprint         {:type   {:type/Number {:min "NaN"
                                                                                          :max "NaN"
                                                                                          :avg "NaN"}}
                                                                   :global {:distinct-count 3}}
                                             :last_analyzed       nil}]
      (is (nil? (:semantic_type (t2/select-one Field :id (u/the-id field)))))
      (classify/classify-fields-for-db! db (constantly nil))
      (is (= :type/Income (:semantic_type (t2/select-one Field :id (u/the-id field))))))))

(deftest classify-decimal-fields-test
  (testing "We can classify decimal fields that have specially handled infinity values"
    (t2.with-temp/with-temp [Database db    {}
                             Table    table {:db_id (u/the-id db)}
                             Field    field {:table_id            (u/the-id table)
                                              :name                "Income"
                                              :base_type           :type/Float
                                              :semantic_type       nil
                                              :fingerprint_version i/*latest-fingerprint-version*
                                              :fingerprint         {:type   {:type/Number {:min "-Infinity"
                                                                                           :max "Infinity"
                                                                                           :avg "Infinity"}}
                                                                    :global {:distinct-count 3}}
                                              :last_analyzed       nil}]
      (is (nil? (:semantic_type (t2/select-one Field :id (u/the-id field)))))
      (classify/classify-fields-for-db! db (constantly nil))
      (is (= :type/Income (:semantic_type (t2/select-one Field :id (u/the-id field))))))))
