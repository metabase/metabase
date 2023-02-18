(ns metabase.driver.sparksql-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.query :as mdb.query]
   [metabase.driver.sparksql :as sparksql]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.util.honeysql-extensions :as hx]))

(use-fixtures :each (fn [thunk]
                      (binding [hx/*honey-sql-version* 2]
                        (thunk))))

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
                 (update 0 mdb.query/format-sql :sparksql)
                 (update 0 str/split-lines)))))))

(deftest splice-strings-test
  (mt/test-driver :sparksql
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "The native query returned in query results should use user-friendly splicing"
        (is (= "SELECT COUNT(*) AS `count` FROM `test_data`.`venues` AS `t1` WHERE `t1`.`name` = 'wow'"
               (:query (qp/compile-and-splice-parameters query))
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
                   (str/split-lines (mdb.query/format-sql @the-sql :sparksql))))))))))
