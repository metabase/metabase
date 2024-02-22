(ns metabase.test.data.dataset-definition-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest dataset-with-custom-pk-test
  (mt/test-drivers (mt/sql-jdbc-drivers)
    (mt/dataset (mt/dataset-definition "custom-pk"
                  ["user"
                   [{:field-name "uuid" :base-type :type/UUID :pk? true}]
                   [[#uuid "201014e3-81bc-4349-a64f-d5519571297b"]]]
                  ["group"
                   [{:field-name "user_uuid" :base-type :type/UUID :fk "user"}]
                   [[#uuid "201014e3-81bc-4349-a64f-d5519571297b"]]])
      (let [user-fields  (t2/select [:model/Field :name :semantic_type :fk_target_field_id] :table_id (mt/id :user))
            group-fields (t2/select [:model/Field :name :semantic_type :fk_target_field_id] :table_id (mt/id :group))]
        (testing "user.uuid is PK"
          (is (= [{:name               (ddl.i/format-name driver/*driver* "uuid")
                   :fk_target_field_id nil
                   :semantic_type      :type/PK}]
                 user-fields)))
        (testing "user_uuid is FK of user table"
          (is (= #{{:name               (ddl.i/format-name driver/*driver* "user_uuid")
                    :fk_target_field_id (mt/id :user :uuid)
                    :semantic_type      :type/FK}
                   {:name               (ddl.i/format-name driver/*driver* "id")
                    :fk_target_field_id nil
                    :semantic_type      :type/PK}}
                 (set group-fields))))))))
