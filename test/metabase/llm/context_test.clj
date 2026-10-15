(ns metabase.llm.context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.context :as context]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest get-tables-with-columns-hides-unreadable-fk-target-test
  (testing "an FK on a readable table does not reveal an unreadable target table or field"
    (mt/with-temp [:model/Database db         {}
                   :model/Table    target     {:db_id              (:id db)
                                               :name               "secret_table"
                                               :schema             "private"}
                   :model/Field    target-id  {:table_id           (:id target)
                                               :name               "secret_id"
                                               :database_type      "INTEGER"
                                               :base_type          :type/Integer}
                   :model/Table    source     {:db_id              (:id db)
                                               :name               "orders"
                                               :schema             "public"}
                   :model/Field    _source-id {:table_id           (:id source)
                                               :name               "id"
                                               :database_type      "INTEGER"
                                               :base_type          :type/Integer}
                   :model/Field    _source-fk {:table_id           (:id source)
                                               :name               "user_id"
                                               :database_type      "INTEGER"
                                               :base_type          :type/Integer
                                               :semantic_type      :type/FK
                                               :fk_target_field_id (:id target-id)}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) db :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms-group/all-users) source :perms/create-queries :query-builder-and-native)
        (mt/with-test-user :rasta
          (let [result (context/get-tables-with-columns (:id db) #{(:id source)})
                fk-col (some #(when (= "user_id" (:name %)) %) (-> result first :columns))]
            (is (some? fk-col) "the readable source FK column is returned")
            (is (not (contains? fk-col :fk_target)))
            (is (not (str/includes? (pr-str result) "secret_table")))
            (is (not (str/includes? (pr-str result) "secret_id")))))))))

(deftest get-tables-with-columns-does-not-require-database-read-access-test
  (mt/with-temp [:model/Database db {}
                 :model/Table    table {:db_id (:id db) :name "orders" :schema "public"}
                 :model/Field    _f {:table_id      (:id table)
                                     :name          "id"
                                     :database_type "INTEGER"
                                     :base_type     :type/Integer}]
    (mt/with-no-data-perms-for-all-users!
      (mt/with-test-user :rasta
        (testing "a user with no access to the database gets an empty result, rather than a hard 403 -- this
                  endpoint (POST /api/llm/extract-sources) must not deny its :card_ids behavior over unrelated
                  table access"
          (is (nil? (context/get-tables-with-columns (:id db) #{(:id table)}))))))))

;;; ----------------------------------------- extract-tables-from-sql Tests -----------------------------------------

(deftest extract-tables-from-sql-test
  (testing "returns empty set for nil inputs"
    (is (= #{} (context/extract-tables-from-sql nil nil)))
    (is (= #{} (context/extract-tables-from-sql 1 nil)))
    (is (= #{} (context/extract-tables-from-sql nil "SELECT 1"))))
  (testing "returns empty set for empty SQL"
    (is (= #{} (context/extract-tables-from-sql 1 "")))
    (is (= #{} (context/extract-tables-from-sql 1 "   ")))))

(deftest extract-tables-from-sql-with-sample-database-test
  (mt/with-test-user :crowberto
    (testing "extracts single table from simple SELECT"
      (let [result (context/extract-tables-from-sql (mt/id) "SELECT * FROM ORDERS")]
        (is (set? result))
        (is (contains? result (mt/id :orders)))))
    (testing "extracts multiple tables from JOIN"
      (let [result (context/extract-tables-from-sql (mt/id)
                                                    "SELECT * FROM ORDERS o JOIN PRODUCTS p ON o.PRODUCT_ID = p.ID")]
        (is (set? result))
        (is (contains? result (mt/id :orders)))
        (is (contains? result (mt/id :products)))))
    (testing "extracts tables from subquery"
      (let [result (context/extract-tables-from-sql (mt/id)
                                                    "SELECT * FROM (SELECT * FROM PEOPLE) sub")]
        (is (set? result))
        (is (contains? result (mt/id :people)))))
    (testing "returns empty set for non-existent table"
      (let [result (context/extract-tables-from-sql (mt/id) "SELECT * FROM NONEXISTENT_TABLE")]
        (is (= #{} result))))
    (testing "returns empty set for invalid SQL (graceful failure)"
      (let [result (context/extract-tables-from-sql (mt/id) "THIS IS NOT SQL")]
        (is (= #{} result))))))

(deftest extract-card-ids-from-template-tags-test
  (testing "extracts card template tag IDs and ignores other tag types"
    (is (= #{1 2}
           (context/extract-card-ids-from-template-tags
            {"#1" {:type "card" :card-id 1}
             "#2" {:type :card :card_id 2}
             "id" {:type "dimension"}
             "orders" {:type "table" :table-id 10}}))))
  (testing "returns an empty set for missing template tags"
    (is (= #{} (context/extract-card-ids-from-template-tags nil)))))
