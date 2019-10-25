(ns metabase.driver.sql-jdbc-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets]
             [env :as tx.env]
             [interface :as tx]]
            [metabase.test.util.log :as tu.log]
            [metabase.util.date :as du])
  (:import java.sql.Time))

(defonce ^{:doc "Set of drivers descending from `:sql-jdbc`, for test purposes (i.e. `expect-with-drivers`)"}
  sql-jdbc-drivers
  (delay
   (du/profile "resolve @metabase.driver.sql-jdbc-test/sql-jdbc-drivers"
     (set
      (for [driver @tx.env/test-drivers
            :when  (isa? driver/hierarchy (driver/the-driver driver) (driver/the-driver :sql-jdbc))]
        (tx/the-driver-with-test-extensions driver))))))


;; DESCRIBE-DATABASE
(expect
  {:tables (set (for [table ["CATEGORIES" "VENUES" "CHECKINS" "USERS"]]
                  {:name table, :schema "PUBLIC", :description nil}))}
  (driver/describe-database :h2 (data/db)))

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
  (driver/describe-table :h2 (data/db) (Table (data/id :venues))))

;; DESCRIBE-TABLE-FKS
(expect
  #{{:fk-column-name   "CATEGORY_ID"
     :dest-table       {:name   "CATEGORIES"
                        :schema "PUBLIC"}
     :dest-column-name "ID"}}
  (driver/describe-table-fks :h2 (data/db) (Table (data/id :venues))))

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
                                                        (data/db)
                                                        (Table (data/id :venues)))))]
    ;; different DBs use different precisions for these
    (-> (dissoc row :latitude :longitude)
        (update :price int)
        (update :category_id int)
        (update :id int))))


;;; Make sure invalid ssh credentials are detected if a direct connection is possible
(datasets/expect-with-driver :postgres
  com.jcraft.jsch.JSchException
  (try
    ;; this test works if sshd is running or not
    (let [details {:dbname         "test"
                   :engine         :postgres
                   :host           "localhost"
                   :password       "changeme"
                   :port           5432
                   :ssl            false
                   :tunnel-enabled true
                   :tunnel-host    "localhost" ; this test works if sshd is running or not
                   :tunnel-pass    "BOGUS-BOGUS-BOGUS"
                   :tunnel-port    22
                   :tunnel-user    "example"
                   :user           "postgres"}]
      (tu.log/suppress-output
        (driver.u/can-connect-with-details? :postgres details :throw-exceptions)))
    (catch Throwable e
      (loop [^Throwable e e]
        (or (when (instance? com.jcraft.jsch.JSchException e)
              e)
            (some-> (.getCause e) recur))))))

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

(defn- spliced-count-of [table filter-clause]
  (let [query        {:database (data/id)
                      :type     :query
                      :query    {:source-table (data/id table)
                                 :aggregation  [[:count]]
                                 :filter       filter-clause}}
        native-query (qp/query->native-with-spliced-params query)
        spliced      (driver/splice-parameters-into-native-query driver/*driver* native-query)]
    (ffirst
     (qp.test/format-rows-by [int]
       (qp.test/rows
         (qp/process-query
           {:database (data/id)
            :type     :native
            :native   spliced}))))))

(deftest splice-parameters-test
  (datasets/test-drivers @sql-jdbc-drivers
    (data/$ids venues
      (testing "splicing a string"
        (is (= 3
               (spliced-count-of :venues [:starts-with $name "Sushi"])))
        (testing "containing single quotes -- this is done differently from driver to driver"
          (is (= 1
                 (spliced-count-of :venues [:= $name "Barney's Beanery"])))))
      (testing "splicing an integer"
        (is (= 13
               (spliced-count-of :venues [:= $price 3]))))
      (testing "splicing floating-point numbers"
        (is (= 13
               (spliced-count-of :venues [:between $price 2.9 3.1]))))
      (testing "splicing nil"
        (is (= 0
               (spliced-count-of :venues [:is-null $price])))))
    (data/dataset places-cam-likes
      (data/$ids places
        (testing "splicing a boolean"
          (is (= 2
                 (spliced-count-of :places [:= $liked true]))))))
    (data/$ids checkins
      (testing "splicing a `Date`"
        (is (= 3
               (spliced-count-of :checkins [:= $date "2014-03-05"]))))))
  ;; Oracle, Redshift, and SparkSQL don't have 'Time' types
  (datasets/test-drivers (disj @sql-jdbc-drivers :oracle :redshift :sparksql)
    (testing "splicing a `Time`"
      (is (= 2
             (data/dataset test-data-with-time
               (data/$ids users
                 (spliced-count-of :users [:= $last_login_time (Time. 9 30 0)]))))))))
