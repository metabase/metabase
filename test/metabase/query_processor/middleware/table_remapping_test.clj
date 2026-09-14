(ns metabase.query-processor.middleware.table-remapping-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.query-processor.middleware.table-remapping :as table-remapping]
   [metabase.test :as mt]))

(defn- remapping-of-orders []
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id :orders))]
    {:from-schema schema, :from-table name, :to-schema schema, :to-table "orders_elsewhere"}))

(deftest an-mbql-query-compiles-against-the-replacement-table-test
  (let [mp       (mt/metadata-provider)
        query    (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        compiled (table-remapping/with-table-remappings [(remapping-of-orders)]
                   (qp.compile/compile query))]
    (is (re-find #"(?i)orders_elsewhere" (:query compiled)))
    (is (not (re-find #"(?i)\bORDERS\b" (:query compiled))))))

(deftest a-native-query-is-rewritten-to-the-replacement-table-test
  (let [mp       (mt/metadata-provider)
        query    (lib/native-query mp "SELECT * FROM PUBLIC.ORDERS")
        compiled (table-remapping/with-table-remappings [(remapping-of-orders)]
                   (qp.compile/compile query))]
    (is (re-find #"(?i)orders_elsewhere" (:query compiled)))
    (is (not (re-find #"(?i)\bORDERS\b" (:query compiled))))))

(deftest a-source-card-is-remapped-with-the-outer-query-test
  (let [mp       (lib.tu/mock-metadata-provider
                  (mt/metadata-provider)
                  {:cards [{:id            1
                            :name          "Orders"
                            :database-id   (mt/id)
                            :dataset-query (lib/query (mt/metadata-provider)
                                                      (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}]})
        query    (lib/query mp (lib.metadata/card mp 1))
        compiled (table-remapping/with-table-remappings [(remapping-of-orders)]
                   (qp.compile/compile query))]
    (is (re-find #"(?i)orders_elsewhere" (:query compiled)))))

(deftest empty-remappings-read-the-tables-as-named-test
  (with-redefs [qp.middleware.enterprise/default-table-remappings (constantly [(remapping-of-orders)])]
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (testing "the instance default applies when the caller set nothing"
        (is (re-find #"(?i)orders_elsewhere" (:query (qp.compile/compile query)))))
      (testing "an empty vector turns it off"
        (is (not (re-find #"(?i)orders_elsewhere"
                          (:query (table-remapping/with-table-remappings [] (qp.compile/compile query))))))))))
