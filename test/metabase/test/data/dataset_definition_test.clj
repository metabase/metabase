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
                   [{:field-name "email" :base-type :type/Text :pk? true}]
                   [["ngoc@metabase.com"]]]
                  ["group"
                   [{:field-name "user_email" :base-type :type/Text :fk "user"}]
                   [["ngoc@metabase.com"]]])
      (let [user-fields  (t2/select [:model/Field :name :semantic_type :fk_target_field_id] :table_id (mt/id :user))
            group-fields (t2/select [:model/Field :name :semantic_type :fk_target_field_id] :table_id (mt/id :group))]
        (testing "user.email is a PK"
          (is (= [{:name               (ddl.i/format-name driver/*driver* "email")
                   :fk_target_field_id nil
                   :semantic_type      :type/PK}]
                 user-fields)))
        (testing "user_email is a FK non user.email"
          (is (= #{{:name               (ddl.i/format-name driver/*driver* "user_email")
                    :fk_target_field_id (mt/id :user :email)
                    :semantic_type      :type/FK}
                   {:name               (ddl.i/format-name driver/*driver* "id")
                    :fk_target_field_id nil
                    :semantic_type      :type/PK}}
                 (set group-fields))))))))
