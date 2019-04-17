(ns metabase.driver.sql-jdbc-test
  (:require [expectations :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test.data :as data :refer :all]
            [metabase.test.data
             [datasets :as datasets]
             [env :as tx.env]
             [interface :as tx]]
            [metabase.test.util.log :as tu.log]
            [metabase.util.date :as du]
            [toucan.db :as db])
  (:import java.sql.Time))

(def ^:private users-table      (delay (Table :name "USERS")))
(def ^:private venues-table     (delay (Table (id :venues))))
(def ^:private users-name-field (delay (Field (id :users :name))))

(defonce ^{:doc "Set of drivers descending from `:sql-jdbc`, for test purposes (i.e. `expect-with-drivers`)"}
  sql-jdbc-drivers
  (delay
   (du/profile "resolve @metabase.driver.sql-jdbc-test/sql-jdbc-drivers"
     (set
      (for [driver tx.env/test-drivers
            :when  ((descendants driver/hierarchy (driver/the-driver :sql-jdbc))
                    (driver/the-driver driver))]
        (tx/the-driver-with-test-extensions driver))))))


;; DESCRIBE-DATABASE
(expect
  {:tables (set (for [table ["CATEGORIES" "VENUES" "CHECKINS" "USERS"]]
                  {:name table, :schema "PUBLIC", :description nil}))}
  (driver/describe-database :h2 (db)))

;; DESCRIBE-TABLE
(expect
  {:name   "VENUES"
   :schema "PUBLIC"
   :fields #{{:name          "NAME",
              :database-type "VARCHAR"
              :base-type     :type/Text}
             {:name          "LATITUDE"
              :database-type "DOUBLE"
              :base-type     :type/Float}
             {:name          "LONGITUDE"
              :database-type "DOUBLE"
              :base-type     :type/Float}
             {:name          "PRICE"
              :database-type "INTEGER"
              :base-type     :type/Integer}
             {:name          "CATEGORY_ID"
              :database-type "INTEGER"
              :base-type     :type/Integer}
             {:name          "ID"
              :database-type "BIGINT"
              :base-type     :type/BigInteger
              :pk?           true}}}
  (driver/describe-table :h2 (db) @venues-table))

;; DESCRIBE-TABLE-FKS
(expect
  #{{:fk-column-name   "CATEGORY_ID"
     :dest-table       {:name   "CATEGORIES"
                        :schema "PUBLIC"}
     :dest-column-name "ID"}}
  (driver/describe-table-fks :h2 (db) @venues-table))

;;; TABLE-ROWS-SAMPLE
(datasets/expect-with-drivers @sql-jdbc-drivers
  [["20th Century Cafe"]
   ["25°"]
   ["33 Taps"]
   ["800 Degrees Neapolitan Pizzeria"]
   ["BCD Tofu House"]]
  (->> (metadata-queries/table-rows-sample (Table (data/id :venues))
         [(Field (data/id :venues :name))])
       ;; since order is not guaranteed do some sorting here so we always get the same results
       (sort-by first)
       (take 5)))


