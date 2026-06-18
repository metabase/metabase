(ns metabase.app-db.mysql-cascade-testcontainer-test
  "Self-contained reproduction of the MySQL 9.7 multi-level `ON DELETE CASCADE` regression, using
  throwaway Testcontainers MySQL containers and raw SQL only — no Metabase app DB, schema, or models.

  See `mysql97-cascade-minimal-repro.md` for the full analysis. Two facts demonstrated here:

  1. `mysql-97-cascade-engine-test` — on 9.7's SQL-layer FK executor
     (`@@innodb_native_foreign_keys=0`, the default) a multi-level cascade orphans grandchildren of all
     but one parent; the InnoDB native executor (`--innodb-native-foreign-keys=ON`) cascades correctly.

  2. `mysql-96-vs-97-cascade-regression-test` — the SAME minimal schema cascades correctly on 9.6.0 but
     not on 9.7.0. 9.6 already runs the SQL-layer FK path, so this isolates the regression to 9.7's
     cascade-executor rewrite (WL#17024), not merely \"SQL-layer vs InnoDB-native\".

  Minimal trigger (4 tables, 5 rows): a single-row DELETE whose cascade reaches >=2 sibling rows, each
  of which cascades to a target row, where the target has a further FK whose ON DELETE action performs
  a nested write (CASCADE or SET NULL). The executor then completes the nested cascade for only one
  sibling and silently orphans the rest.

  Starts Docker containers and pulls `mysql:9.6`/`mysql:9.7`, so it is skipped unless Docker is
  available. Run locally with:

    ./bin/test-agent :only '[metabase.app-db.mysql-cascade-testcontainer-test]'"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection DriverManager SQLException)
   (org.testcontainers DockerClientFactory)
   (org.testcontainers.containers GenericContainer)
   (org.testcontainers.containers.wait.strategy Wait)
   (org.testcontainers.utility DockerImageName)))

(set! *warn-on-reflection* true)

(def ^:private mysql-port 3306)

;; --- Schema A: 6-table Metabase analog (db -> tbl -> field, card child of db+tbl, dimension/sandbox
;; one cascade level below field/card). Exercises both the field and card orphaning. --------------
(def ^:private full-statements
  ["CREATE DATABASE fk_probe"
   "USE fk_probe"
   "CREATE TABLE db    (id INT PRIMARY KEY) ENGINE=InnoDB"
   "CREATE TABLE tbl   (id INT PRIMARY KEY, db_id INT,
      CONSTRAINT fk_tbl_db    FOREIGN KEY (db_id)  REFERENCES db(id)    ON DELETE CASCADE) ENGINE=InnoDB"
   "CREATE TABLE field (id INT PRIMARY KEY, tbl_id INT,
      CONSTRAINT fk_field_tbl FOREIGN KEY (tbl_id) REFERENCES tbl(id)   ON DELETE CASCADE) ENGINE=InnoDB"
   "CREATE TABLE card  (id INT PRIMARY KEY, db_id INT, tbl_id INT,
      CONSTRAINT fk_card_db   FOREIGN KEY (db_id)  REFERENCES db(id)    ON DELETE CASCADE,
      CONSTRAINT fk_card_tbl  FOREIGN KEY (tbl_id) REFERENCES tbl(id)   ON DELETE CASCADE) ENGINE=InnoDB"
   "CREATE TABLE dimension (id INT PRIMARY KEY, field_id INT,
      CONSTRAINT fk_dim_field FOREIGN KEY (field_id) REFERENCES field(id) ON DELETE CASCADE) ENGINE=InnoDB"
   "CREATE TABLE sandbox   (id INT PRIMARY KEY, card_id INT,
      CONSTRAINT fk_sb_card   FOREIGN KEY (card_id)  REFERENCES card(id)  ON DELETE CASCADE) ENGINE=InnoDB"
   "INSERT INTO db VALUES (1)"
   "INSERT INTO tbl (id,db_id)
      WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n<8)  SELECT n,1 FROM s"
   "INSERT INTO field (id,tbl_id)
      WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n<56) SELECT n,((n-1) DIV 7)+1 FROM s"
   "INSERT INTO card (id,db_id,tbl_id)
      WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n<39) SELECT n,1,((n-1)%8)+1 FROM s"])

(def ^:private full-delete "DELETE FROM db WHERE id = 1")
(def ^:private full-tables ["tbl" "field" "card"])

