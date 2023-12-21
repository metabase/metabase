(ns ^:mb/once metabase.sync.sync-metadata.sync-database-type-test
  "Tests to make sure the newly added Field.database_type field gets populated, even for existing Fields."
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Database Field Table]]
   [metabase.sync :as sync]
   [metabase.sync.util-test :as sync.util-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest update-database-type-test
  (testing "make sure that if a driver reports back a different database-type the Field gets updated accordingly"
    (t2.with-temp/with-temp [Database db (select-keys (mt/db) [:details :engine])]
      (sync/sync-database! db)
      (let [venues-table (t2/select-one Table :db_id (u/the-id db), :display_name "Venues")]
        ;; ok, now give all the Fields `?` as their `database_type`. (This is what the DB migration does for existing
        ;; Fields)
        (t2/update! Field {:table_id (u/the-id venues-table)}, {:database_type "?"})
        ;; now sync the DB again
        (let [{:keys [step-info task-history]} (sync.util-test/sync-database! "sync-fields" db)]
          (is (= {:total-fields 52, :updated-fields 6}
                 (sync.util-test/only-step-keys step-info)))
          (is (= {:total-fields 52, :updated-fields 6}
                 (:task_details task-history)))
          (testing "The database_type of these Fields should get set to the correct types. Let's see..."
            (is (= #{{:name "PRICE",       :database_type "INTEGER"}
                     {:name "CATEGORY_ID", :database_type "INTEGER"}
                     {:name "ID",          :database_type "BIGINT"}
                     {:name "LATITUDE",    :database_type "DOUBLE PRECISION"}
                     {:name "LONGITUDE",   :database_type "DOUBLE PRECISION"}
                     {:name "NAME",        :database_type "CHARACTER VARYING"}}
                   (set (mt/derecordize
                         (t2/select [Field :name :database_type] :table_id (u/the-id venues-table))))))))))))

(deftest update-base-type-test
  (testing "make sure that if a driver reports back a different base-type the Field gets updated accordingly"
    (t2.with-temp/with-temp [Database db (select-keys (mt/db) [:details :engine])]
      (let [{new-step-info :step-info, new-task-history :task-history} (sync.util-test/sync-database! "sync-fields" db)
            venues-table                                               (t2/select-one Table :db_id (u/the-id db), :display_name "Venues")]
        ;; ok, now give all the Fields `:type/*` as their `base_type`
        (t2/update! Field {:table_id (u/the-id venues-table)}, {:base_type "type/*"})
        ;; now sync the DB again
        (let [{after-step-info :step-info, after-task-history :task-history} (sync.util-test/sync-database! "sync-fields" db)]
          (is (= {:updated-fields 52, :total-fields 52}
                 (sync.util-test/only-step-keys new-step-info)))
          (is (= {:updated-fields 52, :total-fields 52}
                 (:task_details new-task-history)))
          (is (= {:updated-fields 6, :total-fields 52}
                 (sync.util-test/only-step-keys after-step-info)))
          (is (= {:updated-fields 6, :total-fields 52}
                 (:task_details after-task-history)))
          (testing "The database_type of these Fields should get set to the correct types. Let's see..."
            (is (= #{{:name "CATEGORY_ID", :base_type :type/Integer}
                     {:name "LONGITUDE",   :base_type :type/Float}
                     {:name "PRICE",       :base_type :type/Integer}
                     {:name "LATITUDE",    :base_type :type/Float}
                     {:name "NAME",        :base_type :type/Text}
                     {:name "ID",          :base_type :type/BigInteger}}
                   (set (mt/derecordize
                         (t2/select [Field :name :base_type] :table_id (u/the-id venues-table))))))))))))
