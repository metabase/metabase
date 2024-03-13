(ns metabase.test.data.dataset-definition-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest dataset-with-custom-pk-test
  (mt/test-drivers (disj (mt/sql-jdbc-drivers)
                         ;; presto doesn't create PK for test data :) not sure why
                         :presto-jdbc
                         ;; creating db for athena is expensive and require some extra steps,
                         ;; so it's not worth testing against, see [[metabase.test.data.athena/*allow-database-creation*]]
                         :athena
                         ;; there is no PK in sparksql
                         :sparksql)
    (mt/dataset (mt/dataset-definition "custom-pk"
                  ["user"
                   [{:field-name "custom_id" :base-type :type/Integer :pk? true}]
                   [[1]]]
                  ["group"
                   [{:field-name "user_custom_id" :base-type :type/Integer :fk "user"}]
                   [[1]]])
      (let [user-fields  (t2/select [:model/Field :name :semantic_type :fk_target_field_id] :table_id (mt/id :user))
            group-fields (t2/select [:model/Field :name :semantic_type :fk_target_field_id] :table_id (mt/id :group))
            format-name  #(ddl.i/format-name driver/*driver* %)]
        (testing "user.custom_id is a PK"
          (is (= [{:name               (format-name "custom_id")
                   :fk_target_field_id nil
                   :semantic_type      :type/PK}]
                 user-fields)))
        (when-not (#{:sqlite} driver/*driver*) ;; our implement does not support adding fk for custom dataset yet
          (testing "user_custom_id is a FK non user.custom_id"
            (is (= #{{:name               (format-name "user_custom_id")
                      :fk_target_field_id (mt/id :user :custom_id)
                      :semantic_type      :type/FK}
                     {:name               (format-name "id")
                      :fk_target_field_id nil
                      :semantic_type      :type/PK}}
                   (set group-fields)))))))))
