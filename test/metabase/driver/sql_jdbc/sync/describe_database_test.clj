(ns ^:mb/driver-tests metabase.driver.sql-jdbc.sync.describe-database-test
  {:clj-kondo/config '{:linters
                       ;; allowing this for now since sync doesn't work with Metadata Providers
                       {:discouraged-var {metabase.test/with-temp {:level :off}}}}}
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql ResultSet Connection)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :plugins))

(deftest ^:parallel simple-select-probe-query-test
  (is (= ["SELECT TRUE AS \"_\" FROM \"schema\".\"wow\" WHERE 1 <> 1 LIMIT 0"]
         (sql-jdbc.describe-database/simple-select-probe-query :sql "schema" "wow"))))

(deftest ^:parallel simple-select-probe-query-test-2
  ;; this is mostly a sanity check against some of our known drivers so ok to hardcode driver names.
  #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
  (testing "real drivers produce correct query"
    (are [driver] (= ["SELECT TRUE AS \"_\" FROM \"schema\".\"wow\" WHERE 1 <> 1 LIMIT 0"]
                     (sql-jdbc.describe-database/simple-select-probe-query driver "schema" "wow"))
      :h2
      :postgres)))

(deftest ^:parallel simple-select-probe-query-test-3
  (testing "simple-select-probe-query shouldn't actually return any rows"
    (let [{:keys [name schema]} (t2/select-one :model/Table :id (mt/id :venues))]
      (is (= []
             (mt/rows
              (qp/process-query
               (let [[sql] (sql-jdbc.describe-database/simple-select-probe-query (or driver/*driver* :h2) schema name)]
                 (mt/native-query {:query sql})))))))))

(defn- sql-jdbc-drivers-with-default-describe-database-impl
  "All SQL JDBC drivers that use the default SQL JDBC implementation of `describe-database`. (As far as I know, this is
  all of them.)"
  []
  (conj (set
         (filter
          #(identical? (get-method driver/describe-database* :sql-jdbc) (get-method driver/describe-database* %))
          (descendants driver/hierarchy :sql-jdbc)))
        ;; redshift wraps the default implementation, but additionally filters tables according to the database name
        :redshift))

(deftest fast-active-tables-test
  (is (= ["CATEGORIES" "CHECKINS" "ORDERS" "PEOPLE" "PRODUCTS" "REVIEWS" "USERS" "VENUES"]
         (sql-jdbc.execute/do-with-connection-with-options
          (or driver/*driver* :h2)
          (mt/db)
          nil
          (fn [^Connection conn]
            ;; We have to mock this to make it work with all DBs
            (with-redefs [sql-jdbc.describe-database/all-schemas (constantly #{"PUBLIC"})]
              (->> (into [] (sql-jdbc.describe-database/fast-active-tables (or driver/*driver* :h2) conn nil nil))
                   (map :name)
                   sort)))))))

(deftest post-filtered-active-tables-test
  (is (= ["CATEGORIES" "CHECKINS" "ORDERS" "PEOPLE" "PRODUCTS" "REVIEWS" "USERS" "VENUES"]
         (sql-jdbc.execute/do-with-connection-with-options
          :h2
          (mt/db)
          nil
          (fn [^Connection conn]
            (->> (into [] (sql-jdbc.describe-database/post-filtered-active-tables :h2 conn nil nil))
                 (map :name)
                 sort))))))

(deftest describe-database-test
  (is (= {:tables #{{:name "USERS", :schema "PUBLIC", :description nil, :is_writable true}
                    {:name "VENUES", :schema "PUBLIC", :description nil, :is_writable true}
                    {:name "CATEGORIES", :schema "PUBLIC", :description nil, :is_writable true}
                    {:name "CHECKINS", :schema "PUBLIC", :description nil, :is_writable true}
                    {:name "ORDERS", :schema "PUBLIC", :description nil, :is_writable true}
                    {:name "PEOPLE", :schema "PUBLIC", :description nil, :is_writable true}
                    {:name "PRODUCTS", :schema "PUBLIC", :description nil, :is_writable true}
                    {:name "REVIEWS", :schema "PUBLIC", :description nil, :is_writable true}}}
         (sql-jdbc.describe-database/describe-database :h2 (mt/id)))))

(defn- describe-database-with-open-resultset-count!
  "Just like `describe-database`, but instead of returning the database description returns the number of ResultSet
  objects the sync process left open. Make sure you wrap ResultSets with `with-open`! Otherwise some JDBC drivers like
  Oracle and Redshift will keep open cursors indefinitely."
  [driver db]
  (let [orig-result-set-seq jdbc/result-set-seq
        resultsets          (atom [])]
    ;; swap out `jdbc/result-set-seq` which is what ultimately gets called on result sets with a function that will
    ;; stash the ResultSet object in an atom so we can check whether its closed later
    (with-redefs [jdbc/result-set-seq (fn [^ResultSet rs & more]
                                        (swap! resultsets conj rs)
                                        (apply orig-result-set-seq rs more))]
      ;; taking advantage of the fact that `sql-jdbc.describe-database/describe-database` can accept JBDC connections
      ;; instead of databases; by doing this we can keep the connection open and check whether resultsets are still
      ;; open before they would normally get closed
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       db
       nil
       (fn [_conn]
         (sql-jdbc.describe-database/describe-database driver db)
         (reduce + (for [^ResultSet rs @resultsets]
                     (if (.isClosed rs) 0 1))))))))

(defn- count-active-tables-in-db
  [db-id]
  (t2/count :model/Table
            :db_id  db-id
            :active true))

(deftest sync-only-accessable
  (one-off-dbs/with-blank-db
    (doseq [statement ["set db_close_delay -1;"
                       "drop table if exists \"birds\";"
                       "create table \"birds\" ();"]]
      (jdbc/execute! one-off-dbs/*conn* [statement]))
    (sync/sync-database! (mt/db))
    (is (= 1 (count-active-tables-in-db (mt/id))))
    ;; We have to mock this as H2 doesn't have the notion of a user connecting to it
    (with-redefs [sql-jdbc.sync.interface/have-select-privilege? (constantly false)]
      (sync/sync-database! (mt/db))
      (is (= 0 (count-active-tables-in-db (mt/id)))
          "We shouldn't sync tables for which we don't have select privilege"))))

(deftest dont-leak-resultsets-test
  (mt/test-drivers (sql-jdbc-drivers-with-default-describe-database-impl)
    (testing (str "make sure that running the sync process doesn't leak cursors because it's not closing the ResultSets. "
                  "See issues #4389, #6028, and #6467 (Oracle) and #7609 (Redshift)")
      (is (= 0
             (describe-database-with-open-resultset-count! driver/*driver* (mt/db)))))))

(defn- sync-and-assert-filtered-tables [database assert-table-fn]
  (mt/with-temp [:model/Database db-filtered database]
    (sync/sync-database! db-filtered {:scan :schema})
    (let [tables (t2/select :model/Table :db_id (u/the-id db-filtered))]
      (doseq [table tables]
        (assert-table-fn table)))))

(defn- find-schema-filters-prop [driver]
  (first (filter (fn [conn-prop]
                   (= :schema-filters (keyword (:type conn-prop))))
                 (driver/connection-properties driver))))

(defn- schema-filtering-drivers []
  (set (for [driver (mt/normal-drivers)
             :when  (driver.u/find-schema-filters-prop driver)]
         driver)))

(defmethod driver/database-supports? [::driver/driver ::database-schema-filtering-test]
  [_driver _feature _database]
  true)

;;; These drivers are tested separately because they take too long and flake in CI
(doseq [driver [:bigquery-cloud-sdk :redshift :databricks]]
  (defmethod driver/database-supports? [driver ::database-schema-filtering-test]
    [_driver _feature _database]
    false))

(defmulti filtered-db-details
  "Returns database details for the filtered database tests."
  {:arglists '([driver filter-type-prop filter-type patterns-type-prop pattern])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod filtered-db-details :default
  [_driver filter-type-prop filter-type patterns-type-prop pattern]
  (-> (mt/db)
      :details
      (assoc filter-type-prop filter-type
             patterns-type-prop pattern)))

(defmethod filtered-db-details :snowflake
  [_driver filter-type-prop filter-type patterns-type-prop pattern]
  (-> (mt/db)
      :details
      (assoc filter-type-prop filter-type
             patterns-type-prop pattern)
      (dissoc :private-key-id)
      (assoc :private-key-options "uploaded"
             :private-key-value (mt/priv-key->base64-uri (tx/db-test-env-var-or-throw :snowflake :private-key))
             :use-password false)))

(deftest database-schema-filtering-test
  (mt/test-drivers (set/intersection (schema-filtering-drivers)
                                     (mt/normal-drivers-with-feature ::database-schema-filtering-test))
    (let [driver             (driver.u/database->driver (mt/db))
          schema-filter-prop (find-schema-filters-prop driver)
          filter-type-prop   (keyword (str (:name schema-filter-prop) "-type"))
          patterns-type-prop (keyword (str (:name schema-filter-prop) "-patterns"))]
      (testing "Filtering connections for schemas works as expected"
        (testing " with an inclusion filter"
          (sync-and-assert-filtered-tables
           {:name    (format "Test %s DB with dataset inclusion filters" driver)
            :engine  driver
            :details (filtered-db-details driver filter-type-prop "inclusion"
                                          patterns-type-prop "public.s*,public.v*,public.2*")}
           (fn [{schema-name :schema}]
             (testing (format "schema name = %s" (pr-str schema-name))
               (is (contains? #{\s \v \2} (first schema-name)))))))
        (testing " with an exclusion filter"
          (sync-and-assert-filtered-tables
           {:name    (format "Test %s DB with dataset exclusion filters" driver)
            :engine  driver
            :details (filtered-db-details driver filter-type-prop "exclusion"
                                          patterns-type-prop "v*")}
           (fn [{schema-name :schema}]
             (testing (format "schema name = %s" (pr-str schema-name))
               (is (not= \v (first schema-name)))))))))))

(deftest have-select-privilege?-test
  (testing "checking select privilege works with and without auto commit (#36040)"
    (let [default-have-select-privilege?
          #(identical? (get-method sql-jdbc.sync.interface/have-select-privilege? :sql-jdbc)
                       (get-method sql-jdbc.sync.interface/have-select-privilege? %))]
      (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc
                                                 :+fns [default-have-select-privilege?]})
        (let [{schema :schema, table-name :name} (t2/select-one :model/Table (mt/id :checkins))]
          (qp.store/with-metadata-provider (mt/id)
            (testing (sql-jdbc.describe-database/simple-select-probe-query driver/*driver* schema table-name)
              (doseq [auto-commit [true false]]
                (testing (pr-str {:auto-commit auto-commit :schema schema :name table-name})
                  (sql-jdbc.execute/do-with-connection-with-options
                   driver/*driver*
                   (mt/db)
                   nil
                   (fn [^Connection conn]
                     ;; Databricks does not support setting auto commit to false. Catching the setAutoCommit
                     ;; exception results in testing the true value only.
                     (try
                       (.setAutoCommit conn auto-commit)
                       (catch Exception _
                         (log/trace "Failed to set auto commit.")))
                     (is (false? (sql-jdbc.sync.interface/have-select-privilege?
                                  driver/*driver* conn schema (str table-name "_should_not_exist"))))
                     (is (true? (sql-jdbc.sync.interface/have-select-privilege?
                                 driver/*driver* conn schema table-name))))))))))))))

;;; TODO: fix and change this to test on (mt/sql-jdbc-drivers)
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest sync-table-with-backslash-test
  (mt/test-drivers #{:postgres}
    (testing "table with backslash in name, PKs, FKS are correctly synced"
      (mt/with-temp-test-data [["human\\race"
                                [{:field-name "humanraceid" :base-type :type/Integer :pk? true}
                                 {:field-name "race" :base-type :type/Text}]
                                [[1 "homo sapiens"]]]
                               ["citizen"
                                [{:field-name "citizen\\id" :base-type :type/Integer :pk? true}
                                 {:field-name "race\\id" :base-type :type/Integer :fk "human\\race"}]
                                [[1 1]]]]
        (let [tables            (t2/select :model/Table :db_id (mt/id))
              field-name->field (t2/select-fn->fn :name identity :model/Field :table_id [:in (map :id tables)])]
          (is (= #{"human\\race" "citizen"} (set (map :name tables))))
          (is (= #{"humanraceid" "citizen\\id" "race" "race\\id"}
                 (set (keys field-name->field))))
          (is (= (get-in field-name->field ["humanraceid" :id])
                 (get-in field-name->field ["race\\id" :fk_target_field_id]))))))))

(deftest resilient-to-conn-close?-test
  (testing "checking sync is resilient to connections being closed during [have-select-privilege?]"
    (let [jdbc-describe-database #(identical? (get-method driver/describe-database* :sql-jdbc)
                                              (get-method driver/describe-database* %))]
      (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc
                                                 :+fns [jdbc-describe-database]
                                                 :-features [:table-privileges]})
        (let [closed-first (volatile! false)
              execute-select-probe-query @#'sql-jdbc.describe-database/execute-select-probe-query
              all-tables (driver/describe-database driver/*driver* (mt/id))]
          (with-redefs [sql-jdbc.describe-database/execute-select-probe-query
                        (fn [driver ^Connection conn query]
                          (when-not @closed-first
                            (vreset! closed-first true)
                            (.close conn))
                          (execute-select-probe-query driver conn query))]
            (let [table-names #(->> % :tables (map :name) set)
                  all-tables-sans-one (table-names (driver/describe-database driver/*driver* (mt/id)))]
              ;; there is at maximum one missing table
              (is (>= 1 (count (set/difference all-tables all-tables-sans-one)))))))))))

(defn- run-retry-have-select-privilege!
  [probe-errors query-canceled probe-error-fn]
  (let [{schema :schema, table-name :name} (t2/select-one :model/Table (mt/id :checkins))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver/*driver* (mt/db) nil
     (fn [^Connection conn]
       (let [select-probes (atom 0)]
         (with-redefs [sql-jdbc.describe-database/execute-select-probe-query
                       (fn [_driver conn' [sql]]
                         (let [n (swap! select-probes inc)]
                           (when (< n probe-errors)
                             (probe-error-fn conn' sql))))
                       driver/query-canceled? (constantly query-canceled)]
           [(sql-jdbc.sync/have-select-privilege? driver/*driver* conn schema table-name)
            @select-probes]))))))

(deftest retry-have-select-privilege-test
  (mt/test-drivers (mt/normal-driver-select
                    {:+parent :sql-jdbc
                     :+fns [#(identical? (get-method sql-jdbc.sync/have-select-privilege? :sql-jdbc)
                                         (get-method sql-jdbc.sync/have-select-privilege? %))]
                     :-features [:table-privileges]})
    (letfn [(probe-error-fn [conn sql]
              (.close conn)
              (.prepareStatement conn sql))]
      (testing "we will retry syncing a table once if the connection is closed"
        (let [[result probes] (run-retry-have-select-privilege! 2 false probe-error-fn)]
          (is (true? result))
          (is (= 2 probes))))
      (testing "we will only retry syncing a table if the connection is closed"
        (let [[result probes] (run-retry-have-select-privilege! 2 false (fn [_conn _sql]
                                                                          (throw (ex-info "not connection closed error" {}))))]
          (is (false? result))
          (is (= 1 probes))))
      (testing "we won't retry syncing a table more than once if the connection is closed"
        (let [[result probes] (run-retry-have-select-privilege! 3 false probe-error-fn)]
          (is (false? result))
          (is (= 2 probes))))
      (testing "we won't retry syncing a table if the probe query was canceled"
        (let [[result probes] (run-retry-have-select-privilege! 3 true probe-error-fn)]
          (is (true? result))
          (is (= 1 probes)))))))
