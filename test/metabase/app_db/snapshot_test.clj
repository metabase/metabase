(ns metabase.app-db.snapshot-test
  "Guards the checked-in app DB snapshots against drift.

  A snapshot stands in for every changeset up to its boundary, so it is only safe while loading it and migrating the
  rest produces the same DB as migrating the whole changelog from scratch. That is what these tests check, and it is
  what breaks if someone edits a changeset at or below the boundary without regenerating the snapshot.

  A full replay of the changelog is slow, so the comparison is off unless `MB_APP_DB_SNAPSHOT_DRIFT_TEST=true`; the
  `app-db-snapshot` CI workflow sets it. Everything else about the snapshot is cheap enough to check every run."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- drift-test-enabled? []
  (= "true" (config/config-str :mb-app-db-snapshot-drift-test)))

;;; ----------------------------------------------- DB fingerprinting -----------------------------------------------
;;;
;;; Everything below reads through `DatabaseMetaData` rather than dialect SQL, so one implementation covers H2,
;;; Postgres and MySQL.

(def ^:private changelog-tables
  #{"DATABASECHANGELOG" "DATABASECHANGELOGLOCK"})

(defn- changelog-table? [table-name]
  (contains? changelog-tables (u/upper-case-en table-name)))

(defn- table-names
  "Table names exactly as the DB reports them. Not case-folded: the two DBs being compared are always the same DB
  type, and MySQL on a case-sensitive filesystem will not answer to a name in the wrong case."
  [^java.sql.Connection conn db-type]
  (into (sorted-set)
        (map :table_name)
        (snapshot/user-tables conn db-type)))

(defn- schema-of
  "JDBC metadata calls need H2's schema named explicitly; Postgres and MySQL find it from the connection."
  [db-type]
  (when (= db-type :h2) "PUBLIC"))

(defn- column-default
  "The column's default, with \"no default\" and an explicit `DEFAULT NULL` treated as the same thing.

  A dump writes `DEFAULT NULL` where the original DDL simply omitted the default, and MariaDB reports the two
  differently -- the string \"NULL\" versus no value at all. For a nullable column they mean the same thing, and a
  NOT NULL column cannot have `DEFAULT NULL`, so collapsing them cannot hide a real difference."
  [col]
  (let [default (some-> (:column_def col) str/trim)]
    (when-not (= default "NULL")
      default)))

(defn- columns [^java.sql.Connection conn db-type table]
  (with-open [rs (.getColumns (.getMetaData conn) nil (schema-of db-type) table "%")]
    (into (sorted-map)
          (map (fn [col]
                 [(u/upper-case-en (:column_name col))
                  ;; `ordinal_position` is deliberately excluded: a table rebuilt by a later changeset can end up with
                  ;; the same columns in a different physical order, which is not drift.
                  {:type-name  (u/upper-case-en (str (:type_name col)))
                   :size       (:column_size col)
                   :decimals   (:decimal_digits col)
                   :nullable   (:is_nullable col)
                   :default    (column-default col)}]))
          (jdbc/result-set-seq rs))))

(defn- primary-keys [^java.sql.Connection conn db-type table]
  (with-open [rs (.getPrimaryKeys (.getMetaData conn) nil (schema-of db-type) table)]
    (into (sorted-set)
          (map (comp u/upper-case-en :column_name))
          (jdbc/result-set-seq rs))))

(defn- indexes
  "Which column tuples the table has an index on, and which of those are unique.

  Deliberately *coverage* rather than a list of indexes. Index names are auto-generated and differ run to run, and a
  restored dump can legitimately end up with one index fewer: when a column already carries a unique index, H2 will
  not add a redundant non-unique one alongside it. Neither is drift. Losing an index on a column, or losing its
  uniqueness, still is."
  [^java.sql.Connection conn db-type table]
  (with-open [rs (.getIndexInfo (.getMetaData conn) nil (schema-of db-type) table false false)]
    (let [by-name (->> (jdbc/result-set-seq rs)
                       (filter :column_name)
                       (group-by :index_name))
          columns-of (fn [rows]
                       (mapv (comp u/upper-case-en str :column_name)
                             (sort-by :ordinal_position rows)))]
      {:indexed (into #{} (map columns-of) (vals by-name))
       :unique  (into #{}
                      (comp (remove (fn [[_ rows]] (:non_unique (first rows))))
                            (map (comp columns-of val)))
                      by-name)})))

(defn- foreign-keys [^java.sql.Connection conn db-type table]
  (with-open [rs (.getImportedKeys (.getMetaData conn) nil (schema-of db-type) table)]
    (into #{}
          (map (fn [fk]
                 {:fk-column  (u/upper-case-en (str (:fkcolumn_name fk)))
                  :pk-table   (u/upper-case-en (str (:pktable_name fk)))
                  :pk-column  (u/upper-case-en (str (:pkcolumn_name fk)))
                  :delete-rule (:delete_rule fk)
                  :update-rule (:update_rule fk)}))
          (jdbc/result-set-seq rs))))

(defn- schema-fingerprint
  "Structure of every table in the DB, in a form two DBs can be diffed on."
  [^java.sql.Connection conn db-type]
  (into (sorted-map)
        (for [table (table-names conn db-type)
              :when (not (changelog-table? table))]
          [table {:columns      (columns conn db-type table)
                  :primary-keys (primary-keys conn db-type table)
                  :indexes      (indexes conn db-type table)
                  :foreign-keys (foreign-keys conn db-type table)}])))

(defn- changelog-fingerprint
  "Which changesets the DB believes it has run, and their checksums. `dateexecuted`, `orderexecuted`, `deployment_id`
  and the recorded Liquibase version legitimately differ between a replay and a snapshot load, so they are left out."
  [^java.sql.Connection conn]
  (into (sorted-map)
        (map (fn [row]
               [(:id row) (select-keys row [:author :filename :md5sum :exectype])]))
        (jdbc/query {:connection conn} ["SELECT id, author, filename, md5sum, exectype FROM DATABASECHANGELOG"])))

(def ^:private generated-columns
  "Columns migrations fill with freshly generated values — NanoIDs, password hashes, salts. Two runs never agree on
  them, so they are dropped before rows are compared. If a migration starts seeding randomness into some other column
  this test will fail on that column; add it here."
  #{"ENTITY_ID" "PASSWORD" "PASSWORD_SALT" "RESET_TOKEN" "CREDENTIALS"})

(defn- unstable-columns
  "Columns of `table` whose values two separate migration runs cannot be expected to share: wall-clock times, and the
  generated values listed in [[generated-columns]]."
  [^java.sql.Connection conn db-type table]
  (into generated-columns
        (keep (fn [[col-name {:keys [type-name]}]]
                (when (re-find #"(?i)^(TIMESTAMP|DATETIME|DATE|TIME)" type-name)
                  col-name)))
        (columns conn db-type table)))

(defn- data-fingerprint
  "The rows migrations seeded, keyed by table. Columns named by [[unstable-columns]] are dropped; everything else must
  match exactly, including how many times each row shape occurs."
  [^java.sql.Connection conn db-type]
  (into (sorted-map)
        (for [table (table-names conn db-type)
              :when (not (changelog-table? table))
              :let  [skip (unstable-columns conn db-type table)
                     rows (jdbc/query {:connection conn} [(format "SELECT * FROM %s" table)])]
              ;; a table with no seeded rows tells us nothing, and there are a lot of them
              :when (seq rows)]
          [table (frequencies
                  (map (fn [row]
                         (into (sorted-map)
                               (remove (fn [[k _]] (contains? skip (u/upper-case-en (name k)))))
                               row))
                       rows))])))

(defn- fingerprint [^java.sql.Connection conn db-type]
  {:schema    (schema-fingerprint conn db-type)
   :changelog (changelog-fingerprint conn)
   :data      (data-fingerprint conn db-type)})

(defn- timed
  "Run `thunk` and return how many milliseconds it took."
  [thunk]
  (let [start (System/nanoTime)]
    (thunk)
    (quot (- (System/nanoTime) start) 1000000)))

(defn- log-timings!
  "Report what the snapshot buys on this machine: the cost of reaching a fully-migrated app DB by replaying the whole
  changelog, against the cost of loading the snapshot and replaying only what comes after it. Fingerprinting is
  outside both measurements, so these are migration cost alone.

  This is the same work [[metabase.test.initialize.db/init!]] does once per test JVM, so the difference is what every
  backend job saves at startup.

  Printed rather than logged: the test log config sends INFO to a file, and this needs to be readable in CI output."
  [db-type full-ms snapshot-ms]
  (let [saved (- full-ms snapshot-ms)]
    (println (format (str "app DB snapshot timing [%s]: full changelog %dms, snapshot %s + later changesets %dms "
                          "-- saves %dms (%.1fx)")
                     (name db-type)
                     full-ms
                     snapshot/snapshot-version
                     snapshot-ms
                     saved
                     (if (pos? snapshot-ms)
                       (double (/ full-ms snapshot-ms))
                       ##Inf)))
    (flush)))

;;; --------------------------------------------------- the tests ---------------------------------------------------

(deftest snapshot-loads-cleanly-test
  (testing "the checked-in snapshot loads into an empty app DB and leaves the changelog where its metadata says"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (let [driver driver/*driver*]
        (impl/with-temp-empty-app-db [conn driver]
          (if-not (snapshot/loadable? conn driver)
            (log/warnf "No app DB snapshot checked in for %s; skipping" (snapshot/flavor conn driver))
            (do
              (snapshot/load-snapshot! conn driver)
              (let [ids      (snapshot/changeset-ids conn)
                    expected (inc (.indexOf ^java.util.List ids (snapshot/through-changeset-id)))
                    loaded   (set (keys (changelog-fingerprint conn)))]
                (is (pos? expected)
                    "the snapshot's boundary changeset should still exist in the changelog")
                (is (= expected (count loaded))
                    "the snapshot should record exactly the changesets up to and including its boundary")
                (is (= (set (take expected ids)) loaded)
                    "the snapshot should record the *first* N changesets, with no gaps")))))))))

(deftest snapshot-matches-full-migration-test
  (testing "loading the snapshot and migrating the rest produces the same DB as migrating everything from scratch"
    (if-not (drift-test-enabled?)
      (log/warn "MB_APP_DB_SNAPSHOT_DRIFT_TEST is not set; skipping app DB snapshot drift comparison")
      (mt/test-drivers #{:h2 :mysql :postgres}
        (let [driver      driver/*driver*
              through     (snapshot/through-changeset-id)
              full-ms     (volatile! nil)
              snapshot-ms (volatile! nil)
              flavor      (volatile! driver)
              ;; snapshot side first, so a dialect with no snapshot checked in costs nothing to skip
              from-snapshot (impl/with-temp-empty-app-db [conn driver]
                              (vreset! flavor (snapshot/flavor conn driver))
                              (when (snapshot/loadable? conn driver)
                                (vreset! snapshot-ms
                                         (timed (fn []
                                                  (snapshot/load-snapshot! conn driver)
                                                  (impl/run-migrations-in-range!
                                                   conn [through nil] {:inclusive-start? false}))))
                                (fingerprint conn driver)))]
          (if-not from-snapshot
            (log/warnf "No app DB snapshot checked in for %s; skipping parity comparison" @flavor)
            (let [from-scratch (impl/with-temp-empty-app-db [conn driver]
                                 (vreset! full-ms
                                          (timed #(impl/run-migrations-in-range! conn ["v00.00-000" nil])))
                                 (fingerprint conn driver))]
              (log-timings! @flavor @full-ms @snapshot-ms)
              (testing "same tables"
                (is (= (set (keys (:schema from-scratch)))
                       (set (keys (:schema from-snapshot))))))
              (doseq [table (sort (set/intersection (set (keys (:schema from-scratch)))
                                                    (set (keys (:schema from-snapshot)))))]
                (testing (format "%s structure" table)
                  (is (= (get-in from-scratch [:schema table])
                         (get-in from-snapshot [:schema table])))))
              (testing "same changesets recorded as run"
                (is (= (:changelog from-scratch)
                       (:changelog from-snapshot))))
              (testing "same seeded rows"
                (is (= (:data from-scratch)
                       (:data from-snapshot)))))))))))
