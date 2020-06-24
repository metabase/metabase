(ns metabase.driver.sql-jdbc-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test.util.log :as tu.log]))

(deftest describe-database-test
  (is (= {:tables (set (for [table ["CATEGORIES" "VENUES" "CHECKINS" "USERS"]]
                         {:name table, :schema "PUBLIC", :description nil}))}
         (driver/describe-database :h2 (mt/db)))))

(deftest describe-table-test
  (is (= {:name   "VENUES"
          :schema "PUBLIC"
          :fields #{{:name              "ID"
                     :database-type     "BIGINT"
                     :base-type         :type/BigInteger
                     :pk?               true
                     :database-position 0}
                    {:name              "NAME"
                     :database-type     "VARCHAR"
                     :base-type         :type/Text
                     :database-position 1}
                    {:name              "CATEGORY_ID"
                     :database-type     "INTEGER"
                     :base-type         :type/Integer
                     :database-position 2}
                    {:name              "LATITUDE"
                     :database-type     "DOUBLE"
                     :base-type         :type/Float
                     :database-position 3}
                    {:name              "LONGITUDE"
                     :database-type     "DOUBLE"
                     :base-type         :type/Float
                     :database-position 4}
                    {:name              "PRICE"
                     :database-type     "INTEGER"
                     :base-type         :type/Integer
                     :database-position 5}}}
         (driver/describe-table :h2 (mt/db) (Table (mt/id :venues))))))

(deftest describe-table-fks-test
  (is (= #{{:fk-column-name   "CATEGORY_ID"
            :dest-table       {:name   "CATEGORIES"
                               :schema "PUBLIC"}
            :dest-column-name "ID"}}
         (driver/describe-table-fks :h2 (mt/db) (Table (mt/id :venues))))))

(deftest table-rows-sample-test
  (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
    (is (= [["20th Century Cafe"]
            ["25°"]
            ["33 Taps"]
            ["800 Degrees Neapolitan Pizzeria"]
            ["BCD Tofu House"]]
           (->> (metadata-queries/table-rows-sample (Table (mt/id :venues))
                  [(Field (mt/id :venues :name))])
                ;; since order is not guaranteed do some sorting here so we always get the same results
                (sort-by first)
                (take 5))))))

(deftest table-rows-seq-test
  (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
    (is (= [{:name "Red Medicine", :price 3, :category_id 4, :id 1}
            {:name "Stout Burgers & Beers", :price 2, :category_id 11, :id 2}
            {:name "The Apple Pan", :price 2, :category_id 11, :id 3}
            {:name "Wurstküche", :price 2, :category_id 29, :id 4}
            {:name "Brite Spot Family Restaurant", :price 2, :category_id 20, :id 5}]
           (for [row (take 5 (sort-by :id (driver/table-rows-seq driver/*driver*
                                                                 (mt/db)
                                                                 (Table (mt/id :venues)))))]
             ;; different DBs use different precisions for these
             (-> (dissoc row :latitude :longitude)
                 (update :price int)
                 (update :category_id int)
                 (update :id int)))))))

(deftest invalid-ssh-credentials-test
  (mt/test-driver :postgres
    (testing "Make sure invalid ssh credentials are detected if a direct connection is possible"
      (is (thrown?
           java.net.ConnectException
           ;; this test works if sshd is running or not
           (try
             (let [details {:dbname         "test"
                            :engine         :postgres
                            :host           "localhost"
                            :password       "changeme"
                            :port           5432
                            :ssl            false
                            :tunnel-enabled true
                            :tunnel-host    "localhost" ; this test works if sshd is running or not
                            :tunnel-pass    "BOGUS-BOGUS-BOGUS"
                            ;; we want to use a bogus port here on purpose -
                            ;; so that locally, it gets a ConnectionRefused,
                            ;; and in CI it does too. Apache's SSHD library
                            ;; doesn't wrap every exception in an SshdException
                            :tunnel-port    21212
                            :tunnel-user    "example"
                            :user           "postgres"}]
               (tu.log/suppress-output
                (driver.u/can-connect-with-details? :postgres details :throw-exceptions)))
             (catch Throwable e
               (loop [^Throwable e e]
                 (or (when (instance? java.net.ConnectException e)
                       (throw e))
                     (some-> (.getCause e) recur))))))))))

;;; --------------------------------- Tests for splice-parameters-into-native-query ----------------------------------

(deftest splice-parameters-native-test
  (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
    (testing (str "test splicing a single param\n"
                  "(This test won't work if a driver that doesn't use single quotes for string literals comes along. "
                  "We can cross that bridge when we get there.)")
      (is (=  {:query  "SELECT * FROM birds WHERE name = 'Reggae'"
               :params nil}
              (driver/splice-parameters-into-native-query driver/*driver*
                {:query  "SELECT * FROM birds WHERE name = ?"
                 :params ["Reggae"]}))))

    (testing "test splicing multiple params"
      (is (=  {:query
               "SELECT * FROM birds WHERE name = 'Reggae' AND type = 'toucan' AND favorite_food = 'blueberries';",
               :params nil}
              (driver/splice-parameters-into-native-query driver/*driver*
                {:query  "SELECT * FROM birds WHERE name = ? AND type = ? AND favorite_food = ?;"
                 :params ["Reggae" "toucan" "blueberries"]}))))

    (testing (str "I think we're supposed to ignore multiple question narks, only single ones should get substituted "
                  "(`??` becomes `?` in JDBC, which is used for Postgres as a \")key exists?\" JSON operator amongst "
                  "other uses)")
      (is (= {:query
              "SELECT * FROM birds WHERE favorite_food ?? bird_info AND name = 'Reggae'",
              :params nil}
             (driver/splice-parameters-into-native-query driver/*driver*
               {:query  "SELECT * FROM birds WHERE favorite_food ?? bird_info AND name = ?"
                :params ["Reggae"]}))))

    (testing "splicing with no params should no-op"
      (is (= {:query "SELECT * FROM birds;", :params []}
             (driver/splice-parameters-into-native-query driver/*driver*
               {:query  "SELECT * FROM birds;"
                :params []}))))))

(defn- spliced-count-of [table filter-clause]
  (let [query        {:database (mt/id)
                      :type     :query
                      :query    {:source-table (mt/id table)
                                 :aggregation  [[:count]]
                                 :filter       filter-clause}}
        native-query (qp/query->native-with-spliced-params query)
        spliced      (driver/splice-parameters-into-native-query driver/*driver* native-query)]
    (ffirst
     (mt/formatted-rows [int]
       (qp/process-query
        {:database (mt/id)
         :type     :native
         :native   spliced})))))

(deftest splice-parameters-mbql-test
  (testing "`splice-parameters-into-native-query` should generate a query that works correctly"
    (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
      (mt/$ids venues
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
      (mt/dataset places-cam-likes
        (mt/$ids places
          (testing "splicing a boolean"
            (is (= 2
                   (spliced-count-of :places [:= $liked true]))))))
      (mt/$ids checkins
        (testing "splicing a date"
          (is (= 3
                 (spliced-count-of :checkins [:= $date "2014-03-05"]))))))

    ;; Oracle, Redshift, and SparkSQL don't have 'Time' types
    (mt/test-drivers (disj (sql-jdbc.tu/sql-jdbc-drivers) :oracle :redshift :sparksql)
      (testing "splicing a time"
        (is (= 2
               (mt/dataset test-data-with-time
                 (mt/$ids users
                   (spliced-count-of :users [:= $last_login_time "09:30"])))))))))
