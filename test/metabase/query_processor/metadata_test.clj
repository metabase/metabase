(ns metabase.query-processor.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest ^:parallel mbql-query-metadata-test
  (testing "Should be able to calculate metadata for an MBQL query without going in to driver land"
    (is (=? [{:lib/type      :metadata/column
              :name          "ID"
              :database-type "BIGINT"
              :base-type     :type/BigInteger
              :id            (mt/id :venues :id)}
             {:lib/type      :metadata/column
              :name          "NAME"
              :database-type "CHARACTER VARYING"
              :base-type     :type/Text
              :id            (mt/id :venues :name)}
             {:lib/type      :metadata/column
              :name          "CATEGORY_ID"
              :database-type "INTEGER"
              :base-type     :type/Integer
              :id            (mt/id :venues :category_id)}
             {:lib/type      :metadata/column
              :name          "LATITUDE"
              :database-type "DOUBLE PRECISION"
              :base-type     :type/Float
              :id            (mt/id :venues :latitude)}
             {:lib/type      :metadata/column
              :name          "LONGITUDE"
              :database-type "DOUBLE PRECISION"
              :base-type     :type/Float
              :id            (mt/id :venues :longitude)}
             {:lib/type      :metadata/column
              :name          "PRICE"
              :database-type "INTEGER"
              :base-type     :type/Integer
              :id            (mt/id :venues :price)}]
            (qp.metadata/result-metadata (mt/mbql-query venues))))))

(deftest ^:parallel native-query-metadata-test
  (testing "Should be able to get metadata without actually running the query (using the `:sql-jdbc` implementation) (#28195)"
    (let [eid   (u/generate-nano-id)
          query (-> (mt/native-query {:query "SELECT * FROM venues WHERE id = ?;", :params [1]})
                    (assoc-in [:info :card-entity-id] eid))]
      (is (=? [{:lib/type      :metadata/column
                :name          "ID"
                :ident         (lib/native-ident "ID" eid)
                :database-type "BIGINT"
                :base-type     :type/BigInteger}
               {:lib/type      :metadata/column
                :name          "NAME"
                :ident         (lib/native-ident "NAME" eid)
                :database-type "CHARACTER VARYING"
                :base-type     :type/Text}
               {:lib/type      :metadata/column
                :name          "CATEGORY_ID"
                :ident         (lib/native-ident "CATEGORY_ID" eid)
                :database-type "INTEGER"
                :base-type     :type/Integer}
               {:lib/type      :metadata/column
                :name          "LATITUDE"
                :ident         (lib/native-ident "LATITUDE" eid)
                :database-type "DOUBLE PRECISION"
                :base-type     :type/Float}
               {:lib/type      :metadata/column
                :name          "LONGITUDE"
                :ident         (lib/native-ident "LONGITUDE" eid)
                :database-type "DOUBLE PRECISION"
                :base-type     :type/Float}
               {:lib/type      :metadata/column
                :name          "PRICE"
                :ident         (lib/native-ident "PRICE" eid)
                :database-type "INTEGER"
                :base-type     :type/Integer}]
              (qp.metadata/result-metadata query))))))

(deftest ^:parallel native-query-metadata-semantic-type-test
  (testing "Should still infer Semantic type based on column name"
    (let [eid   (u/generate-nano-id)
          query (-> (mt/native-query {:query "SELECT id, created_at FROM products LIMIT 5;"})
                    (assoc-in [:info :card-entity-id] eid))]
      (is (=? [{:name          "ID"
                :display-name  "ID"
                :semantic-type :type/PK}
               {:name          "CREATED_AT"
                :display-name  "CREATED_AT"
                :semantic-type :type/CreationTimestamp}]
              (qp.metadata/result-metadata query nil)))
      (is (=? [{:name          "ID"
                :display_name  "ID"
                :semantic_type :type/PK}
               {:name          "CREATED_AT"
                :display_name  "CREATED_AT"
                :semantic_type :type/CreationTimestamp}]
              #_{:clj-kondo/ignore [:deprecated-var]}
              (qp.metadata/legacy-result-metadata query nil))))))

(deftest ^:parallel native-query-fallback-metadata-test
  (testing "Should be able to get metadata for native query using fallback :default implementation that runs the query"
    ;; at the time of this writing this method returns metadata in the legacy shape. I would expect this to change at
    ;; some point in the future.
    (let [query (mt/native-query {:query "SELECT * FROM venues WHERE id = ?;", :params [1]})]
      (is (=? [{:display_name  "ID"
                :name          "ID"
                :base_type     :type/BigInteger
                :database_type "BIGINT"}
               {:display_name  "NAME"
                :name          "NAME"
                :base_type     :type/Text
                :database_type "CHARACTER VARYING"}
               {:display_name  "CATEGORY_ID"
                :name          "CATEGORY_ID"
                :base_type     :type/Integer
                :database_type "INTEGER"}
               {:display_name  "LATITUDE"
                :name          "LATITUDE"
                :base_type     :type/Float
                :database_type "DOUBLE PRECISION"}
               {:display_name  "LONGITUDE"
                :name          "LONGITUDE"
                :base_type     :type/Float
                :database_type "DOUBLE PRECISION"}
               {:display_name  "PRICE"
                :name          "PRICE"
                :base_type     :type/Integer
                :database_type "INTEGER"}]
              ((get-method driver/query-result-metadata :default) :h2 query))))))
