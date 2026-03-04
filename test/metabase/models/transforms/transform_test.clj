(ns metabase.models.transforms.transform-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest source-database-id-set-test
  (testing "inserting a transform correctly sets the source-database-id column"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= (mt/id) (:source_database_id transform)))))

  (testing "updating a transform correctly sets the source-database-id column"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source_database_id (mt/id)
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= (mt/id) (:source_database_id transform))))))

(deftest source-tables-backward-compat-test
  (testing "source-tables stored in old map format is converted to array format on read"
    (mt/with-temp [:model/Transform {transform-id :id}
                   {:name   "Test Transform"
                    :source {:type          "query"
                             :query         {:database (mt/id)
                                             :type     "native"
                                             :native   {:query "SELECT 1"}}
                             :source-tables [{:alias "orders" :table (mt/id :orders)}
                                             {:alias "products" :table (mt/id :products)}]}}]
      ;; Simulate old map format by writing directly to DB
      (t2/update! :model/Transform transform-id
                  {:source {:type          "query"
                            :query         {:database (mt/id)
                                            :type     "native"
                                            :native   {:query "SELECT 1"}}
                            :source-tables {"orders" (mt/id :orders)
                                            "products" (mt/id :products)}}})
      (let [transform (t2/select-one :model/Transform transform-id)
            source-tables (get-in transform [:source :source-tables])]
        (testing "result is a vector, not a map"
          (is (vector? source-tables)))
        (testing "each entry has :alias and :table keys"
          (is (every? #(and (contains? % :alias) (contains? % :table)) source-tables)))
        (testing "all aliases and table IDs are present"
          (is (= #{"orders" "products"} (into #{} (map :alias) source-tables)))
          (is (= #{(mt/id :orders) (mt/id :products)} (into #{} (map (comp :table_id :table)) source-tables))))))))
