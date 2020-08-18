(ns metabase.driver.bigquery-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [models :refer [Field Table]]
             [query-processor :as qp]
             [sync :as sync]
             [test :as mt]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.test.data.bigquery :as bigquery.tx]
            [metabase.test.util :as tu]))

(deftest table-rows-sample-test
  (mt/test-driver :bigquery
    (is (= [[1 "Red Medicine"]
            [2 "Stout Burgers & Beers"]
            [3 "The Apple Pan"]
            [4 "Wurstküche"]
            [5 "Brite Spot Family Restaurant"]]
           (->> (metadata-queries/table-rows-sample (Table (mt/id :venues))
                  [(Field (mt/id :venues :id))
                   (Field (mt/id :venues :name))])
                (sort-by first)
                (take 5))))))

(deftest db-timezone-id-test
  (mt/test-driver :bigquery
    (is (= "UTC"
           (tu/db-timezone-id)))))

(defn- do-with-view [f]
  (driver/with-driver :bigquery
    (let [view-name (name (munge (gensym "view_")))]
      (mt/with-temp-copy-of-db
        (try
          (bigquery.tx/execute!
           (str "CREATE VIEW `v2_test_data.%s` "
                "AS "
                "SELECT v.id AS id, v.name AS venue_name, c.name AS category_name "
                "FROM `%s.v2_test_data.venues` v "
                "LEFT JOIN `%s.v2_test_data.categories` c "
                "ON v.category_id = c.id "
                "ORDER BY v.id ASC "
                "LIMIT 3")
           view-name
           (bigquery.tx/project-id)
           (bigquery.tx/project-id))
          (f view-name)
          (finally
            (bigquery.tx/execute! "DROP VIEW IF EXISTS `v2_test_data.%s`" view-name)))))))

(defmacro ^:private with-view [[view-name-binding] & body]
  `(do-with-view (fn [~(or view-name-binding '_)] ~@body)))

(deftest sync-views-test
  (mt/test-driver :bigquery
    (with-view [view-name]
      (is (contains? (:tables (driver/describe-database :bigquery (mt/db)))
                     {:schema nil, :name view-name})
          "`describe-database` should see the view")
      (is (= {:schema nil
              :name   view-name
              :fields #{{:name "id", :database-type "INTEGER", :base-type :type/Integer, :database-position 0}
                        {:name "venue_name", :database-type "STRING", :base-type :type/Text, :database-position 1}
                        {:name "category_name", :database-type "STRING", :base-type :type/Text, :database-position 2}}}
             (driver/describe-table :bigquery (mt/db) {:name view-name}))
          "`describe-tables` should see the fields in the view")
      (sync/sync-database! (mt/db))
      (testing "We should be able to run queries against the view (#3414)"
        (is (= [[1 "Red Medicine" "Asian" ]
                [2 "Stout Burgers & Beers" "Burger"]
                [3 "The Apple Pan" "Burger"]]
               (mt/rows
                 (qp/process-query
                  {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id view-name)
                              :order-by     [[:asc (mt/id view-name :id)]]}}))))))))