;; --- Schema B: 4-table / 5-row minimal. r(1) -> m(2) -> tg(2, one per m) -> dp(0). Deleting r should
;; delete both tg rows; on 9.7 SQL-layer one survives. dp is empty — only the constraint matters, and it
;; must be a write action (CASCADE here) to trigger the bug. -------------------------------------------
(def ^:private minimal-statements
  ["CREATE DATABASE fk_probe"
   "USE fk_probe"
   "CREATE TABLE r  (id INT PRIMARY KEY) ENGINE=InnoDB"
   "CREATE TABLE m  (id INT PRIMARY KEY, r_id INT,
      CONSTRAINT fk_m FOREIGN KEY (r_id) REFERENCES r(id)  ON DELETE CASCADE) ENGINE=InnoDB"
   "CREATE TABLE tg (id INT PRIMARY KEY, m_id INT,
      CONSTRAINT fk_t FOREIGN KEY (m_id) REFERENCES m(id)  ON DELETE CASCADE) ENGINE=InnoDB"
   "CREATE TABLE dp (id INT PRIMARY KEY, t_id INT,
      CONSTRAINT fk_d FOREIGN KEY (t_id) REFERENCES tg(id) ON DELETE CASCADE) ENGINE=InnoDB"
   "INSERT INTO r VALUES (1)"
   "INSERT INTO m  (id,r_id) VALUES (1,1),(2,1)"
   "INSERT INTO tg (id,m_id) VALUES (1,1),(2,2)"])

(def ^:private minimal-delete "DELETE FROM r WHERE id = 1")
(def ^:private minimal-tables ["tg"])

(defn- docker-available? []
  (try
    (.isDockerAvailable (DockerClientFactory/instance))
    (catch Throwable _ false)))

(defn- enabled? []
  (docker-available?))

(defn- mysql-container ^GenericContainer [image opts]
  (let [c (doto (GenericContainer. (DockerImageName/parse ^String image))
            (.withExposedPorts (into-array Integer [(int mysql-port)]))
            (.withEnv "MYSQL_ALLOW_EMPTY_PASSWORD" "yes")
            (.waitingFor (Wait/forListeningPort)))]
    (when (seq opts)
      (.withCommand c (into-array String opts)))
    c))

(defn- connect ^Connection [^GenericContainer c]
  (Class/forName "org.mariadb.jdbc.Driver")
  (let [url (format "jdbc:mariadb://%s:%d/?user=root" (.getHost c) (.getMappedPort c (int mysql-port)))]
    ;; forListeningPort gets us a live socket; retry briefly in case mysqld is still finishing init.
    (loop [tries 30]
      (or (try (DriverManager/getConnection url)
               (catch SQLException e
                 (when (zero? tries) (throw e))
                 nil))
          (do (Thread/sleep 1000) (recur (dec tries)))))))

(defn- table-counts [^Connection conn tables]
  (into {} (for [t tables]
             [(keyword t) (-> (jdbc/query {:connection conn} [(str "SELECT COUNT(*) AS c FROM " t)])
                              first :c long)])))

(defn- with-mysql-container
  [{:keys [image opts]} f]
  (let [container (mysql-container image opts)]
    (try
      (.start container)
      (with-open [conn (connect container)]
        (f {:conn conn}))
      (finally
        (.stop container)))))

(deftest mysql-97-cascade-engine-test
  (if-not (enabled?)
    (log/info "Skipping mysql-97-cascade-engine-test (Docker not available)")
    (let [full-case (fn [{:keys [conn]}]
                      (doseq [stmt full-statements]
                        (jdbc/execute! {:connection conn} [stmt]))
                      (jdbc/execute! {:connection conn} [full-delete])
                      (table-counts conn full-tables))]
      (testing "9.7 SQL-layer FK executor (default) — BUGGY: orphans grandchildren of all but one parent"
        (is (= {:tbl 0 :field 49 :card 34} (with-mysql-container
                                             {:image "mysql:9.7"}
                                             full-case))
            "tables fully cascade, but 49/56 fields and 34/39 cards are silently orphaned"))
      (testing "9.7 InnoDB native FK engine (--innodb-native-foreign-keys=ON) — CORRECT: full cascade"
        (is (= {:tbl 0 :field 0 :card 0} (with-mysql-container
                                           {:image "mysql:9.7" :opts ["--innodb-native-foreign-keys=ON"]}
                                           full-case))
            "everything cascades, no orphans")))))

(deftest mysql-96-vs-97-cascade-regression-test
  (if-not (enabled?)
    (log/info "Skipping mysql-96-vs-97-cascade-regression-test (Docker not available)")
    (let [minimal-case (fn [{:keys [conn]}]
                         (doseq [stmt minimal-statements]
                           (jdbc/execute! {:connection conn} [stmt]))
                         (jdbc/execute! {:connection conn} [minimal-delete])
                         (table-counts conn minimal-tables))]
      (testing "9.6.0 — minimal cascade is COMPLETE (no regression; 9.6 already runs the SQL-layer FK path)"
        (is (= {:tg 0} (with-mysql-container
                         {:image "mysql:9.6"}
                         minimal-case))
            "both target rows deleted"))
      (testing "9.7.0 — same schema, cascade is INCOMPLETE (regression: 1 of 2 target rows orphaned)"
        (is (= {:tg 1} (with-mysql-container
                         {:image "mysql:9.7"}
                         minimal-case))
            "one target row silently survives the cascade on 9.7's SQL-layer executor")))))
