(ns metabase.permissions.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.warehouse-schema.db :as warehouse-schema.db]))

(deftest field-visibility-info-honors-user-set-visibility-type-test
  (testing "field-visibility-info honors a user-set visibility_type (e.g. sensitive) over the sync value"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id, :visibility_type "normal"}]
      (testing "sanity check: the sync value shows by default"
        (is (=? {:id field-id, :visibility_type :normal, :table_id table-id}
                (first (warehouse-schema.db/fields-by-ids {:field-ids #{field-id} :columns [:id :visibility_type :table_id]})))))
      (mt/with-temp [:model/FieldUserSettings _ {:field_id field-id, :visibility_type :sensitive}]
        (is (=? {:id field-id, :visibility_type :sensitive, :table_id table-id}
                (first (warehouse-schema.db/fields-by-ids {:field-ids #{field-id} :columns [:id :visibility_type :table_id]}))))))))
