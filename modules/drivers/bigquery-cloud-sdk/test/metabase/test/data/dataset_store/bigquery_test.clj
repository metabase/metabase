(ns metabase.test.data.dataset-store.bigquery-test
  "Executable documentation for the BigQuery [[metabase.test.data.dataset-store/DatasetStore]].

  Every statement the store sends is intercepted at the BigQuery test helpers, so these tests record
  the SQL a happy path emits and assert on it. They demonstrate behaviour rather than prove
  correctness: nothing here checks that BigQuery would accept these statements or serialize them as
  the store assumes."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test.data.bigquery-cloud-sdk :as bq.tx]
   [metabase.test.data.dataset-store :as dataset-store]
   [metabase.test.data.dataset-store.bigquery :as dsb]
   [metabase.test.data.interface :as tx]))

(set! *warn-on-reflection* true)

(def ^:private dataset-id "mbds_deadbeef_test_data")

(defn- dbdef []
  (tx/map->DatabaseDefinition {:database-name dataset-id :table-definitions [] :options {}}))

(defn- collapse [sql]
  (str/trim (str/replace sql #"\s+" " ")))

(defn- mutating? [sql]
  (re-find #"(?i)^(CREATE|DROP|INSERT|UPDATE|DELETE|MERGE)" sql))

(defn- record-sql!
  "Run `f` with every BigQuery statement captured.

  The tracking row is modelled just well enough for the store to make progress: a MERGE claims it
  for whoever the statement names, and the ready-marking UPDATE publishes it. That is what lets the
  store's own read-back-after-write checks resolve without reaching into its private state."
  [f]
  (let [statements (atom [])
        row        (atom nil)
        remember   (fn [sql] (swap! statements conj (collapse sql)))]
    (with-redefs [bq.tx/project-id      (constantly "proj")
                  bq.tx/execute!        (fn [fmt & args] (remember (apply format fmt args)) [])
                  bq.tx/execute-params! (fn [sql params]
                                          (let [sql (collapse sql)]
                                            (remember sql)
                                            (cond
                                              (str/starts-with? sql "MERGE")
                                              (do (reset! row {:state "loading" :owner (second params)}) [])

                                              (str/includes? sql "SET state = 'ready'")
                                              (do (when (= (second params) (:owner @row))
                                                    (swap! row assoc :state "ready"))
                                                  [])

                                              (str/starts-with? sql "SELECT")
                                              (if-let [{:keys [state owner]} @row]
                                                [[state owner nil nil]]
                                                [])

                                              :else [])))
                  ;; Loading a dataset's tables is the driver's business, not the store's.
                  tx/create-db!         (fn [& _] nil)]
      {:result (f) :sql @statements})))

(deftest create-dataset-claims-then-publishes-test
  (testing "creating a dataset nobody has claimed"
    (let [{:keys [result sql]} (record-sql! #(dataset-store/create-dataset!
                                              (dsb/bigquery-dataset-store) dataset-id (dbdef)))
          mutations            (filterv mutating? sql)]
      (is (= :created result))
      (testing "the tracking dataset and table are created first"
        (is (= "CREATE SCHEMA IF NOT EXISTS `proj.metabase_dataset_store`" (nth mutations 0)))
        (is (str/starts-with? (nth mutations 1)
                              "CREATE TABLE IF NOT EXISTS `proj.metabase_dataset_store.datasets`")))
      (testing "the claim is one MERGE, stealing only a lease that has run out"
        (let [merge-sql (nth mutations 2)]
          (is (str/starts-with? merge-sql "MERGE INTO `proj.metabase_dataset_store.datasets`"))
          (is (str/includes? merge-sql "d.state = 'loading' AND d.claimed_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 300 SECOND)"))
          (is (str/includes? merge-sql "WHEN NOT MATCHED"))))
      (testing "the dataset is emptied and recreated, in case a dead loader left it behind"
        (is (= (format "DROP SCHEMA IF EXISTS `proj.%s` CASCADE" dataset-id) (nth mutations 3)))
        (is (= (format "CREATE SCHEMA IF NOT EXISTS `proj.%s`" dataset-id) (nth mutations 4))))
      (testing "publishing is guarded by claim ownership"
        (is (str/starts-with? (nth mutations 5) "UPDATE `proj.metabase_dataset_store.datasets` SET state = 'ready'"))
        (is (str/ends-with? (nth mutations 5) "WHERE id = ? AND claim_owner = ?")))
      (is (= 6 (count mutations))))))

(deftest temp-dataset-asks-bigquery-to-expire-its-tables-test
  (testing "BigQuery can expire a dataset's tables on its own, so a temp dataset says so up front"
    (let [{:keys [result sql]} (record-sql! #(dataset-store/create-temp-isolated-dataset!
                                              (dsb/bigquery-dataset-store) (dbdef)))
          create-schema        (->> sql
                                    (filter #(str/starts-with? % "CREATE SCHEMA IF NOT EXISTS `proj.mbds_isolate_"))
                                    first)]
      (is (str/starts-with? result dataset-store/temp-id-prefix))
      (is (some? create-schema) "the temp dataset is created")
      (is (str/includes? create-schema "OPTIONS(default_table_expiration_days=0.0833)")
          "two hours, as a backstop under with-temp-dataset rather than a replacement for it"))))

(deftest delete-dataset-claims-before-dropping-test
  (testing "deleting takes the claim first, so nothing can create the dataset mid-drop"
    (let [{:keys [result sql]} (record-sql!
                                (fn []
                                  (let [store (dsb/bigquery-dataset-store)]
                                    ;; put a published row in place for delete to find
                                    (dataset-store/create-dataset! store dataset-id (dbdef))
                                    (dataset-store/delete-dataset! store dataset-id))))
          mutations            (filterv mutating? sql)
          after-create         (drop 6 mutations)]
      (is (= :deleted result))
      (is (str/starts-with? (nth after-create 0) "MERGE INTO `proj.metabase_dataset_store.datasets`"))
      (is (str/includes? (nth after-create 0) "d.state = 'ready' OR"))
      (is (= (format "DROP SCHEMA IF EXISTS `proj.%s` CASCADE" dataset-id) (nth after-create 1)))
      (is (= "DELETE FROM `proj.metabase_dataset_store.datasets` WHERE id = ? AND claim_owner = ?"
             (nth after-create 2)))
      (is (= 3 (count after-create))))))
