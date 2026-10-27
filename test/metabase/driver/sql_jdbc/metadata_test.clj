(ns metabase.driver.sql-jdbc.metadata-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.driver.sql-jdbc.metadata-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
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
              :base-type     :type/Integer}]
            (sql-jdbc.metadata/query-result-metadata
             :h2
             (mt/native-query {:query "SELECT * FROM venues WHERE id = ?;", :params [1]}))))))

;; Mimics the Athena JDBC driver, which gets metadata by preparing `SELECT * FROM (<sql>) LIMIT 0`
(driver/register! ::subselect-wrapping-h2, :parent :h2)

(defmethod sql-jdbc.execute/prepared-statement ::subselect-wrapping-h2
  [_driver conn sql params]
  ((get-method sql-jdbc.execute/prepared-statement :h2) :h2 conn (str "SELECT * FROM (" sql ") LIMIT 0") params))

(deftest ^:parallel trailing-semicolon-is-stripped-before-preparing-test
  (testing "A trailing `;` breaks drivers that get metadata by wrapping the SQL in a subselect (GHY-4953)"
    (doseq [sql ["SELECT 1 AS x;"
                 "SELECT 1 AS x; -- trailing comment"
                 "SELECT 1 AS x ;\n;  "]]
      (testing (pr-str sql)
        (is (=? [{:name "X"}]
                (sql-jdbc.metadata/query-result-metadata ::subselect-wrapping-h2 (mt/native-query {:query sql}))))))))
