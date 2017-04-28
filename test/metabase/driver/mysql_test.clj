(ns metabase.driver.mysql-test
  (:require [expectations :refer :all]
            [metabase
             [sync-database :as sync-db]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.database :refer [Database]]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :refer [expect-with-engine]]
             [interface :refer [def-database-definition]]]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import metabase.driver.mysql.MySQLDriver))

;; MySQL allows 0000-00-00 dates, but JDBC does not; make sure that MySQL is converting them to NULL when returning them like we asked
(def-database-definition ^:private ^:const all-zero-dates
  ["exciting-moments-in-history"
   [{:field-name "moment", :base-type :type/DateTime}]
   [["0000-00-00"]]])

(expect-with-engine :mysql
  [[1 nil]]
  ;; TODO - use the `rows` function from `metabse.query-processor-test`. Preferrably after it's moved to some sort of shared test util namespace
  (-> (data/dataset metabase.driver.mysql-test/all-zero-dates
        (data/run-query exciting-moments-in-history))
      :data :rows))


;; make sure connection details w/ extra params work as expected
(expect
  "//localhost:3306/cool?zeroDateTimeBehavior=convertToNull&useUnicode=true&characterEncoding=UTF8&characterSetResults=UTF8&useSSL=false&tinyInt1isBit=false"
  (:subname (sql/connection-details->spec (MySQLDriver.) {:host               "localhost"
                                                          :port               "3306"
                                                          :dbname             "cool"
                                                          :additional-options "tinyInt1isBit=false"})))


;; Test how TINYINT(1) columns are interpreted. By default, they should be interpreted as integers,
;; but with the correct additional options, we should be able to change that -- see https://github.com/metabase/metabase/issues/3506
(def-database-definition ^:private ^:const tiny-int-ones
  ["number-of-cans"
   [{:field-name "thing",          :base-type :type/Text}
    {:field-name "number-of-cans", :base-type {:native "tinyint(1)"}}]
   [["Six Pack"              6]
    ["Toucan"                2]
    ["Empty Vending Machine" 0]]])

(defn- db->fields [db]
  (let [table-ids (db/select-ids 'Table :db_id (u/get-id db))]
    (set (map (partial into {}) (db/select ['Field :name :base_type :special_type] :table_id [:in table-ids])))))

;; By default TINYINT(1) should be a boolean
(expect-with-engine :mysql
  #{{:name "number-of-cans", :base_type :type/Boolean, :special_type :type/Category}
    {:name "id",             :base_type :type/Integer, :special_type :type/PK}
    {:name "thing",          :base_type :type/Text,    :special_type :type/Category}}
  (data/with-temp-db [db tiny-int-ones]
    (db->fields db)))

;; if someone says specifies `tinyInt1isBit=false`, it should come back as a number instead
(expect-with-engine :mysql
  #{{:name "number-of-cans", :base_type :type/Integer, :special_type :type/Category}
    {:name "id",             :base_type :type/Integer, :special_type :type/PK}
    {:name "thing",          :base_type :type/Text,    :special_type :type/Category}}
  (data/with-temp-db [db tiny-int-ones]
    (tt/with-temp Database [db {:engine "mysql"
                                :details (assoc (:details db)
                                           :additional-options "tinyInt1isBit=false")}]
      (sync-db/sync-database! db)
      (db->fields db))))
