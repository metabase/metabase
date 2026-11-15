(ns metabase.permissions.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.db :as permissions.db]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]))

(deftest field-visibility-info-honors-user-set-visibility-type-test
  (testing "field-visibility-info honors a user-set visibility_type (e.g. sensitive) over the sync value"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id, :visibility_type "normal"}]
      (testing "sanity check: the sync value shows by default"
        (is (=? {:id field-id, :visibility_type :normal, :table_id table-id}
                (first (permissions.db/field-visibility-info #{field-id})))))
      (field-user-settings/upsert-field-user-settings! {:id field-id} {:visibility_type :sensitive})
      (is (=? {:id field-id, :visibility_type :sensitive, :table_id table-id}
              (first (permissions.db/field-visibility-info #{field-id})))))))
