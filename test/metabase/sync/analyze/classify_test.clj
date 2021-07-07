(ns metabase.sync.analyze.classify-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.field-values :as field-values]
            [metabase.models.table :refer [Table]]
            [metabase.sync.analyze.classify :as classify]
            [metabase.sync.interface :as i]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

(deftest fields-to-classify-test
  (testing "Finds current fingerprinted versions that are not analyzed"
    (tt/with-temp* [Table [table]
                    Field [_ {:table_id            (u/the-id table)
                              :name                "expected"
                              :description         "Current fingerprint, not analyzed"
                              :fingerprint_version i/latest-fingerprint-version
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/the-id table)
                              :name                "not expected 1"
                              :description         "Current fingerprint, already analzed"
                              :fingerprint_version i/latest-fingerprint-version
                              :last_analyzed       #t "2017-08-09"}]
                    Field [_ {:table_id            (u/the-id table)
                              :name                "not expected 2"
                              :description         "Old fingerprint, not analyzed"
                              :fingerprint_version (dec i/latest-fingerprint-version)
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/the-id table)
                              :name                "not expected 3"
                              :description         "Old fingerprint, already analzed"
                              :fingerprint_version (dec i/latest-fingerprint-version)
                              :last_analyzed       #t "2017-08-09"}]]
      (is (= ["expected"]
             (for [field (#'classify/fields-to-classify table)]
               (:name field))))))
  (testing "Finds previously marked :type/category fields for state"
    (tt/with-temp* [Table [table]
                    Field [_ {:table_id            (u/the-id table)
                              :name                "expected"
                              :description         "Current fingerprint, not analyzed"
                              :fingerprint_version i/latest-fingerprint-version
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/the-id table)
                              :name                "not expected 1"
                              :description         "Current fingerprint, already analzed"
                              :fingerprint_version i/latest-fingerprint-version
                              :last_analyzed       #t "2017-08-09"}]
                    Field [_ {:table_id            (u/the-id table)
                              :name                "not expected 2"
                              :description         "Old fingerprint, not analyzed"
                              :fingerprint_version (dec i/latest-fingerprint-version)
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/the-id table)
                              :name                "not expected 3"
                              :description         "Old fingerprint, already analzed"
                              :fingerprint_version (dec i/latest-fingerprint-version)
                              :last_analyzed       #t "2017-08-09"}]])))

(deftest classify-fields-for-db!-test
  (testing "We classify decimal fields that have specially handled NaN values"
    (tt/with-temp* [Database [db]
                    Table    [table {:db_id (u/the-id db)}]
                    Field    [field {:table_id            (u/the-id table)
                                     :name                "Income"
                                     :base_type           :type/Float
                                     :semantic_type       nil
                                     :fingerprint_version i/latest-fingerprint-version
                                     :fingerprint         {:type   {:type/Number {:min "NaN"
                                                                                  :max "NaN"
                                                                                  :avg "NaN"}}
                                                           :global {:distinct-count 3}}
                                     :last_analyzed       nil}]]
      (is (nil? (:semantic_type (Field (u/the-id field)))))
      (classify/classify-fields-for-db! db [table] (constantly nil))
      (is (= :type/Income (:semantic_type (Field (u/the-id field)))))))
  (testing "We can classify decimal fields that have specially handled infinity values"
    (tt/with-temp* [Database [db]
                    Table    [table {:db_id (u/the-id db)}]
                    Field    [field {:table_id            (u/the-id table)
                                     :name                "Income"
                                     :base_type           :type/Float
                                     :semantic_type       nil
                                     :fingerprint_version i/latest-fingerprint-version
                                     :fingerprint         {:type   {:type/Number {:min "-Infinity"
                                                                                  :max "Infinity"
                                                                                  :avg "Infinity"}}
                                                           :global {:distinct-count 3}}
                                     :last_analyzed       nil}]]
      (is (nil? (:semantic_type (Field (u/the-id field)))))
      (classify/classify-fields-for-db! db [table] (constantly nil))
      (is (= :type/Income (:semantic_type (Field (u/the-id field))))))))

(defn- ->field [field]
  (field/map->FieldInstance
    (merge {:fingerprint_version i/latest-fingerprint-version
            :semantic_type       nil}
           field)))

(deftest run-classifiers-test
  (testing "Fields marked state are not overridden"
    (let [field (->field {:name "state", :base_type :type/Text, :semantic_type :type/State})]
      (is (= :type/State (:semantic_type (classify/run-classifiers field nil))))))
  (testing "Fields with few values are marked as category and list"
    (let [field      (->field {:name "state", :base_type :type/Text})
          classified (classify/run-classifiers field {:global
                                                      {:distinct-count
                                                       (dec field-values/category-cardinality-threshold)
                                                       :nil% 0.3}})]
      (is (= {:has_field_values :auto-list, :semantic_type :type/Category}
             (select-keys classified [:has_field_values :semantic_type])))))
  (testing "Earlier classifiers prevent later classifiers"
    (let [field       (->field {:name "site_url" :base_type :type/Text})
          fingerprint {:global {:distinct-count 4
                                :nil%           0}}
          classified  (classify/run-classifiers field fingerprint)]
      (is (= {:has_field_values :auto-list, :semantic_type :type/URL}
             (select-keys classified [:has_field_values :semantic_type])))))
  (testing "Classififying using fingerprinters can override previous classifications"
    (testing "Classify state fields on fingerprint rather than name"
      (let [field       (->field {:name "order_state" :base_type :type/Text})
            fingerprint {:global {:distinct-count 4
                                  :nil%           0}
                         :type   {:type/Text {:percent-state 0.98}}}
            classified  (classify/run-classifiers field fingerprint)]
        (is (= {:has_field_values :auto-list, :semantic_type :type/State}
               (select-keys classified [:has_field_values :semantic_type])))))
    (let [field       (->field {:name "order_status" :base_type :type/Text})
          fingerprint {:type {:type/Text {:percent-json 0.99}}}]
      (is (= :type/SerializedJSON
             ;; this will be marked as :type/Category based on name, but fingerprinters should override
             (:semantic_type (classify/run-classifiers field fingerprint)))))))