;;; TABLE-ROWS-SEQ
(datasets/expect-with-drivers @sql-jdbc-drivers
  [{:name "Red Medicine",                 :price 3, :category_id  4, :id 1}
   {:name "Stout Burgers & Beers",        :price 2, :category_id 11, :id 2}
   {:name "The Apple Pan",                :price 2, :category_id 11, :id 3}
   {:name "Wurstküche",                   :price 2, :category_id 29, :id 4}
   {:name "Brite Spot Family Restaurant", :price 2, :category_id 20, :id 5}]
  (for [row (take 5 (sort-by :id (driver/table-rows-seq driver/*driver*
                                                        (db/select-one 'Database :id (id))
                                                        (db/select-one 'Table :id (id :venues)))))]
    ;; different DBs use different precisions for these
    (-> (dissoc row :latitude :longitude)
        (update :price int)
        (update :category_id int)
        (update :id int))))


;;; Make sure invalid ssh credentials are detected if a direct connection is possible
(expect
  #"com.jcraft.jsch.JSchException:"
  (try (let [engine  :postgres
             details {:ssl            false
                      :password       "changeme"
                      :tunnel-host    "localhost" ; this test works if sshd is running or not
                      :tunnel-pass    "BOGUS-BOGUS-BOGUS"
                      :port           5432
                      :dbname         "test"
                      :host           "localhost"
                      :tunnel-enabled true
                      :tunnel-port    22
                      :engine         :postgres
                      :user           "postgres"
                      :tunnel-user    "example"}]
         (tu.log/suppress-output
           (driver.u/can-connect-with-details? engine details :throw-exceptions)))
       (catch Exception e
         (.getMessage e))))

;;; --------------------------------- Tests for splice-parameters-into-native-query ----------------------------------

;; test splicing a single param
;;
;; (This test won't work if a driver that doesn't use single quotes for string literals comes along. We can cross that
;; bridge when we get there.)
(datasets/expect-with-drivers @sql-jdbc-drivers
  {:query  "SELECT * FROM birds WHERE name = 'Reggae'"
   :params nil}
  (driver/splice-parameters-into-native-query driver/*driver*
    {:query  "SELECT * FROM birds WHERE name = ?"
     :params ["Reggae"]}))

;; test splicing multiple params
(datasets/expect-with-drivers @sql-jdbc-drivers
  {:query
   "SELECT * FROM birds WHERE name = 'Reggae' AND type = 'toucan' AND favorite_food = 'blueberries';",
   :params nil}
  (driver/splice-parameters-into-native-query driver/*driver*
    {:query  "SELECT * FROM birds WHERE name = ? AND type = ? AND favorite_food = ?;"
     :params ["Reggae" "toucan" "blueberries"]}))

;; I think we're supposed to ignore multiple question narks, only single ones should get substituted
;; (`??` becomes `?` in JDBC, which is used for Postgres as a "key exists?" JSON operator amongst other uses)
(datasets/expect-with-drivers @sql-jdbc-drivers
  {:query
   "SELECT * FROM birds WHERE favorite_food ?? bird_info AND name = 'Reggae'",
   :params nil}
  (driver/splice-parameters-into-native-query driver/*driver*
    {:query  "SELECT * FROM birds WHERE favorite_food ?? bird_info AND name = ?"
     :params ["Reggae"]}))

;; splicing with no params should no-op
(datasets/expect-with-drivers @sql-jdbc-drivers
  {:query "SELECT * FROM birds;", :params []}
  (driver/splice-parameters-into-native-query driver/*driver*
    {:query  "SELECT * FROM birds;"
     :params []}))

(defn- process-spliced-count-query* [mbql-query]
  (let [native-query (qp/query->native-with-spliced-params
                       {:database (data/id)
                        :type     :query
                        :query    (assoc mbql-query :aggregation [[:count]])})
        spliced      (driver/splice-parameters-into-native-query driver/*driver* native-query)]
    (qp.test/format-rows-by [int]
      (qp.test/rows
        (qp/process-query
          {:database (data/id)
           :type     :native
           :native   spliced})))))

(defmacro ^:private process-spliced-count-query [table filter-clause]
  `(process-spliced-count-query*
    {:source-table (data/id ~table)
     :filter       (data/$ids [~table {:wrap-field-ids? true}]
                     ~filter-clause)}))

;; test splicing a string -- is resulting query correct?
(datasets/expect-with-drivers @sql-jdbc-drivers
  [[3]]
  (process-spliced-count-query :venues [:starts-with $name "Sushi"]))

;; test splicing a string containing single quotes -- is resulting query correct? (The way this is done varies from
;; driver to driver)
(datasets/expect-with-drivers @sql-jdbc-drivers
  [[1]]
  (process-spliced-count-query :venues [:= $name "Barney's Beanery"]))

;; test splicing an integer -- is resulting query correct?
(datasets/expect-with-drivers @sql-jdbc-drivers
  [[13]]
  (process-spliced-count-query :venues [:= $price 3]))

;; test splicing a floating-point number -- is resulting query correct?
(datasets/expect-with-drivers @sql-jdbc-drivers
  [[13]]
  (process-spliced-count-query :venues [:between $price 2.9 3.1]))

;; test splicing a boolean -- is resulting query correct?
(datasets/expect-with-drivers @sql-jdbc-drivers
  [[2]]
  (data/dataset places-cam-likes
    (process-spliced-count-query :places [:= $liked true])))

;; test splicing `nil` -- is resulting query correct?
(datasets/expect-with-drivers @sql-jdbc-drivers
  [[0]]
  (process-spliced-count-query :venues [:is-null $price]))

;; test splicing a `Date` -- is resulting query correct ?
(datasets/expect-with-drivers @sql-jdbc-drivers
  [[3]]
  (process-spliced-count-query :checkins [:= $date "2014-03-05"]))

;; test splicing a `Timestamp` -- is resulting query correct ?
;; Oracle, Redshift, and SparkSQL don't have 'Time' types
(datasets/expect-with-drivers (disj @sql-jdbc-drivers :oracle :redshift :sparksql)
  [[2]]
  (data/dataset test-data-with-time
    (process-spliced-count-query :users [:= $last_login_time (Time. 9 30 0)])))
