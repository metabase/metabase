(ns metabase.parameters.field-values-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- field-values-call-count
  "The number of statements reading the FieldValues of `n` Fields of a fresh Table issues for rasta, with fresh ids."
  [n]
  (mt/with-temp [:model/Table {table-id :id} {:db_id (mt/id) :name "fresh_table"}]
    (let [field-ids (vec (for [i (range n)]
                           (t2/insert-returning-pk! :model/Field {:table_id         table-id
                                                                  :name             (str "field_" i)
                                                                  :base_type        :type/Text
                                                                  :database_type    "VARCHAR"
                                                                  :has_field_values :list})))]
      (t2/insert! :model/FieldValues (for [field-id field-ids]
                                       {:field_id field-id :type :full :values ["a" "b"]}))
      (mt/with-test-user :rasta
        (t2/with-call-count [call-count]
          (is (= (set field-ids)
                 (set (keys (params.field-values/field-id->field-values-for-current-user field-ids)))))
          (call-count))))))

(deftest field-id->field-values-for-current-user-call-count-test
  (testing "reading the FieldValues of more Fields of a fresh Table issues no more statements"
    (field-values-call-count 1)
    (is (= (field-values-call-count 2)
           (field-values-call-count 6)))))

(defn- stale-field-values-call-count!
  "The number of statements getting the FieldValues of `n` Fields of a fresh Table issues for rasta, each Field's full
  FieldValues unused for 60 days and kept active by another FieldValues of it used today."
  [n]
  (mt/with-temp [:model/Table {table-id :id} {:db_id (mt/id) :name "fresh_table"}]
    (let [field-ids (vec (for [i (range n)]
                           (t2/insert-returning-pk! :model/Field {:table_id         table-id
                                                                  :name             (str "field_" i)
                                                                  :base_type        :type/Text
                                                                  :database_type    "VARCHAR"
                                                                  :has_field_values :list})))]
      (t2/insert! :model/FieldValues (for [field-id field-ids]
                                       {:field_id     field-id
                                        :type         :full
                                        :values       ["a" "b"]
                                        :last_used_at (t/minus (t/offset-date-time) (t/days 60))}))
      (t2/insert! :model/FieldValues (for [field-id field-ids]
                                       {:field_id     field-id
                                        :type         :advanced
                                        :hash_key     "recent"
                                        :values       ["a"]
                                        :last_used_at (t/offset-date-time)}))
      (let [fields (t2/select :model/Field :id [:in field-ids])]
        (mt/with-test-user :rasta
          (t2/with-call-count [call-count]
            (is (= (set field-ids)
                   (set (keys (params.field-values/get-or-create-field-values-by-field-id! fields)))))
            (call-count)))))))

(deftest get-or-create-field-values-by-field-id-stale-call-count-test
  (testing "getting the stale but active FieldValues of more Fields of a fresh Table issues no more statements"
    (stale-field-values-call-count! 1)
    (is (= (stale-field-values-call-count! 2)
           (stale-field-values-call-count! 6)))))
