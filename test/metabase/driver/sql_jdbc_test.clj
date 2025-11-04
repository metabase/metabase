(ns ^:mb/driver-tests metabase.driver.sql-jdbc-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definition-test :as dataset-definition-test]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLTimeoutException)))

(set! *warn-on-reflection* true)

(deftest ^:parallel describe-database-test
  (is (= {:tables (set (for [table ["CATEGORIES" "VENUES" "CHECKINS" "USERS" "ORDERS" "PEOPLE" "PRODUCTS" "REVIEWS"]]
                         {:name table, :schema "PUBLIC", :description nil, :is_writable true}))}
         (driver/describe-database :h2 (mt/db)))))

(deftest describe-fields-sync-with-composite-pks-test
  (testing "Make sure syncing a table that has a composite pks works"
    (mt/test-driver (mt/normal-drivers-with-feature :describe-fields)
      (mt/dataset dataset-definition-test/composite-pk
        (let [songs (t2/select-one :model/Table (mt/id :songs))
              fk-metadata (driver/describe-fields driver/*driver* (mt/db)
                                                  :table-names [(:name songs)]
                                                  :schema-names [(:schema songs)])]
          (is (= #{{:name "song_id", :pk? true} {:name "artist_id", :pk? true}}
                 (into #{}
                       (map #(select-keys % [:name :pk?]))
                       fk-metadata))))))))

(deftest ^:parallel table-rows-sample-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    (is (= [["20th Century Cafe"]
            ["25°"]
            ["33 Taps"]
            ["800 Degrees Neapolitan Pizzeria"]
            ["BCD Tofu House"]]
           (->> (table-rows-sample/table-rows-sample (t2/select-one :model/Table :id (mt/id :venues))
                                                     [(t2/select-one :model/Field :id (mt/id :venues :name))]
                                                     (constantly conj))
                ;; since order is not guaranteed do some sorting here so we always get the same results
                (sort-by first)
                (take 5))))))

(deftest ^:parallel table-rows-seq-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    (is (= [{:name "Red Medicine", :price 3, :category_id 4, :id 1}
            {:name "Stout Burgers & Beers", :price 2, :category_id 11, :id 2}
            {:name "The Apple Pan", :price 2, :category_id 11, :id 3}
            {:name "Wurstküche", :price 2, :category_id 29, :id 4}
            {:name "Brite Spot Family Restaurant", :price 2, :category_id 20, :id 5}]
           (for [row (take 5 (sort-by :id (driver/table-rows-seq driver/*driver*
                                                                 (mt/db)
                                                                 (t2/select-one :model/Table :id (mt/id :venues)))))]
             ;; different DBs use different precisions for these
             (-> (dissoc row :latitude :longitude)
                 (update :price int)
                 (update :category_id int)
                 (update :id int)))))))

#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel invalid-ssh-credentials-test
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
               (driver.u/can-connect-with-details? :postgres details :throw-exceptions))
             (catch Throwable e
               (loop [^Throwable e e]
                 (or (when (instance? java.net.ConnectException e)
                       (throw e))
                     (some-> (.getCause e) recur))))))))))

(defn- test-spliced-count-of [table filter-clause expected]
  (let [query        (mt/mbql-query nil
                       {:source-table (mt/id table)
                        :aggregation  [[:count]]
                        :filter       filter-clause})
        native-query (qp.compile/compile-with-inline-parameters query)]
    (testing (format "\nnative query =\n%s" (u/pprint-to-str native-query))
      (is (= expected
             (ffirst
              (mt/formatted-rows
               [int]
               (qp/process-query
                {:database (mt/id)
                 :type     :native
                 :native   native-query}))))))))

(deftest ^:parallel splice-parameters-mbql-string-param-test
  (testing "metabase.query-processor.compile/compile-with-inline-parameters should generate a query that works correctly"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      (mt/$ids venues
        (testing "splicing a string"
          (test-spliced-count-of :venues [:starts-with $name "Sushi"] 3)
          (testing "containing single quotes -- this is done differently from driver to driver"
            (test-spliced-count-of :venues [:= $name "Barney's Beanery"] 1)))))))

(deftest ^:parallel splice-parameters-mbql-number-param-test
  (testing "metabase.query-processor.compile/compile-with-inline-parameters should generate a query that works correctly"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      (mt/$ids venues
        (testing "splicing an integer"
          (test-spliced-count-of :venues [:= $price 3] 13))
        (testing "splicing floating-point numbers"
          (test-spliced-count-of :venues [:between $price 2.9 3.1] 13))))))

(deftest ^:parallel splice-parameters-mbql-nil-param-test
  (testing "metabase.query-processor.compile/compile-with-inline-parameters should generate a query that works correctly"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      (mt/$ids venues
        (testing "splicing nil"
          (test-spliced-count-of :venues [:is-null $price] 0))))))

(deftest ^:parallel splice-parameters-mbql-boolean-param-test
  (testing "metabase.query-processor.compile/compile-with-inline-parameters should generate a query that works correctly"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      (mt/dataset places-cam-likes
        (mt/$ids places
          (testing "splicing a boolean"
            (test-spliced-count-of :places [:= $liked true] 2)))))))

(deftest ^:parallel splice-parameters-mbql-date-param-test
  (testing "metabase.query-processor.compile/compile-with-inline-parameters should generate a query that works correctly"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
      (mt/$ids checkins
        (testing "splicing a date"
          (test-spliced-count-of :checkins [:= $date "2014-03-05"] 3))))))

(deftest ^:parallel splice-parameters-mbql-time-param-test
  (testing "metabase.query-processor.compile/compile-with-inline-parameters should generate a query that works correctly"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc :+features [:test/time-type]})
      (testing "splicing a time"
        (mt/dataset time-test-data
          (mt/$ids users
            (test-spliced-count-of :users [:= $last_login_time "09:30"] 2)))))))

(defn- find-schema-filters-prop [driver]
  (first (filter (fn [conn-prop]
                   (= :schema-filters (keyword (:type conn-prop))))
                 (driver/connection-properties driver))))

(deftest syncable-schemas-with-schema-filters-test
  (mt/test-drivers (mt/normal-driver-select {:+parent     :sql-jdbc
                                             :+features   [:actions]
                                             :+conn-props ["schema-filters"]})
    (let [fake-schema-name (u/qualified-name ::fake-schema)]
      (with-redefs [sql-jdbc.describe-database/all-schemas (let [orig sql-jdbc.describe-database/all-schemas]
                                                             (fn [metadata]
                                                               (eduction
                                                                cat
                                                                [(orig metadata) [fake-schema-name]])))]
        (let [syncable (driver/syncable-schemas driver/*driver* (mt/db))]
          (is (contains? syncable "public"))
          (is (contains? syncable fake-schema-name))))
      (let [driver             (driver.u/database->driver (mt/db))
            schema-filter-prop (find-schema-filters-prop driver)
            filter-type-prop   (keyword (str (:name schema-filter-prop) "-type"))
            patterns-type-prop (keyword (str (:name schema-filter-prop) "-patterns"))]
        (testing "syncable-schemas works as expected"
          (testing "with an inclusion filter"
            (let [db-filtered (-> (mt/db)
                                  (update :details assoc filter-type-prop "inclusion", patterns-type-prop "public")
                                  ;; so we don't stomp on the connection pool for the normal test DB.
                                  (assoc :id Integer/MAX_VALUE))
                  syncable    (driver/syncable-schemas driver/*driver* db-filtered)]
              (is      (contains? syncable "public"))
              (is (not (contains? syncable fake-schema-name)))))
          (testing "with an exclusion filter"
            (let [db-filtered (-> (mt/db)
                                  (update :details assoc filter-type-prop "exclusion", patterns-type-prop "public")
                                  (assoc :id Integer/MAX_VALUE))
                  syncable (driver/syncable-schemas driver/*driver* db-filtered)]
              (is (not (contains? syncable "public")))
              (is (not (contains? syncable fake-schema-name))))))))))

(deftest ^:parallel uuid-filtering-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc :+features [:uuid-type]})
    (let [uuid        (random-uuid)
          uuid-query  (mt/native-query {:query (format "select cast('%s' as %s) as x"
                                                       uuid
                                                       (sql.tx/field-base-type->sql-type driver/*driver* :type/UUID))})
          mp          (lib.tu/mock-metadata-provider
                       (mt/metadata-provider)
                       {:cards [(merge (mt/card-with-source-metadata-for-query uuid-query)
                                       {:id   1
                                        :type :model})]})
          col         (first (lib.card/card-returned-columns mp (lib.metadata/card mp 1)))
          model-query (lib/query
                       mp
                       {:database (mt/id)
                        :type     :query
                        :query    {:source-table "card__1"}})]
      (is (= :type/UUID (:base-type col)))
      (are [expected filt]
           (= expected
              (mt/rows (qp/process-query (lib/filter model-query filt))))
        [[uuid]] (lib/= col (lib/normalize [:value {:base-type :type/UUID} (str uuid)]))
        [[uuid]] (lib/= col col)
        [[uuid]] (lib/= col (str uuid))
        [[uuid]] (lib/!= col (str (random-uuid)))
        [[uuid]] (lib/starts-with col (str uuid))
        [[uuid]] (lib/ends-with col (str uuid))
        [[uuid]] (lib/contains col (str uuid))

          ;; Test partial uuid values
        [[uuid]] (lib/contains col (subs (str uuid) 0 1))
        [[uuid]] (lib/starts-with col (subs (str uuid) 0 1))
        [[uuid]] (lib/ends-with col (subs (str uuid) (dec (count (str uuid)))))

          ;; Cannot match a uuid, but should not blow up
        [[uuid]] (lib/!= col "q")
        []       (lib/= col "q")
        []       (lib/starts-with col "q")
        []       (lib/ends-with col "q")
        []       (lib/contains col "q")

          ;; empty/null handling
        []       (lib/is-empty col)
        [[uuid]] (lib/not-empty col)
        []       (lib/is-null col)
        [[uuid]] (lib/not-null col)

          ;; nil value handling
        [[uuid]] (lib/!= col nil)
        []       (lib/= col nil))
      (testing ":= uses indexable query"
        (is (=? [:= [:metabase.util.honey-sql-2/identifier :field [(second (lib/->legacy-MBQL (lib/ref col)))]]
                 (some-fn #(= uuid %)
                          #(= [:metabase.util.honey-sql-2/typed
                               [:cast (str uuid) [:raw "uuid"]]
                               {:database-type "uuid"}]
                              %))]
                (sql.qp/->honeysql
                 driver/*driver*
                 [:=
                  (lib/->legacy-MBQL (lib/ref col))
                  [:value (str uuid) {:base_type :type/UUID}]])))
        (is (=? [:= [:metabase.util.honey-sql-2/identifier :field [(second (lib/->legacy-MBQL (lib/ref col)))]]
                 (some-fn #(= uuid %)
                          #(= [:metabase.util.honey-sql-2/typed
                               [:cast (str uuid) [:raw "uuid"]]
                               {:database-type "uuid"}]
                              %))]
                (sql.qp/->honeysql
                 driver/*driver*
                 [:= (lib/->legacy-MBQL (lib/ref col)) uuid])))))))

(deftest query-canceled-test?
  (testing "walks a chain of exceptions"
    (let [e (Exception. (Exception. (Exception. (SQLTimeoutException.))))]
      (testing "checks for SQLTimeoutException as the default case"
        (is (true? (driver/query-canceled? :sql-jdbc e)))))))

(defn- qualified-table-name
  "Create a qualified table name keyword from schema and name."
  [schema table-name]
  (if schema
    (keyword schema table-name)
    (keyword table-name)))

(defn- table-rows
  "Helper function to get table rows for testing"
  [qualified-table-name]
  (->> (driver/table-rows-seq driver/*driver* (mt/db) {:name (name qualified-table-name)
                                                       :schema (namespace qualified-table-name)})
       (map #(vector (:id %) (:name %)))
       sort))

(deftest rename-tables-test
  (mt/test-drivers (mt/normal-drivers-with-feature :atomic-renames)
    (testing "rename-tables should rename multiple tables atomically"
      (let [db-id             (mt/id)
            driver            driver/*driver*
            schema            (sql.tx/session-schema driver)
            test-table-1      (mt/random-name)
            test-table-2      (mt/random-name)
            qualified-table-1 (qualified-table-name schema test-table-1)
            qualified-table-2 (qualified-table-name schema test-table-2)
            temp-table-1      (str test-table-1 "_temp")
            temp-table-2      (str test-table-2 "_temp")
            qualified-temp-1  (qualified-table-name schema temp-table-1)
            qualified-temp-2  (qualified-table-name schema temp-table-2)
            test-data-1       [[1 "Alice"] [2 "Bob"]]
            test-data-2       [[1 "Product A"] [2 "Product B"]]]

        (driver/create-table! driver db-id qualified-table-1
                              {"id" "INTEGER", "name" "VARCHAR(255)"} {})
        (driver/create-table! driver db-id qualified-table-2
                              {"id" "INTEGER", "name" "VARCHAR(255)"} {})

        (try
          (driver/insert-into! driver db-id qualified-table-1 ["id" "name"] test-data-1)
          (driver/insert-into! driver db-id qualified-table-2 ["id" "name"] test-data-2)

          (testing "basic rename operations work correctly"
            (driver/rename-tables! driver db-id
                                   {qualified-table-1 qualified-temp-1
                                    qualified-table-2 qualified-temp-2})

            (is (driver/table-exists? driver (mt/db) {:name temp-table-1 :schema schema}))
            (is (driver/table-exists? driver (mt/db) {:name temp-table-2 :schema schema}))
            (is (not (driver/table-exists? driver (mt/db) {:name test-table-1 :schema schema})))
            (is (not (driver/table-exists? driver (mt/db) {:name test-table-2 :schema schema})))

            (is (= test-data-1 (table-rows qualified-temp-1)))
            (is (= test-data-2 (table-rows qualified-temp-2)))

            (driver/rename-tables! driver db-id
                                   {qualified-temp-1 qualified-table-1
                                    qualified-temp-2 qualified-table-2}))

          (testing "atomicity: all renames fail if any rename fails"
            (let [conflict-table (str test-table-2 "_conflict")
                  qualified-conflict (qualified-table-name schema conflict-table)]
              (driver/create-table! driver db-id qualified-conflict {"id" "INTEGER"} {})

              (try
                (is (thrown? Exception
                             (driver/rename-tables! driver db-id
                                                    {qualified-table-1 qualified-temp-1
                                                     qualified-table-2 qualified-conflict})))

                (testing "original tables should still exist after failed atomic rename"
                  (is (driver/table-exists? driver (mt/db) {:name test-table-1 :schema schema}))
                  (is (driver/table-exists? driver (mt/db) {:name test-table-2 :schema schema})))

                (testing "temp tables should not exist after failed atomic rename"
                  (is (not (driver/table-exists? driver (mt/db) {:name temp-table-1 :schema schema})))
                  (is (not (driver/table-exists? driver (mt/db) {:name temp-table-2 :schema schema}))))

                (testing "original data should be intact after failed atomic rename"
                  (is (= test-data-1 (table-rows qualified-table-1)))
                  (is (= test-data-2 (table-rows qualified-table-2))))

                (finally
                  (driver/drop-table! driver db-id qualified-conflict)))))

          (finally
            (driver/drop-table! driver db-id qualified-table-1)
            (driver/drop-table! driver db-id qualified-table-2)))))))

(deftest rename-table-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc
                                             :+features [:rename]})
    (testing "rename-table! should rename a single table correctly"
      (let [db-id           (mt/id)
            driver          driver/*driver*
            schema          (sql.tx/session-schema driver)
            test-table      (mt/random-name)
            renamed-table   (str test-table "_renamed")
            qualified-table (qualified-table-name schema test-table)
            qualified-renamed (qualified-table-name schema renamed-table)]
        (driver/create-table! driver db-id qualified-table
                              {"id" "INTEGER", "name" "VARCHAR(255)"} {})
        (try
          (testing "single table rename works correctly"
            (driver/rename-table! driver db-id qualified-table qualified-renamed)
            (is (driver/table-exists? driver (mt/db) {:name renamed-table :schema schema})
                "Renamed table should exist")
            (is (not (driver/table-exists? driver (mt/db) {:name test-table :schema schema}))
                "Original table should not exist"))

          (finally
            (when (driver/table-exists? driver (mt/db) {:name renamed-table :schema schema})
              (driver/drop-table! driver db-id qualified-renamed))
            (when (driver/table-exists? driver (mt/db) {:name test-table :schema schema})
              (driver/drop-table! driver db-id qualified-table))))))))
