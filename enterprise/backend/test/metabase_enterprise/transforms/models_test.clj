(ns metabase-enterprise.transforms.models-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest python-transform-source-table-resolution-on-save-test
  (testing "Python transform source-tables with name refs get table_id resolved on save"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id  db-id
                                                :name   "existing_table"
                                                :schema "public"}]
      (testing "table_id is populated when table exists"
        (mt/with-temp [:model/Transform transform {:name   "Transform with ref"
                                                   :source {:type            "python"
                                                            :body            "def transform(): pass"
                                                            :source-database db-id
                                                            :source-tables   {"input" {:database_id db-id
                                                                                       :schema      "public"
                                                                                       :table       "existing_table"}}}
                                                   :target {:type     "table"
                                                            :schema   "public"
                                                            :name     "output"
                                                            :database db-id}}]
          (let [saved        (t2/select-one :model/Transform :id (:id transform))
                source-table (get-in saved [:source :source-tables "input"])]
            (is (= table-id (:table_id source-table))
                "table_id should be resolved from database lookup"))))

      (testing "table_id remains nil when table doesn't exist"
        (mt/with-temp [:model/Transform transform {:name   "Transform with missing ref"
                                                   :source {:type            "python"
                                                            :body            "def transform(): pass"
                                                            :source-database db-id
                                                            :source-tables   {"input" {:database_id db-id
                                                                                       :schema      "public"
                                                                                       :table       "nonexistent_table"}}}
                                                   :target {:type     "table"
                                                            :schema   "public"
                                                            :name     "output"
                                                            :database db-id}}]
          (let [saved        (t2/select-one :model/Transform :id (:id transform))
                source-table (get-in saved [:source :source-tables "input"])]
            (is (nil? (:table_id source-table))
                "table_id should be nil for non-existent table"))))

      (testing "existing table_id is preserved"
        (mt/with-temp [:model/Transform transform {:name   "Transform with explicit table_id"
                                                   :source {:type            "python"
                                                            :body            "def transform(): pass"
                                                            :source-database db-id
                                                            :source-tables   {"input" {:database_id db-id
                                                                                       :schema      "public"
                                                                                       :table       "existing_table"
                                                                                       :table_id    999}}}
                                                   :target {:type     "table"
                                                            :schema   "public"
                                                            :name     "output"
                                                            :database db-id}}]
          (let [saved        (t2/select-one :model/Transform :id (:id transform))
                source-table (get-in saved [:source :source-tables "input"])]
            (is (= 999 (:table_id source-table))
                "explicit table_id should be preserved")))))))
