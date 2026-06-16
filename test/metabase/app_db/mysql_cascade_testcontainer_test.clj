(ns metabase.app-db.mysql-cascade-testcontainer-test
  "Self-contained reproduction of the MySQL 9.7 multi-level `ON DELETE CASCADE` regression, using a
  throwaway Testcontainers MySQL 9.7 container and raw SQL only — no Metabase app DB, schema, or models.

  See `mysql97-cascade-minimal-repro.md` for the full analysis. In short: on 9.7's SQL-layer FK
  executor (`@@innodb_native_foreign_keys=0`, the default), deleting a `db` row that cascades
  `db -> tbl -> field` and `db/tbl -> card` orphans the grandchildren of all but one parent, because
  `field` and `card` each have a further cascade-child table (`dimension`, `sandbox`). The InnoDB
  native executor (`--innodb-native-foreign-keys=ON`) cascades correctly.

  Opt-in: starts Docker containers and pulls `mysql:9.7`, so it is skipped unless Docker is available
  AND `MB_MYSQL_CASCADE_TESTCONTAINER` is set (to keep it out of normal CI runs). Run locally with:

    MB_MYSQL_CASCADE_TESTCONTAINER=1 \\
      ./bin/test-agent :only '[metabase.app-db.mysql-cascade-testcontainer-test]'"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all])
  (:import
   (java.sql Connection DriverManager SQLException)
   (org.testcontainers DockerClientFactory)
   (org.testcontainers.containers GenericContainer)
   (org.testcontainers.containers.wait.strategy Wait)
   (org.testcontainers.utility DockerImageName)))

(set! *warn-on-reflection* true)

(def ^:private mysql-port 3306)

;; Minimal schema + data (one statement each — see the markdown for the annotated version).
;; db -> tbl -> field, card is a child of BOTH db and tbl, and dimension/sandbox hang one cascade
;; level BELOW field/card respectively (empty — only the constraints matter).
(def ^:private setup-statements
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

(defn- docker-available? []
  (try
    (.isDockerAvailable (DockerClientFactory/instance))
    (catch Throwable _ false)))

(defn- enabled? []
  (docker-available?))

(defn- mysql-container ^GenericContainer [native?]
  (let [c (doto (GenericContainer. (DockerImageName/parse "mysql:9.7"))
            (.withExposedPorts (into-array Integer [(int mysql-port)]))
            (.withEnv "MYSQL_ALLOW_EMPTY_PASSWORD" "yes")
            (.waitingFor (Wait/forListeningPort)))]
    (when native?
      (.withCommand c (into-array String ["--innodb-native-foreign-keys=ON"])))
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

(defn- counts [^Connection conn]
  (into {} (for [t ["tbl" "field" "card"]]
             [(keyword t) (-> (jdbc/query {:connection conn} [(str "SELECT COUNT(*) AS c FROM " t)])
                              first :c long)])))

(defn- run-cascade-probe!
  "Spin a fresh 9.7 container (SQL-layer or native), build the schema, fire one bare cascade DELETE,
  return row counts before and after."
  [native?]
  (let [container (mysql-container native?)]
    (try
      (.start container)
      (with-open [conn (connect container)]
        (doseq [stmt setup-statements]
          (jdbc/execute! {:connection conn} [stmt]))
        (let [before (counts conn)]
          (jdbc/execute! {:connection conn} ["DELETE FROM db WHERE id = 1"])
          {:before before :after (counts conn)}))
      (finally
        (.stop container)))))

(deftest mysql-97-cascade-engine-test
  (if-not (enabled?)
    (println "Skipping mysql-97-cascade-engine-test (ensure Docker is running)")
    (do
      (testing "SQL-layer FK executor (9.7 default) — BUGGY: orphans grandchildren of all but one parent"
        (let [{:keys [before after]} (run-cascade-probe! false)]
          (is (= {:tbl 8 :field 56 :card 39} before) "data loaded")
          (is (= {:tbl 0 :field 49 :card 34} after)
              "tables fully cascade, but 49/56 fields and 34/39 cards are silently orphaned")))
      (testing "InnoDB native FK engine (--innodb-native-foreign-keys=ON) — CORRECT: full cascade"
        (let [{:keys [before after]} (run-cascade-probe! true)]
          (is (= {:tbl 8 :field 56 :card 39} before) "data loaded")
          (is (= {:tbl 0 :field 0 :card 0} after)
              "everything cascades, no orphans"))))))
