(ns metabase.test.data.dataset-definition-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.timeseries-query-processor-test.util :as tqpt]
   [toucan2.core :as t2]))

(deftest dataset-with-custom-pk-test
  (mt/test-drivers (->> (mt/normal-drivers-with-feature :metadata/key-constraints)
                        (filter (mt/sql-jdbc-drivers))
                        ;; Timeseries drivers currently support only testing with pre-loaded dataset
                        (remove (tqpt/timeseries-drivers)))
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
        (when (driver.u/supports? driver/*driver* :foreign-keys (mt/db))
          (testing "user_custom_id is a FK non user.custom_id"
            (is (= #{{:name               (format-name "user_custom_id")
                      :fk_target_field_id (mt/id :user :custom_id)
                      :semantic_type      :type/FK}
                     {:name               (format-name "id")
                      :fk_target_field_id nil
                      :semantic_type      :type/PK}}
                   (set group-fields)))))))))

(mt/defdataset composite-pk
  [["songs"
    [{:field-name "artist_id", :base-type :type/Integer, :pk? true}
     {:field-name "song_id",   :base-type :type/Integer, :pk? true}]
    [[1 2]]]])

(deftest dataset-with-custom-composite-pk-test
  (mt/test-drivers (->> (mt/normal-drivers-with-feature :metadata/key-constraints)
                        (filter (mt/sql-jdbc-drivers))
                        ;; Timeseries drivers currently support only testing with pre-loaded dataset
                        (remove (tqpt/timeseries-drivers)))
    (mt/dataset composite-pk
      (let [format-name #(ddl.i/format-name driver/*driver* %)]
        (testing "(artist_id, song_id) is a PK"
          (is (= #{(format-name "artist_id")
                   (format-name "song_id")}
                 (t2/select-fn-set :name :model/Field
                                   :table_id (mt/id :songs)
                                   :semantic_type :type/PK))))))))
