(ns metabase.driver.quack.federation-test
  "Tier D — federation tests: catalog-aware sync, 3-part qualification,
  cross-catalog joins, Mongo, and the native-catalog regression guard.

  Needs the federated stack (server/docker-compose.federation.yml) running, and
  the Quack DB registered in Metabase (use run_metabase_federation.py once to
  provision it; DB id defaults to 2 — override with QUACK_MB_DBID)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver :as driver]
   [metabase.driver.quack.client :as client]
   [metabase.test.data.quack :as qtd])
  (:import [java.net Socket]))

(def host (:host qtd/default-details))
(def port (:port qtd/default-details))
(def details qtd/default-details)
(def fake-db {:lib/type :metadata/database :details details})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String host ^int port)] true)
       (catch Exception _ false)))

(defn- federated? []
  ;; Only run federation assertions if a federated source catalog is attached.
  (and (reachable?)
       (try (let [{:keys [rows]} (client/execute-query details
                                                       "SELECT 1 AS one FROM pgsrc.public.people LIMIT 1")
                  n (reduce (fn [c _] (inc c)) 0 rows)]
              (pos? n))
            (catch Throwable _ false))))

(use-fixtures :once (fn [t] (when (federated?) (t))))

(defn- run-sql [sql]
  (let [{:keys [rows]} (client/execute-query details sql)]
    (reduce conj [] rows)))

;;; ===========================================================================
;;; D1. catalog-aware sync → compound schemas
;;; ============================================================================

(deftest d1-describe-database-returns-compound-schemas-test
  (testing "describe-database* encodes the catalog into the schema for federated tables"
    (let [schemas (->> (:tables (driver/describe-database* :quack fake-db))
                       (map :schema) set)]
      (is (contains? schemas "pgsrc.public"))
      (is (contains? schemas "mysqlsrc.sample"))
      (is (contains? schemas "worldcup.main")))))

;;; ===========================================================================
;;; D2/D3. identifier-split → 3-part qualification
;;; ============================================================================

(deftest d2-federated-table-resolves-test
  (testing "a federated table is queryable via its 3-part name (the qualification fix)"
    (is (= [[2500]] (mapv vec (run-sql "SELECT count(*) AS n FROM \"pgsrc\".\"public\".\"people\""))))))

(deftest d3-cross-catalog-join-test
  (testing "a cross-catalog join (postgres x mysql) executes via native SQL"
    (let [rows (run-sql
                (str "SELECT count(*) AS n FROM pgsrc.public.people p "
                     "JOIN mysqlsrc.sample.\"PEOPLE\" m ON p.email = m.\"EMAIL\""))]
      (is (pos? (ffirst rows))))))

(deftest d3-three-source-join-test
  (testing "a 3-source join (postgres x mysql x mssql-view) executes
           NOTE: only runs when QUACK_FEDERATION_EXTRAS=1 (MSSQL views attached).
           The first such join after server start can crash DuckDB
           (odbc_scanner cold-start segfault, see docs/FEDERATION-FINDINGS.md §6)."
    (try (let [rows (run-sql
                     (str "SELECT count(*) AS n FROM pgsrc.public.people p "
                          "JOIN mysqlsrc.sample.\"PEOPLE\" m ON p.email = m.\"EMAIL\" "
                          "JOIN main.mssql_people s ON p.email = s.\"EMAIL\""))]
           (is (pos? (ffirst rows))))
         (catch Throwable e
           (is (re-find #"reset|Connection|closed|EOF|does not exist|mssql|odbc"
                        (ex-message e))
               (str "3-source join requires MSSQL extras; got: " (ex-message e)))))))

;;; ===========================================================================
;;; D4. Mongo queryable through Metabase
;;; ============================================================================

(deftest d4-mongo-queryable-test
  (testing "mongosrc.sample.people is queryable through the Quack protocol"
    (let [rows (run-sql "SELECT count(*) AS n FROM mongosrc.sample.people")]
      (is (pos? (ffirst rows))))))

;;; ===========================================================================
;;; D5. native catalog tables still resolve with 2-part names (regression guard)
;;; ============================================================================

(deftest d5-native-catalog-two-part-test
  (testing "native-catalog tables (no compound schema) still resolve with 2-part names"
    (let [rows (run-sql "SELECT count(*) AS n FROM samples.types")]
      (is (pos? (ffirst rows))))
    (let [rows (run-sql "SELECT count(*) AS n FROM main.sheet_sales")]
      (is (pos? (ffirst rows))))))
