(ns metabase.driver.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.db :as driver.db]
   [metabase.test :as mt]))

(deftest json-field-names-with-unfolding-disabled-honors-user-setting-test
  (testing "json-field-names-with-unfolding-disabled honors a user-set json_unfolding that differs from the sync value"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id, :name "PAYLOAD"
                                                :base_type :type/JSON, :json_unfolding true}]
      (testing "sanity check: unfolding is enabled by sync"
        (is (= #{} (driver.db/json-field-names-with-unfolding-disabled table-id))))
      (mt/with-temp [:model/FieldUserSettings _ {:field_id field-id, :json_unfolding false}]
        (is (= #{"PAYLOAD"} (driver.db/json-field-names-with-unfolding-disabled table-id)))))))
