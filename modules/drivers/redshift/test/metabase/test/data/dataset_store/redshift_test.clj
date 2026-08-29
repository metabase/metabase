(ns metabase.test.data.dataset-store.redshift-test
  "Executable documentation for the Redshift [[metabase.test.data.dataset-store/DatasetStore]].

  Every call the store makes to the cluster is intercepted at `clojure.java.jdbc`, so these tests
  record the exact SQL a happy path emits and assert on it. They demonstrate behaviour rather than
  prove correctness: nothing here checks that Redshift would accept these statements or serialize
  them as the store assumes, only that this is what it sends and in what order."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test.data.dataset-store :as dataset-store]
   [metabase.test.data.dataset-store.redshift :as dsr]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.redshift :as redshift.tx]))

(set! *warn-on-reflection* true)

(def ^:private dataset-id "mbds_deadbeef_test_data")

(defn- dbdef []
  (tx/map->DatabaseDefinition {:database-name dataset-id :table-definitions [] :options {}}))

(defn- collapse [sql]
  (str/trim (str/replace sql #"\s+" " ")))

(defn- mutating? [sql]
  (re-find #"(?i)^(CREATE|DROP|INSERT|UPDATE|DELETE|MERGE)" sql))

(defn- record-sql!
  "Run `f` with every JDBC call captured. `query-fn` answers each read by SQL; `exec-fn` gives each
  write its affected-row count. Returns the store's result alongside every statement sent."
  [{:keys [query-fn exec-fn]} f]
  (let [statements (atom [])
        capture    (fn [sql-params] (swap! statements conj (collapse (first sql-params))))]
    (with-redefs [jdbc/execute!        (fn [_db sql-params & _]
                                         (capture sql-params)
                                         [((or exec-fn (constantly 1)) (collapse (first sql-params)))])
                  jdbc/query           (fn [_db sql-params & _]
                                         (capture sql-params)
                                         ((or query-fn (constantly [])) (collapse (first sql-params))))
                  ;; `with-db-transaction` is a macro; this is the function it expands into. Running
                  ;; the body directly keeps the statements inside it visible below.
                  jdbc/db-transaction* (fn [db f & _] (f db))]
      {:result (f) :sql @statements})))

(defn- store []
  (dsr/redshift-dataset-store {:spec          {:datasource :stubbed}
                               ;; Loading a dataset's tables is the driver's business, not the
                               ;; store's; stubbed so only the store's own SQL shows up.
                               :load-dataset! (fn [& _] nil)}))

(deftest create-dataset-claims-inside-a-transaction-test
  (testing "creating a dataset nobody has claimed"
    (let [{:keys [result sql]}
          (record-sql! {:exec-fn (fn [s] (if (str/starts-with? s "UPDATE metabase_dataset_store") 0 1))}
                       #(dataset-store/create-dataset! (store) dataset-id (dbdef)))
          mutations (filterv mutating? sql)]
      (is (= :created result))
      (testing "tracking schema and table are created first"
        (is (= "CREATE SCHEMA IF NOT EXISTS \"metabase_dataset_store\"" (nth mutations 0)))
        (is (str/starts-with? (nth mutations 1)
                              "CREATE TABLE IF NOT EXISTS \"metabase_dataset_store\".datasets")))
      (testing "the claim is an expiry-guarded UPDATE followed by a NOT EXISTS INSERT, both inside
                one serializable transaction -- Redshift has no upsert and enforces no uniqueness"
        (is (str/includes? (nth mutations 2) "SET claim_owner = ?, claimed_at = GETDATE()"))
        (is (str/includes? (nth mutations 2) "claimed_at < DATEADD(second, ?, GETDATE())"))
        (is (str/includes? (nth mutations 3) "WHERE NOT EXISTS")))
      (testing "the dataset's tables live in one shared schema, told apart by their hashed names"
        (is (= "CREATE SCHEMA IF NOT EXISTS \"metabase_datasets\"" (nth mutations 4))))
      (testing "publishing is guarded by claim ownership"
        (is (str/starts-with? (nth mutations 5) "UPDATE \"metabase_dataset_store\".datasets SET state = 'ready'"))
        (is (str/ends-with? (nth mutations 5) "WHERE id = ? AND claim_owner = ?")))
      (is (= 6 (count mutations))))))

(deftest delete-dataset-drops-only-its-own-tables-test
  (testing "deleting drops this dataset's tables, never the shared schema"
    (let [{:keys [result sql]}
          (record-sql! {:query-fn (fn [s]
                                    (if (str/includes? s "information_schema.tables")
                                      [{:table_name (str dataset-id "_venues")}
                                       {:table_name (str dataset-id "_checkins")}]
                                      [{:id dataset-id :state "ready"}]))}
                       #(dataset-store/delete-dataset! (store) dataset-id))
          after-setup (drop 2 (filterv mutating? sql))]
      (is (= :deleted result))
      (testing "claim first, so nothing can recreate the dataset mid-drop"
        (is (str/includes? (nth after-setup 0) "SET state = 'loading', claim_owner = ?"))
        (is (str/includes? (nth after-setup 0) "(state = 'ready' OR claimed_at < DATEADD(second, ?, GETDATE()))")))
      (testing "then one DROP TABLE per table belonging to this dataset"
        (is (= (format "DROP TABLE IF EXISTS \"%s\".\"%s_venues\" CASCADE"
                       redshift.tx/dataset-schema dataset-id)
               (nth after-setup 1)))
        (is (= (format "DROP TABLE IF EXISTS \"%s\".\"%s_checkins\" CASCADE"
                       redshift.tx/dataset-schema dataset-id)
               (nth after-setup 2))))
      (testing "and finally the tracking row"
        (is (= "DELETE FROM \"metabase_dataset_store\".datasets WHERE id = ? AND claim_owner = ?"
               (nth after-setup 3))))
      (is (= 4 (count after-setup))))))
