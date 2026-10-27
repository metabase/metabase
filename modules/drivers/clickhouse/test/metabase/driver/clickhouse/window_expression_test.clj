(ns metabase.driver.clickhouse.window-expression-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.window-expression-test :as window-expression-test]))

(defn- clickhouse-sql [query]
  (driver/with-driver :clickhouse
    (window-expression-test/compile-sql query)))

(deftest ^:parallel clickhouse-lag-lead-test
  (let [sql (clickhouse-sql (update-in (window-expression-test/window-query) [:stages 0] dissoc :fields))]
    (testing "lead without a default reads NULL past the frame, which is the whole partition unless the query says so"
      (is (str/includes? sql (str "`leadInFrame`(`toNullable`(`PUBLIC`.`VENUES`.`NAME`), 2) OVER (PARTITION BY `PUBLIC`.`VENUES`.`CATEGORY_ID`"
                                  " ORDER BY `PUBLIC`.`VENUES`.`ID` ASC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)"))))
    (testing "lag with a default"
      (is (str/includes? sql "`lagInFrame`(`PUBLIC`.`VENUES`.`NAME`, 1, ?) OVER")))
    (testing "a stated frame is kept"
      (is (str/includes? sql "ORDER BY `PUBLIC`.`VENUES`.`ID` DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS `later_min`")))))
