(ns metabase.sync.analyze.classify-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.no-preview-display :as classifiers.no-preview-display]
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

(deftest single-name-field-per-table-test
  (testing "On a new table with multiple eligible fields, only 1 field gets type/Name semantic type"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "users" :db_id (u/the-id db)}
                   :model/Field _ {:name "id" :base_type :type/Integer :table_id (u/the-id table)}
                   :model/Field _ {:name "fullName" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type       nil
                                   :fingerprint_version i/*latest-fingerprint-version*
                                   :last_analyzed       nil}
                   :model/Field _ {:name "firstName" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type       nil
                                   :fingerprint_version i/*latest-fingerprint-version*
                                   :last_analyzed       nil}
                   :model/Field _ {:name "lastName" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type       nil
                                   :fingerprint_version i/*latest-fingerprint-version*
                                   :last_analyzed       nil}]

      (classify/classify-fields! table)

      (let [name-fields (t2/select :model/Field
                                   :table_id (u/the-id table)
                                   :semantic_type :type/Name)]
        (is (= 1 (count name-fields)))

        ;; Should be the first name field encountered, but we can't assume a specific ordering
        (is (#{"lastName" "fullName" "firstName"} (:name (first name-fields))))))))

;; we either already incorrectly inferred multiple fields on a previous sync, or the user incorrectly set multiple fields.
;; let them sort it out rather than risk overriding their preferences

(deftest preserve-existing-name-fields-test
  (testing "On an existing table with 2 type/Name fields, they stay unchanged and adding more eligible  is a no-op"
    (mt/with-temp [:model/Database db {:engine :h2 :name "test-db"}
                   :model/Table table {:name "contacts" :db_id (u/the-id db)}
                   :model/Field _ {:name "id" :base_type :type/Integer :table_id (u/the-id table)}
                   :model/Field _ {:name "firstName"
                                   :base_type :type/Text
                                   :table_id (u/the-id table)
                                   :semantic_type :type/Name
                                   :last_analyzed :%now}
                   :model/Field _ {:name "lastName"
                                   :base_type :type/Text
                                   :table_id (u/the-id table)
                                   :semantic_type :type/Name
                                   :last_analyzed :%now}
                   :model/Field field {:name "name"
                                       :base_type :type/Text
                                       :table_id (u/the-id table)
                                       :semantic_type       nil
                                       :fingerprint_version i/*latest-fingerprint-version*
                                       :last_analyzed       nil}]
      (classify/classify-fields! table)

      (let [name-fields (t2/select :model/Field
                                   :table_id (u/the-id table)
                                   :semantic_type :type/Name)]
        (is (= 2 (count name-fields)))
        ;; The original fields should keep their type/Name
        (is (some #(= "firstName" (:name %)) name-fields))
        (is (some #(= "lastName" (:name %)) name-fields))

        (is (not= :type/Name (:semantic_type (t2/select-one :model/Field :id (u/the-id field)))))))))

(deftest no-name-field-candidates-test
  (testing "Table with no eligible name fields should not crash during classification"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "metrics" :db_id (u/the-id db)}
                   :model/Field _ {:name "id" :base_type :type/Integer :table_id (u/the-id table)}
                   :model/Field _ {:name "value" :base_type :type/Float :table_id (u/the-id table)}
                   :model/Field _ {:name "timestamp" :base_type :type/DateTime :table_id (u/the-id table)}]

      (is (not= ::thrown (try (classify/classify-fields! table) (catch Throwable _ ::thrown))))
      (let [name-fields (t2/select :model/Field
                                   :table_id (u/the-id table)
                                   :semantic_type :type/Name)]
        (is (= 0 (count name-fields)))))))

(deftest reclassification-preserves-name-field-test
  (testing "Re-running classification on table with existing name field preserves it"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "users" :db_id (u/the-id db)}
                   :model/Field _ {:name "userName"
                                   :base_type :type/Text
                                   :table_id (u/the-id table)
                                   :semantic_type :type/Name
                                   :last_analyzed :%now}
                   :model/Field _ {:name "lastName"
                                   :base_type :type/Text
                                   :table_id (u/the-id table)
                                   :semantic_type nil
                                   :fingerprint_version i/*latest-fingerprint-version*
                                   :last_analyzed nil}]

      ;; Run classification twice
      (classify/classify-fields! table)
      (classify/classify-fields! table)

      (let [name-fields (t2/select :model/Field
                                   :table_id (u/the-id table)
                                   :semantic_type :type/Name)]
        (is (= 1 (count name-fields)))
        (is (= "userName" (:name (first name-fields))))))))

(deftest non-semantic-type-classifiers-still-run-when-skipping-name-test
  (testing "Other field properties are still classified when skipping :type/Name classification"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "users" :db_id (u/the-id db)}
                   :model/Field _ {:name "full_name" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type :type/Name}
                   :model/Field field
                   {:name "name"
                    :base_type :type/Text
                    :table_id (u/the-id table)
                    :semantic_type nil
                    :preview_display true
                    :fingerprint_version i/*latest-fingerprint-version*
                    :last_analyzed nil}]

      (with-redefs [classifiers.no-preview-display/infer-no-preview-display
                    (fn [field _] (assoc field :preview_display false))]
        (classify/classify-fields! table))

      (let [updated-field (t2/select-one :model/Field :id (u/the-id field))]
        (is (not= :type/Name (:semantic_type updated-field)))
        (is (false? (:preview_display updated-field)))))))

(deftest deactivated-name-field-does-not-block-new-name-classification-test
  (testing "Deactivated :type/Name field should not prevent new field from being classified as :type/Name"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "users" :db_id (u/the-id db)}
                   :model/Field _ {:name "old_name" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type :type/Name
                                   :active false}
                   :model/Field new-name-field {:name "full_name" :base_type :type/Text :table_id (u/the-id table)
                                                :semantic_type nil
                                                :fingerprint_version i/*latest-fingerprint-version*
                                                :last_analyzed nil}]

      (classify/classify-fields! table)

      (let [updated-field (t2/select-one :model/Field :id (u/the-id new-name-field))]
        (is (= :type/Name (:semantic_type updated-field)))))))

(deftest mixed-active-inactive-name-fields-test
  (testing "Mix of active and inactive :type/Name fields - active one should block new classification"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "employees" :db_id (u/the-id db)}
                   :model/Field _ {:name "old_employee_name" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type :type/Name
                                   :active false}
                   :model/Field active-field {:name "current_name" :base_type :type/Text :table_id (u/the-id table)
                                              :semantic_type :type/Name
                                              :active true}
                   :model/Field potential-name {:name "display_name" :base_type :type/Text :table_id (u/the-id table)
                                                :semantic_type nil
                                                :active true
                                                :fingerprint_version i/*latest-fingerprint-version*
                                                :last_analyzed nil}]

      (classify/classify-fields! table)

      (let [updated-field (t2/select-one :model/Field :id (u/the-id potential-name))
            existing-field (t2/select-one :model/Field :id (u/the-id active-field))]
        (is (not= :type/Name (:semantic_type updated-field)))
        (is (= :type/Name (:semantic_type existing-field)))))))

(deftest retired-name-fields-dont-block-new-classification-test
  (testing "Retired :type/Name fields should not prevent new name classification"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "users" :db_id (u/the-id db)}
                   :model/Field _ {:name "old_username" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type :type/Name
                                   :visibility_type "retired"}
                   :model/Field new-name {:name "name" :base_type :type/Text :table_id (u/the-id table)
                                          :semantic_type nil
                                          :active true
                                          :visibility_type "normal"
                                          :fingerprint_version i/*latest-fingerprint-version*
                                          :last_analyzed nil}]

      (classify/classify-fields! table)

      (let [updated-field (t2/select-one :model/Field :id (u/the-id new-name))]
        (is (= :type/Name (:semantic_type updated-field)))))))

(deftest multiple-retired-and-deactivated-name-fields-test
  (testing "Mix of retired and deactivated :type/Name fields should not prevent new name classification"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "products" :db_id (u/the-id db)}

                   :model/Field _ {:name "legacy_name" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type :type/Name
                                   :active true
                                   :visibility_type "retired"}
                   :model/Field _ {:name "old_name" :base_type :type/Text :table_id (u/the-id table)
                                   :semantic_type :type/Name
                                   :active false
                                   :visibility_type "normal"}
                   :model/Field new-name {:name "name" :base_type :type/Text :table_id (u/the-id table)
                                          :semantic_type nil
                                          :active true
                                          :visibility_type "normal"
                                          :fingerprint_version i/*latest-fingerprint-version*
                                          :last_analyzed nil}]

      (classify/classify-fields! table)

      (let [updated-field (t2/select-one :model/Field :id (u/the-id new-name))]
        (is (= :type/Name (:semantic_type updated-field)))))))
