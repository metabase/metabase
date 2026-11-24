(ns metabase-enterprise.action-v2.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.db :as action-v2.db]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]))

(deftest pk-fields-for-table-honors-user-set-semantic-type-test
  (testing "pk-fields-for-table honors a user-set semantic_type that differs from the sync value"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id, :semantic_type nil}]
      (testing "sanity check: not a PK by sync"
        (is (= [] (map :id (action-v2.db/pk-fields-for-table table-id)))))
      (field-user-settings/upsert-field-user-settings! {:id field-id} {:semantic_type :type/PK})
      (is (= [field-id] (map :id (action-v2.db/pk-fields-for-table table-id)))))))

(deftest category-list-field-ids-by-name-honors-user-settings-test
  (testing "category-list-field-ids-by-name honors user-set has_field_values/semantic_type"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id, :name "STATUS"
                                                :has_field_values nil, :semantic_type nil}]
      (testing "sanity check: not a category-list field by sync"
        (is (= [] (action-v2.db/category-list-field-ids-by-name table-id ["status"]))))
      (field-user-settings/upsert-field-user-settings! {:id field-id} {:has_field_values :list
                                                                       :semantic_type    :type/Category})
      (is (= [{:id field-id, :lower_name "status"}]
             (action-v2.db/category-list-field-ids-by-name table-id ["status"]))))))
