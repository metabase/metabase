(ns metabase.driver.sql-jdbc.sync.describe-database-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync.describe-database
    :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Database Table]]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.honeysql-extensions :as hx]
   [toucan2.core :as t2])
  (:import
   (java.sql ResultSet)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :plugins))

(deftest simple-select-probe-query-test
  (testing "honey-sql-version produces the same query"
    (are [version] (= ["SELECT TRUE AS \"_\" FROM \"schema\".\"wow\" WHERE 1 <> 1 LIMIT 0"]
                      (binding [hx/*honey-sql-version* version]
                        (sql-jdbc.describe-database/simple-select-probe-query :sql "schema" "wow")))
      1
      2))
  (testing "real drivers produce correct query"
    (are [driver] (= ["SELECT TRUE AS \"_\" FROM \"schema\".\"wow\" WHERE 1 <> 1 LIMIT 0"]
                     (sql-jdbc.describe-database/simple-select-probe-query driver "schema" "wow"))
      :h2
      :postgres))
  (testing "simple-select-probe-query shouldn't actually return any rows"
    (let [{:keys [name schema]} (t2/select-one Table :id (mt/id :venues))]
      (is (= []
             (mt/rows
               (qp/process-query
                 (let [[sql] (sql-jdbc.describe-database/simple-select-probe-query (or driver/*driver* :h2) schema name)]
                   (mt/native-query {:query sql})))))))))

(defn- sql-jdbc-drivers-with-default-describe-database-impl
  "All SQL JDBC drivers that use the default SQL JDBC implementation of `describe-database`. (As far as I know, this is
  all of them.)"
  []
  (set
   (filter
    #(identical? (get-method driver/describe-database :sql-jdbc) (get-method driver/describe-database %))
    (descendants driver/hierarchy :sql-jdbc))))

(deftest fast-active-tables-test
  (let [spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
    (with-open [conn (jdbc/get-connection spec)]
      ;; We have to mock this to make it work with all DBs
      (with-redefs [sql-jdbc.describe-database/all-schemas (constantly #{"PUBLIC"})]
        (is (= ["CATEGORIES" "CHECKINS" "USERS" "VENUES"]
               (->> (into [] (sql-jdbc.describe-database/fast-active-tables (or driver/*driver* :h2) conn nil nil))
                    (map :name)
                    sort)))))))

(deftest post-filtered-active-tables-test
  (let [spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
    (with-open [conn (jdbc/get-connection spec)]
      (is (= ["CATEGORIES" "CHECKINS" "USERS" "VENUES"]
             (->> (into [] (sql-jdbc.describe-database/post-filtered-active-tables :h2 conn nil nil))
                  (map :name)
                  sort))))))

(deftest describe-database-test
  (is (= {:tables #{{:name "USERS", :schema "PUBLIC", :description nil}
                    {:name "VENUES", :schema "PUBLIC", :description nil}
                    {:name "CATEGORIES", :schema "PUBLIC", :description nil}
                    {:name "CHECKINS", :schema "PUBLIC", :description nil}}}
         (sql-jdbc.describe-database/describe-database :h2 (mt/id)))))

(defn- describe-database-with-open-resultset-count
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
      (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec db)]
        (sql-jdbc.describe-database/describe-database driver conn)
        (reduce + (for [^ResultSet rs @resultsets]
                    (if (.isClosed rs) 0 1)))))))

(defn- count-active-tables-in-db
  [db-id]
  (t2/count Table
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
             (describe-database-with-open-resultset-count driver/*driver* (mt/db)))))))

(defn- sync-and-assert-filtered-tables [database assert-table-fn]
  (mt/with-temp Database [db-filtered database]
    (sync/sync-database! db-filtered {:scan :schema})
    (let [tables (t2/select Table :db_id (u/the-id db-filtered))]
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

(deftest database-schema-filtering-test
  (mt/test-drivers (schema-filtering-drivers)
    (let [driver             (driver.u/database->driver (mt/db))
          schema-filter-prop (find-schema-filters-prop driver)
          filter-type-prop   (keyword (str (:name schema-filter-prop) "-type"))
          patterns-type-prop (keyword (str (:name schema-filter-prop) "-patterns"))]
      (testing "Filtering connections for schemas works as expected"
        (testing " with an inclusion filter"
          (sync-and-assert-filtered-tables
           {:name    (format "Test %s DB with dataset inclusion filters" driver)
            :engine  driver
            :details (-> (mt/db)
                         :details
                         (assoc filter-type-prop "inclusion"
                                patterns-type-prop "s*,v*,2*"))}
           (fn [{schema-name :schema}]
             (testing (format "schema name = %s" (pr-str schema-name))
               (is (contains? #{\s \v \2} (first schema-name)))))))
        (testing " with an exclusion filter"
          (sync-and-assert-filtered-tables
           {:name    (format "Test %s DB with dataset exclusion filters" driver)
            :engine  driver
            :details (-> (mt/db)
                         :details
                         (assoc filter-type-prop "exclusion"
                                patterns-type-prop "v*"))}
           (fn [{schema-name :schema}]
             (testing (format "schema name = %s" (pr-str schema-name))
               (is (not= \v (first schema-name)))))))))))
