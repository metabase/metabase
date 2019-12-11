(ns metabase.driver.bigquery-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [models :refer [Field Table]]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [sync :as sync]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [bigquery :as bigquery.tx]
             [datasets :as datasets]]))

(deftest table-rows-sample-test
  (datasets/test-driver :bigquery
    (is (= [[1 "Red Medicine"]
            [2 "Stout Burgers & Beers"]
            [3 "The Apple Pan"]
            [4 "Wurstküche"]
            [5 "Brite Spot Family Restaurant"]]
           (->> (metadata-queries/table-rows-sample (Table (data/id :venues))
                  [(Field (data/id :venues :id))
                   (Field (data/id :venues :name))])
                (sort-by first)
                (take 5))))))

(deftest db-timezone-id-test
  (datasets/test-driver :bigquery
    (is (= "UTC"
           (tu/db-timezone-id)))))

(defn- do-with-view [f]
  (driver/with-driver :bigquery
    (let [view-name (name (munge (gensym "view_")))]
      (data/with-temp-copy-of-db
        (try
          (bigquery.tx/execute!
           (str "CREATE VIEW `test_data.%s` "
                "AS "
                "SELECT v.id AS id, v.name AS venue_name, c.name AS category_name "
                "FROM `%s.test_data.venues` v "
                "LEFT JOIN `%s.test_data.categories` c "
                "ON v.category_id = c.id "
                "ORDER BY v.id ASC "
                "LIMIT 3")
           view-name
           (bigquery.tx/project-id)
           (bigquery.tx/project-id))
          (f view-name)
          (finally
            (bigquery.tx/execute! "DROP VIEW IF EXISTS `test_data.%s`" view-name)))))))

(defmacro ^:private with-view [[view-name-binding] & body]
  `(do-with-view (fn [~(or view-name-binding '_)] ~@body)))

(deftest sync-views-test
  (datasets/test-driver :bigquery
    (with-view [view-name]
      (is (contains? (:tables (driver/describe-database :bigquery (data/db)))
                     {:schema nil, :name view-name})
          "`describe-database` should see the view")
      (is (= {:schema nil
              :name   view-name
              :fields #{{:name "id", :database-type "INTEGER", :base-type :type/Integer}
                        {:name "venue_name", :database-type "STRING", :base-type :type/Text}
                        {:name "category_name", :database-type "STRING", :base-type :type/Text}}}
             (driver/describe-table :bigquery (data/db) {:name view-name}))
          "`describe-tables` should see the fields in the view")
      (sync/sync-database! (data/db))
      (is (= [[1 "Asian" "Red Medicine"]
              [2 "Burger" "Stout Burgers & Beers"]
              [3 "Burger" "The Apple Pan"]]
             (qp.test/rows
               (qp/process-query
                 {:database (data/id)
                  :type     :query
                  :query    {:source-table (data/id view-name)
                             :order-by     [[:asc (data/id view-name :id)]]}})))
          "We should be able to run queries against the view (#3414)"))))

(deftest timezones-test
  (datasets/test-driver :bigquery
    (testing "BigQuery does not support report-timezone, so setting it should not affect results"
      (doseq [timezone ["UTC" "US/Pacific"]]
        (tu/with-temporary-setting-values [report-timezone timezone]
          (is (= [[37 "2015-11-19T00:00:00Z"]]
                 (qp.test/rows
                   (data/run-mbql-query checkins
                     {:fields   [$id $date]
                      :filter   [:= $date "2015-11-19"]
                      :order-by [[:asc $id]]})))))))))

(defn- do-with-datetime-timestamp-table [f]
  (driver/with-driver :bigquery
    (let [table-name (name (munge (gensym "table_")))]
      (data/with-temp-copy-of-db
        (try
          (bigquery.tx/execute!
           (format "CREATE TABLE `test_data.%s` ( ts TIMESTAMP, dt DATETIME )" table-name))
          (bigquery.tx/execute!
           (format "INSERT INTO `test_data.%s` (ts, dt) VALUES (TIMESTAMP \"2020-01-01 00:00:00 UTC\", DATETIME \"2020-01-01 00:00:00\")"
                   table-name))
          (sync/sync-database! (data/db))
          (f table-name)
          (finally
            (bigquery.tx/execute! "DROP TABLE IF EXISTS `test_data.%s`" table-name)))))))

(deftest filter-by-datetime-timestamp-test
  (datasets/test-driver :bigquery
    ;; there are more tests in the `bigquery.query-processor-test` namespace
    (testing "Make sure we can filter against different types of BigQuery temporal columns (#11222)"
      (do-with-datetime-timestamp-table
       (fn [table-name]
         (doseq [column [:ts :dt]]
           (testing (format "Filtering against %s column" column)
             (doseq [s    ["2020-01-01" "2020-01-01T00:00:00"]
                     field [[:field-id (data/id table-name column)]
                            [:datetime-field [:field-id (data/id table-name column)] :default]
                            [:datetime-field [:field-id (data/id table-name column)] :day]]
                     :let [filter-clause [:= field s]]]
               (testing (format "\nMBQL filter clause = %s" (pr-str filter-clause))
                 (is (= [["2020-01-01T00:00:00Z" "2020-01-01T00:00:00Z"]]
                        (qp.test/rows
                          (data/run-mbql-query nil
                            {:source-table (data/id table-name)
                             :filter       filter-clause})))))))))))))
