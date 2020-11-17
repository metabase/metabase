(ns metabase.driver.sparksql-test
  (:require [clojure.test :refer :all]
            honeysql.types
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql.query-processor :as sql.qp]))

(comment honeysql.types/keep-me)

(deftest apply-page-test
  (testing "Make sure our custom implementation of `apply-page` works the way we'd expect"
    (is (= {:select ["name" "id"]
            :from   [{:select   [[:default.categories.name "name"]
                                 [:default.categories.id "id"]
                                 [#honeysql.types.SqlRaw{:s "row_number() OVER (ORDER BY `default`.`categories`.`id` ASC)"}
                                  :__rownum__]]
                      :from     [:default.categories]
                      :order-by [[:default.categories.id :asc]]}]
            :where  [:> :__rownum__ 5]
            :limit  5}
           (sql.qp/apply-top-level-clause :sparksql :page
             {:select   [[:default.categories.name "name"] [:default.categories.id "id"]]
              :from     [:default.categories]
              :order-by [[:default.categories.id :asc]]}
             {:page {:page  2
                     :items 5}})))))

(deftest splice-strings-test
  (mt/test-driver :sparksql
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "The native query returned in query results should use user-friendly splicing"
        (is (= "SELECT count(*) AS `count` FROM `test_data`.`venues` `t1` WHERE `t1`.`name` = 'wow'"
               (:query (qp/query->native-with-spliced-params query))
               (-> (qp/process-query query) :data :native_form :query))))

      (testing "When actually running the query we should use paranoid splicing and hex-encode strings"
        (let [orig    sql-jdbc.execute/prepared-statement
              the-sql (atom nil)]
          (with-redefs [sql-jdbc.execute/prepared-statement (fn [driver conn sql params]
                                                              (reset! the-sql sql)
                                                              (with-redefs [sql-jdbc.execute/prepared-statement orig]
                                                                (orig driver conn sql params)))]
            (qp/process-query query)
            (is (= (str "-- Metabase\n"
                        "SELECT count(*) AS `count` "
                        "FROM `test_data`.`venues` `t1` "
                        "WHERE `t1`.`name` = decode(unhex('776f77'), 'utf-8')")
                   @the-sql))))))))
