(ns metabase.test.data.dataset-store.snowflake-test
  "Executable documentation for the Snowflake [[metabase.test.data.dataset-store/DatasetStore]].

  Every call the store makes to the warehouse is intercepted at `clojure.java.jdbc`, so these tests
  record the exact SQL a happy path emits and assert on it. They are a demonstration of behaviour
  rather than a proof of correctness: nothing here checks that Snowflake would accept or serialize
  these statements, only that this is what the store sends and in what order."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test.data.dataset-store :as dataset-store]
   [metabase.test.data.dataset-store.snowflake :as dss]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.snowflake :as snowflake.tx]
   [metabase.test.data.sql-jdbc.load-data :as load-data]))

(set! *warn-on-reflection* true)

(def ^:private dataset-id "mbds_deadbeef_test_data")

(defn- dbdef []
  (tx/map->DatabaseDefinition {:database-name dataset-id :table-definitions [] :options {}}))

(defn- collapse [sql]
  (str/trim (str/replace sql #"\s+" " ")))

(defn- mutating? [sql]
  (re-find #"(?i)^(CREATE|DROP|INSERT|UPDATE|DELETE|MERGE)" sql))

(defn- record-sql!
  "Run `f` with every JDBC call captured. `rows` answers each `jdbc/query`. Returns the store's
  result alongside every statement sent, in order."
  [rows f]
  (let [statements (atom [])
        capture    (fn [sql-params] (swap! statements conj (collapse (first sql-params))))]
    (with-redefs [jdbc/execute! (fn [_db sql-params & _] (capture sql-params) [1])
                  jdbc/query    (fn [_db sql-params & _] (capture sql-params) rows)
                  ;; Loading a dataset's tables is the driver's business, not the store's; stubbed so
                  ;; the statements below are only those the store itself sends.
                  load-data/create-db! (fn [& _] nil)
                  snowflake.tx/set-current-user-timezone! (fn [& _] nil)]
      (let [result (f)]
        {:result result :sql @statements}))))

(defn- store []
  (dss/snowflake-dataset-store {:spec {:datasource :stubbed}}))

(deftest create-dataset-emits-setup-claim-and-publish-test
  (testing "creating a dataset nobody has claimed"
    (let [{:keys [result sql]} (record-sql! [] #(dataset-store/create-dataset! (store) dataset-id (dbdef)))
          mutations            (filterv mutating? sql)]
      (is (= :created result))
      (testing "the tracking database and table are created first, and only once"
        (is (= "CREATE DATABASE IF NOT EXISTS metabase_dataset_store" (nth mutations 0)))
        (is (str/starts-with? (nth mutations 1)
                              "CREATE TABLE IF NOT EXISTS metabase_dataset_store.PUBLIC.datasets")))
      (testing "the claim is taken with a single MERGE -- Snowflake enforces no uniqueness, so a
                bare INSERT could double-claim"
        (let [merge-sql (nth mutations 2)]
          (is (str/starts-with? merge-sql "MERGE INTO metabase_dataset_store.PUBLIC.datasets"))
          (testing "it steals only a claim whose lease has run out"
            (is (str/includes? merge-sql
                               "WHEN MATCHED AND d.state = 'loading' AND d.claimed_at < DATEADD(second, ?, CURRENT_TIMESTAMP())")))
          (testing "and inserts when the dataset is new"
            (is (str/includes? merge-sql "WHEN NOT MATCHED")))))
      (testing "publishing is guarded by claim ownership, so a stolen lease cannot publish"
        (let [publish (nth mutations 3)]
          (is (str/starts-with? publish "UPDATE metabase_dataset_store.PUBLIC.datasets SET state = 'ready'"))
          (is (str/ends-with? publish "WHERE id = ? AND claim_owner = ?"))))
      (is (= 4 (count mutations)) "no other statement mutates the warehouse"))))

(deftest create-dataset-that-is-already-ready-emits-no-mutation-test
  (testing "a dataset already published is reported without touching the warehouse again"
    (let [{:keys [result sql]} (record-sql! [{:id dataset-id :state "ready"}]
                                            #(dataset-store/create-dataset! (store) dataset-id (dbdef)))]
      (is (= :exists result))
      (is (= ["CREATE DATABASE IF NOT EXISTS metabase_dataset_store"]
             (remove #(str/starts-with? % "CREATE TABLE") (filterv mutating? sql)))
          "only the one-time tracking setup mutates anything"))))

(deftest delete-dataset-claims-before-dropping-test
  (testing "deleting takes the claim first, so nothing can create the dataset mid-drop"
    (let [{:keys [result sql]} (record-sql! [{:id dataset-id :state "ready"}]
                                            #(dataset-store/delete-dataset! (store) dataset-id))
          mutations            (filterv mutating? sql)
          after-setup          (drop 2 mutations)]
      (is (= :deleted result))
      (testing "claim, then drop, then forget -- in that order"
        (is (str/starts-with? (nth after-setup 0) "MERGE INTO metabase_dataset_store.PUBLIC.datasets"))
        (is (str/includes? (nth after-setup 0) "WHEN MATCHED AND (d.state = 'ready' OR"))
        (is (= (format "DROP DATABASE IF EXISTS \"%s\"" dataset-id) (nth after-setup 1)))
        (is (= "DELETE FROM metabase_dataset_store.PUBLIC.datasets WHERE id = ? AND claim_owner = ?"
               (nth after-setup 2))))
      (is (= 3 (count after-setup))))))
