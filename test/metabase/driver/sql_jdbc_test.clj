(ns metabase.driver.sql-jdbc-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.sync.describe-database
    :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Database Field Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definition-test :as dataset-definition-test]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

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
              fk-metadata (driver/describe-fields :redshift (mt/db)
                                                  :table-names [(:name songs)]
                                                  :schema-names [(:schema songs)])]
          (is (= #{{:name "song_id", :pk? true} {:name "artist_id", :pk? true}}
                 (into #{}
                       (map #(select-keys % [:name :pk?]))
                       fk-metadata))))))))

(deftest ^:parallel table-rows-sample-test
  (mt/test-drivers (sql-jdbc.tu/normal-sql-jdbc-drivers)
    (is (= [["20th Century Cafe"]
            ["25°"]
            ["33 Taps"]
            ["800 Degrees Neapolitan Pizzeria"]
            ["BCD Tofu House"]]
           (->> (metadata-queries/table-rows-sample (t2/select-one Table :id (mt/id :venues))
                  [(t2/select-one Field :id (mt/id :venues :name))]
                  (constantly conj))
                ;; since order is not guaranteed do some sorting here so we always get the same results
                (sort-by first)
                (take 5))))))

(deftest ^:parallel table-rows-seq-test
  (mt/test-drivers (sql-jdbc.tu/normal-sql-jdbc-drivers)
    (is (= [{:name "Red Medicine", :price 3, :category_id 4, :id 1}
            {:name "Stout Burgers & Beers", :price 2, :category_id 11, :id 2}
            {:name "The Apple Pan", :price 2, :category_id 11, :id 3}
            {:name "Wurstküche", :price 2, :category_id 29, :id 4}
            {:name "Brite Spot Family Restaurant", :price 2, :category_id 20, :id 5}]
           (for [row (take 5 (sort-by :id (driver/table-rows-seq driver/*driver*
                                                                 (mt/db)
                                                                 (t2/select-one Table :id (mt/id :venues)))))]
             ;; different DBs use different precisions for these
             (-> (dissoc row :latitude :longitude)
                 (update :price int)
                 (update :category_id int)
                 (update :id int)))))))

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

;;; --------------------------------- Tests for splice-parameters-into-native-query ----------------------------------

(deftest ^:parallel splice-parameters-native-test
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
        native-query (qp.compile/compile-and-splice-parameters query)
        spliced      (driver/splice-parameters-into-native-query driver/*driver* native-query)]
    (ffirst
     (mt/formatted-rows [int]
       (qp/process-query
        {:database (mt/id)
         :type     :native
         :native   spliced})))))

(deftest ^:parallel splice-parameters-mbql-test
  (testing "`splice-parameters-into-native-query` should generate a query that works correctly"
    (mt/test-drivers (sql-jdbc.tu/normal-sql-jdbc-drivers)
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
                 (spliced-count-of :checkins [:= $date "2014-03-05"])))))
      (when (mt/supports-time-type? driver/*driver*)
        (testing "splicing a time"
          (mt/dataset time-test-data
            (is (= 2
                   (mt/$ids users
                     (spliced-count-of :users [:= $last_login_time "09:30"]))))))))))

(defn- find-schema-filters-prop [driver]
  (first (filter (fn [conn-prop]
                   (= :schema-filters (keyword (:type conn-prop))))
                 (driver/connection-properties driver))))

(deftest syncable-schemas-with-schema-filters-test
  (mt/test-drivers (set (for [driver (set/intersection (sql-jdbc.tu/sql-jdbc-drivers)
                                                       (mt/normal-drivers-with-feature :actions))
                              :when  (driver.u/find-schema-filters-prop driver)]
                          driver))
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
            (t2.with-temp/with-temp [Database db-filtered {:engine  driver
                                                           :details (-> (mt/db)
                                                                        :details
                                                                        (assoc filter-type-prop "inclusion"
                                                                               patterns-type-prop "public"))}]
              (let [syncable (driver/syncable-schemas driver/*driver* db-filtered)]
                (is      (contains? syncable "public"))
                (is (not (contains? syncable fake-schema-name))))))
          (testing "with an exclusion filter"
            (t2.with-temp/with-temp [Database db-filtered {:engine  driver
                                                           :details (-> (mt/db)
                                                                        :details
                                                                        (assoc filter-type-prop "exclusion"
                                                                               patterns-type-prop "public"))}]
              (let [syncable (driver/syncable-schemas driver/*driver* db-filtered)]
                (is (not (contains? syncable "public")))
                (is (not (contains? syncable fake-schema-name)))))))))))

(deftest ^:parallel uuid-filtering-test
  (mt/test-drivers (set/intersection
                     (mt/sql-jdbc-drivers)
                     (mt/normal-drivers-with-feature :uuid-type))
    (let [uuid (random-uuid)
          uuid-query (mt/native-query {:query (format "select cast('%s' as uuid) as x" uuid)})
          results (qp/process-query uuid-query)
          result-metadata (get-in results [:data :results_metadata :columns])
          col-metadata (first result-metadata)]
      (is (= :type/UUID (:base_type col-metadata)))
      (mt/with-temp [:model/Card card {:type :model
                                       :result_metadata result-metadata
                                       :dataset_query uuid-query}]
        (let [model-query {:database (mt/id)
                           :type :query
                           :query {:source-table (str "card__" (:id card))}}]
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
