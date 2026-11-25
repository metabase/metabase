(ns ^:mb/driver-tests metabase.test.data.motherduck-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.motherduck :as tx.motherduck]))

(set! *warn-on-reflection* true)

(def ^:private static-dbdef
  (tx/map->DatabaseDefinition
   {:database-name     "bird-flocks"
    :table-definitions [{:table-name "bird", :field-definitions [], :rows [[1]]}]
    :options           {:static true}}))

(deftest qualified-db-name-test
  (let [qualified-db-name #'tx.motherduck/qualified-db-name]
    (testing "a static dataset gets one shared name, stamped with the date and keyed by its definition"
      (let [shared (qualified-db-name static-dbdef)]
        (is (re-matches #"sha_\d{4}_\d{2}_\d{2}_[0-9a-f]{40}_bird_flocks" shared))
        (is (= shared (qualified-db-name static-dbdef)))
        (is (not= shared (qualified-db-name (assoc-in static-dbdef [:table-definitions 0 :rows] [[2]])))
            "a changed definition gets a different database")))
    (testing "any other dataset gets a private temp_ name"
      (is (re-matches #"temp_.*_bird_flocks" (qualified-db-name (update static-dbdef :options dissoc :static))))
      (is (re-matches #"temp_.*_bird_flocks" (qualified-db-name {:database-name "bird-flocks"}))))
    (testing "a name that is already qualified is kept"
      (is (= "sha_x" (qualified-db-name {:database-name "sha_x"})))
      (is (= "temp_x" (qualified-db-name {:database-name "temp_x", :options {:static true}}))))))

(deftest remember-shared-dataset-tables!-test
  (let [shared (#'tx.motherduck/qualified-db-name static-dbdef)
        tables #'tx.motherduck/shared-dataset-tables]
    (try
      (#'tx.motherduck/remember-shared-dataset-tables! static-dbdef)
      (#'tx.motherduck/remember-shared-dataset-tables! (assoc static-dbdef :database-name "private-flocks"
                                                              :options {}))
      (testing "a static dataset's table names are recorded under its shared database name"
        (is (= #{"bird"} (get @@tables shared))))
      (testing "a private dataset's table names are not recorded"
        (is (not-any? #(str/ends-with? % "private_flocks") (keys @@tables))))
      (finally
        (swap! @tables dissoc shared)))))

(deftest first-sync-tables-test
  (let [shared  "sha_2026_01_01_abc_first_sync_probe"
        tables  #{{:name "bird", :schema "main"} {:name "g_transform_target", :schema "main"}}
        listed  (fn [details status]
                  (mt/with-temp [:model/Database db {:engine              :motherduck
                                                     :details             details
                                                     :initial_sync_status status}]
                    (into #{} (map :name) (#'tx.motherduck/first-sync-tables db tables))))]
    (try
      (swap! @#'tx.motherduck/shared-dataset-tables assoc shared #{"bird"})
      (testing "the first sync of a shared dataset lists only the tables in its definition"
        (is (= #{"bird"} (listed {:dbname shared} "incomplete"))))
      (testing "a later sync of a shared dataset lists every table"
        (is (= #{"bird" "g_transform_target"} (listed {:dbname shared} "complete"))))
      (testing "the first sync of a database that is not a shared dataset lists every table"
        (is (= #{"bird" "g_transform_target"} (listed {:dbname "temp_x"} "incomplete"))))
      (finally
        (swap! @#'tx.motherduck/shared-dataset-tables dissoc shared)))))

(deftest old-shared-database?-test
  (let [old?  #'tx.motherduck/old-shared-database?
        today (t/local-date (t/instant) (t/zone-id "UTC"))
        stamp (fn [date] (str "sha_" (str/replace (str date) "-" "_") "_abc_test_data"))]
    (testing "today's and yesterday's shared datasets may still be in use"
      (is (false? (old? 12 (stamp today))))
      (is (false? (old? 36 (stamp (t/minus today (t/days 1)))))))
    (testing "a shared dataset is old once its day ended more than `hours` ago"
      (is (true? (old? 12 (stamp (t/minus today (t/days 2)))))))
    (testing "names without a date are kept"
      (is (false? (old? 12 "sha_abc_test_data")))
      (is (false? (old? 12 "temp_2020_01_01_00_x"))))))

(deftest drop-registered-databases!-test
  (testing "one failed DROP doesn't stop the rest"
    (let [dropped (atom [])]
      (mt/with-dynamic-fn-redefs [tx.motherduck/drop-database! (fn [_conn db-name]
                                                                 (when (= "b" db-name)
                                                                   (throw (ex-info "internal MotherDuck error" {})))
                                                                 (swap! dropped conj db-name))]
        (is (= ["b"] (#'tx.motherduck/drop-registered-databases! nil ["a" "b" "c"])))
        (is (= ["a" "c"] @dropped))))))

;; Connections attach only their own database, so the orphan sweep and the shared-dataset check must read the account
;; catalog to find databases the server connection doesn't have attached.
(deftest catalog-reads-see-unattached-databases-test
  (mt/test-driver :motherduck
    (let [db-name (#'tx.motherduck/qualified-db-name {:database-name "orphan-sweep-probe"})]
      (try
        (tx/drop-if-exists-and-create-db! :motherduck "orphan-sweep-probe")
        (testing "the server connection doesn't have the new database attached"
          (is (not (#'tx.motherduck/do-with-server-connection
                    (fn [^java.sql.Connection conn]
                      (with-open [stmt (.prepareStatement conn (str "SELECT 1 FROM duckdb_databases() "
                                                                    "WHERE database_name = ?"))]
                        (.setString stmt 1 db-name)
                        (with-open [rset (.executeQuery stmt)]
                          (.next rset))))))))
        (testing "the sweep still lists it"
          (is (some #{db-name}
                    (#'tx.motherduck/do-with-server-connection #'tx.motherduck/test-database-names))))
        (testing "database-exists? still finds it"
          (is (true? (#'tx.motherduck/database-exists? db-name))))
        (finally
          (tx/drop-if-exists-and-create-db! :motherduck "orphan-sweep-probe" :just-drop))))
    (testing "database-exists? is false for a database that isn't there"
      (is (false? (#'tx.motherduck/database-exists? "temp_no_such_database_attach_probe"))))))
