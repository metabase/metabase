(ns metabase-enterprise.sandbox.models.params.field-values-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Field FieldValues]]
            [metabase.models.field-values :as field-values]
            [metabase.models.params.field-values :as params.field-values]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest get-or-create-advanced-field-values!
  (doseq [fv-type [:sandbox :linked-filter]]
    (testing "create a new field values and fix up the human readable values"
      (mt/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:and
                                                                                      [:> $id 3]
                                                                                      [:< $id 6]]})}}}
        ;; the categories-id doesn't have a field values, we fake it with a full fieldvalues to make it easier to test
        (db/insert! FieldValues {:type                  :full
                                 :field_id              (mt/id :categories :id)
                                 :values                (range 10)
                                 :human_readable_values (map #(str "id_" %) (range 10))})
        (let [categories-id (mt/id :categories :id)
              fv            (params.field-values/get-or-create-advanced-field-values!
                              fv-type
                              (db/select-one Field :id (mt/id :categories :id)))]
          (is (= 1 (db/count FieldValues :field_id categories-id :type fv-type)))
          (is (= [4 5] (:values fv)))
          (is (= ["id_4" "id_5"] (:human_readable_values fv)))
          (is (some? (:hash_key fv)))

          (testing "call second time shouldn't create a new FieldValues"
            (params.field-values/get-or-create-advanced-field-values!
              :sandbox
              (db/select-one Field :id (mt/id :categories :id)))
            (is (= 1 (db/count FieldValues :field_id categories-id :type fv-type)))))))

    (testing "make sure the Fieldvalues respect [field-values/*total-max-length*]"
      (mt/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:and
                                                                                      [:> $id 3]
                                                                                      [:< $id 6]]})}}}
        (binding [field-values/*total-max-length* 5]
          (is (= ["Asian"]
                 (:values (params.field-values/get-or-create-advanced-field-values!
                            fv-type
                            (db/select-one Field :id (mt/id :categories :name)))))))))))
