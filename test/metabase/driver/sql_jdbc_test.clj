(ns ^:mb/driver-tests metabase.driver.sql-jdbc-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.sql-jdbc.sync.describe-database
    :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
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
                         {:name table, :schema "PUBLIC", :description nil}))}
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
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc
                                             :+features [:actions]
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
            (mt/with-temp [:model/Database db-filtered {:engine  driver
                                                        :details (-> (mt/db)
                                                                     :details
                                                                     (assoc filter-type-prop "inclusion"
                                                                            patterns-type-prop "public"))}]
              (let [syncable (driver/syncable-schemas driver/*driver* db-filtered)]
                (is      (contains? syncable "public"))
                (is (not (contains? syncable fake-schema-name))))))
          (testing "with an exclusion filter"
            (mt/with-temp [:model/Database db-filtered {:engine  driver
                                                        :details (-> (mt/db)
                                                                     :details
                                                                     (assoc filter-type-prop "exclusion"
                                                                            patterns-type-prop "public"))}]
              (let [syncable (driver/syncable-schemas driver/*driver* db-filtered)]
                (is (not (contains? syncable "public")))
                (is (not (contains? syncable fake-schema-name)))))))))))

(deftest ^:parallel uuid-filtering-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc :+features [:uuid-type]})
    (let [uuid (random-uuid)
          uuid-query (mt/native-query {:query (format "select cast('%s' as %s) as x"
                                                      uuid
                                                      (sql.tx/field-base-type->sql-type driver/*driver* :type/UUID))})]
      (mt/with-temp [:model/Card card (-> (mt/card-with-source-metadata-for-query uuid-query)
                                          (assoc :type :model))]
        (let [col-metadata (first (:result_metadata card))
              model-query {:database (mt/id)
                           :type :query
                           :query {:source-table (str "card__" (:id card))}}]
          (is (= :type/UUID (:base_type col-metadata)))
          (are [expected filt]
               (= expected
                  (mt/rows (qp/process-query (assoc-in model-query [:query :filter] filt))))
            [[uuid]] [:= (:field_ref col-metadata) [:value (str uuid) {:base_type :type/UUID}]]
            [[uuid]] [:= (:field_ref col-metadata) (:field_ref col-metadata)]
            [[uuid]] [:= (:field_ref col-metadata) (str uuid)]
            [[uuid]] [:!= (:field_ref col-metadata) (str (random-uuid))]
            [[uuid]] [:starts-with (:field_ref col-metadata) (str uuid)]
            [[uuid]] [:ends-with (:field_ref col-metadata) (str uuid)]
            [[uuid]] [:contains (:field_ref col-metadata) (str uuid)]

            ;; Test partial uuid values
            [[uuid]] [:contains (:field_ref col-metadata) (subs (str uuid) 0 1)]
            [[uuid]] [:starts-with (:field_ref col-metadata) (subs (str uuid) 0 1)]
            [[uuid]] [:ends-with (:field_ref col-metadata) (subs (str uuid) (dec (count (str uuid))))]

            ;; Cannot match a uuid, but should not blow up
            [[uuid]] [:!= (:field_ref col-metadata) "q"]
            [] [:= (:field_ref col-metadata) "q"]
            [] [:starts-with (:field_ref col-metadata) "q"]
            [] [:ends-with (:field_ref col-metadata) "q"]
            [] [:contains (:field_ref col-metadata) "q"]

            ;; empty/null handling
            [] [:is-empty (:field_ref col-metadata)]
            [[uuid]] [:not-empty (:field_ref col-metadata)]
            [] [:is-null (:field_ref col-metadata)]
            [[uuid]] [:not-null (:field_ref col-metadata)]

            ;; nil value handling
            [[uuid]] [:!= (:field_ref col-metadata) nil]
            [] [:= (:field_ref col-metadata) nil])
          (testing ":= uses indexable query"
            (is (=? [:= [:metabase.util.honey-sql-2/identifier :field [(second (:field_ref col-metadata))]]
                     (some-fn #(= uuid %)
                              #(= [:metabase.util.honey-sql-2/typed
                                   [:cast (str uuid) [:raw "uuid"]]
                                   {:database-type "uuid"}]
                                  %))]
                    (sql.qp/->honeysql
                     driver/*driver*
                     [:= (:field_ref col-metadata) [:value (str uuid) {:base_type :type/UUID}]])))
            (is (=? [:= [:metabase.util.honey-sql-2/identifier :field [(second (:field_ref col-metadata))]]
                     (some-fn #(= uuid %)
                              #(= [:metabase.util.honey-sql-2/typed
                                   [:cast (str uuid) [:raw "uuid"]]
                                   {:database-type "uuid"}]
                                  %))]
                    (sql.qp/->honeysql
                     driver/*driver*
                     [:= (:field_ref col-metadata) uuid])))))))))

(deftest query-canceled-test?
  (testing "walks a chain of exceptions"
    (let [e (Exception. (Exception. (Exception. (SQLTimeoutException.))))]
      (testing "checks for SQLTimeoutException as the default case"
        (is (true? (driver/query-canceled? :sql-jdbc e)))))))
