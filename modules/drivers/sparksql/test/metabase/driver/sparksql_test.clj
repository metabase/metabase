(ns metabase.driver.sparksql-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sparksql :as sparksql]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel apply-page-test
  (testing "Make sure our custom implementation of `apply-page` works the way we'd expect"
    (let [hsql {:select [:name :id]
                :from   [{:select   [[:default.categories.name :name]
                                     [:default.categories.id :id]
                                     [[::sparksql/over
                                       :%row_number
                                       {:order-by [[:default.categories.id :asc]]}]
                                      :__rownum__]]
                          :from     [:default.categories]
                          :order-by [[:default.categories.id :asc]]}]
                :where  [:> :__rownum__ [:inline 5]]
                :limit  [:inline 5]}]
      (is (= hsql
             (sql.qp/apply-top-level-clause :sparksql :page
               {:select   [[:default.categories.name :name] [:default.categories.id :id]]
                :from     [:default.categories]
                :order-by [[:default.categories.id :asc]]}
               {:page {:page  2
                       :items 5}})))
      (is (= [["SELECT"
               "  `name`,"
               "  `id`"
               "FROM"
               "  ("
               "    SELECT"
               "      `default`.`categories`.`name` AS `name`,"
               "      `default`.`categories`.`id` AS `id`,"
               "      ROW_NUMBER() OVER ("
               "        ORDER BY"
               "          `default`.`categories`.`id` ASC"
               "      ) AS `__rownum__`"
               "    FROM"
               "      `default`.`categories`"
               "    ORDER BY"
               "      `default`.`categories`.`id` ASC"
               "  )"
               "WHERE"
               "  `__rownum__` > 5"
               "LIMIT"
               "  5"]]
             (-> (sql.qp/format-honeysql :sparksql hsql)
                 vec
                 (update 0 (partial driver/prettify-native-form :sparksql))
                 (update 0 str/split-lines)))))))

(deftest splice-strings-test
  (mt/test-driver :sparksql
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "The native query returned in query results should use user-friendly splicing"
        (is (= "SELECT COUNT(*) AS `count` FROM `test_data`.`venues` AS `t1` WHERE `t1`.`name` = 'wow'"
               (:query (qp.compile/compile-and-splice-parameters query))
               (-> (qp/process-query query) :data :native_form :query))))

      (testing "When actually running the query we should use paranoid splicing and hex-encode strings"
        (let [orig    sql-jdbc.execute/prepared-statement
              the-sql (atom nil)]
          (with-redefs [sql-jdbc.execute/prepared-statement (fn [driver conn sql params]
                                                              (reset! the-sql sql)
                                                              (with-redefs [sql-jdbc.execute/prepared-statement orig]
                                                                (orig driver conn sql params)))]
            (is (=? {:status :completed}
                    (qp/process-query query)))
            (is (= ["-- Metabase"
                    "SELECT"
                    "  COUNT(*) AS `count`"
                    "FROM"
                    "  `test_data`.`venues` AS `t1`"
                    "WHERE"
                    "  `t1`.`name` = decode(unhex('776f77'), 'utf-8')"]
                   (str/split-lines (driver/prettify-native-form :sparksql @the-sql))))))))))

(deftest ^:parallel read-dates-test
  (testing "DATE columns should come back as LocalDate"
    (mt/test-driver :sparksql
      (sql-jdbc.execute/do-with-connection-with-options
       :sparksql
       (mt/id)
       nil
       (fn [^java.sql.Connection conn]
         (with-open [rset (.executeQuery (.createStatement conn) "SELECT date '2024-03-22T13:52:00' AS d;")]
           (let [rsmeta (.getMetaData rset)]
             (testing "Should be returned as correct database types"
               (testing "database type"
                 (is (= "date"
                        (.getColumnTypeName rsmeta 1))))
               (testing "JDBC type"
                 (is (= "DATE"
                        (.getName (java.sql.JDBCType/valueOf (.getColumnType rsmeta 1)))))))
             (testing "Rows should come back as expected Java types"
               (is (= [[#t "2024-03-22"]]
                      (into [] (sql-jdbc.execute/reducible-rows :sparksql rset rsmeta))))))))))))
