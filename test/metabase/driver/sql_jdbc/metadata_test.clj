(ns metabase.driver.sql-jdbc.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.metadata :as sql-jdbc.metadata]
   [metabase.test :as mt]))

(deftest ^:parallel native-query-metadata-test
  (testing "Should be able to get metadata without actually running the query (#28195)"
    (is (=? [{:lib/type      :metadata/column
              :name          "ID"
              :database-type "BIGINT"
              :base-type     :type/BigInteger}
             {:lib/type      :metadata/column
              :name          "NAME"
              :database-type "CHARACTER VARYING"
              :base-type     :type/Text}
             {:lib/type      :metadata/column
              :name          "CATEGORY_ID"
              :database-type "INTEGER"
              :base-type     :type/Integer}
             {:lib/type      :metadata/column
              :name          "LATITUDE"
              :database-type "DOUBLE PRECISION"
              :base-type     :type/Float}
             {:lib/type      :metadata/column
              :name          "LONGITUDE"
              :database-type "DOUBLE PRECISION"
              :base-type     :type/Float}
             {:lib/type      :metadata/column
              :name          "PRICE"
              :database-type "INTEGER"
              :base-type     :type/Integer
              :original-name "PRICE"}]
            (sql-jdbc.metadata/query-result-metadata
             :h2
             (mt/native-query {:query "SELECT * FROM venues WHERE id = ?;", :params [1]}))))))
