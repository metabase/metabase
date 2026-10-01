(ns metabase.llm.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest extract-sources-test
  (testing "POST /api/llm/extract-sources returns SQL tables and native card/model references"
    (mt/with-temp [:model/Database db    {:engine :h2}
                   :model/Table    table {:db_id  (:id db)
                                          :name   "orders"
                                          :schema "PUBLIC"}
                   :model/Field    _     {:table_id  (:id table)
                                          :name      "id"
                                          :base_type :type/Integer}
                   :model/Card     model {:name          "Orders model"
                                          :type          :model
                                          :dataset_query {:database (:id db)
                                                          :type     :query
                                                          :query    {:source-table (:id table)}}}]
      (is (=? {:tables   [{:id   (:id table)
                           :name "orders"}]
               :card_ids [(:id model)]}
              (mt/user-http-request :crowberto :post 200 "llm/extract-sources"
                                    {:database_id   (:id db)
                                     :sql           "SELECT * FROM orders"
                                     :template_tags {"#model" {:type    "card"
                                                               :card-id (:id model)}}}))))))

(deftest extract-sources-does-not-require-database-read-access-test
  (testing "POST /api/llm/extract-sources doesn't 403 for a user with no database access -- it still
            returns card_ids (extracted independently from template tags), just no :tables"
    (mt/with-temp [:model/Database db    {:engine :h2}
                   :model/Table    table {:db_id  (:id db)
                                          :name   "orders"
                                          :schema "PUBLIC"}
                   :model/Field    _     {:table_id  (:id table)
                                          :name      "id"
                                          :base_type :type/Integer}
                   :model/Card     model {:name          "Orders model"
                                          :type          :model
                                          :dataset_query {:database (:id db)
                                                          :type     :query
                                                          :query    {:source-table (:id table)}}}]
      (mt/with-no-data-perms-for-all-users!
        (is (=? {:tables   []
                 :card_ids [(:id model)]}
                (mt/user-http-request :rasta :post 200 "llm/extract-sources"
                                      {:database_id   (:id db)
                                       :sql           "SELECT * FROM orders"
                                       :template_tags {"#model" {:type    "card"
                                                                 :card-id (:id model)}}})))))))
