(ns metabase.app-db.snapshot-test
  "Guards the checked-in app DB snapshots against drift.

  A snapshot stands in for every changeset up to its boundary, so it is only safe while loading it and migrating the
  rest produces the same DB as migrating the whole changelog from scratch. That is what these tests check, and it is
  what breaks if someone edits a changeset at or below the boundary without regenerating the snapshot.

  A full replay of the changelog is slow, so the comparison is off unless `MB_APP_DB_SNAPSHOT_DRIFT_TEST=true`; the
  `app-db-snapshot` CI workflow sets it. Everything else about the snapshot is cheap enough to check every run."
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.custom-migrations :as custom-migrations]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.app-db.snapshot-test-util.server :as server]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- drift-test-enabled? []
  (= "true" (config/config-str :mb-app-db-snapshot-drift-test)))

(defn- regeneration-test-enabled? []
  (= "true" (config/config-str :mb-app-db-snapshot-regeneration-test)))

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

(def ^:private ignored-metadata
  "Metadata columns two DBs built by different routes disagree on for reasons that are not drift.

  Everything the driver reports other than these is compared, so a field nobody thought about still gets checked:

  - `table_cat`/`table_schem` and their foreign-key spellings name the database the connection is to, and the two
    being compared are deliberately different throwaway databases
  - index, primary key and foreign key names are left for the DB to generate, so they differ run to run
  - `cardinality` and `pages` are index statistics, not structure
  - `ordinal_position` is a column's physical position, and a table rebuilt by a later changeset can hold the same
    columns in a different order. Where it means position *within an index* it is used for ordering before being
    dropped, so composite index column order is still compared."
  #{:table_cat :table_schem :pktable_cat :pktable_schem :fktable_cat :fktable_schem
    :index_name :index_qualifier :pk_name :fk_name
    :cardinality :pages
    :ordinal_position})

(defn- comparable-row
  "A metadata row with the columns above dropped, and a `DEFAULT NULL` collapsed onto no default at all.

  A dump writes `DEFAULT NULL` where the original DDL simply omitted the default, and MariaDB reports the two
  differently -- the string \"NULL\" versus no value at all. For a nullable column they mean the same thing, and a
  NOT NULL column cannot have `DEFAULT NULL`, so collapsing them cannot hide a real difference."
  [row]
  (cond-> (into (sorted-map) (remove (comp ignored-metadata key)) row)
    (= "NULL" (some-> (:column_def row) str/trim)) (assoc :column_def nil)))

(defn- columns [^java.sql.Connection conn db-type table]
  (with-open [rs (.getColumns (.getMetaData conn) nil (schema-of db-type) table "%")]
    (into (sorted-map)
          (map (juxt (comp u/upper-case-en :column_name) comparable-row))
          (jdbc/result-set-seq rs))))

(defn- primary-keys [^java.sql.Connection conn db-type table]
  (with-open [rs (.getPrimaryKeys (.getMetaData conn) nil (schema-of db-type) table)]
    (into #{}
          (map comparable-row)
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
          (map comparable-row)
          (jdbc/result-set-seq rs))))

(defn- schema-fingerprint
  "Structure of every table in the DB, in a form two DBs can be diffed on."
  [^java.sql.Connection conn db-type]
  (into (sorted-map)
        (for [table-row (snapshot/user-tables conn db-type)
              :let  [table (:table_name table-row)]
              :when (not (changelog-table? table))]
          [table {:table        (comparable-row table-row)
                  :columns      (columns conn db-type table)
                  :primary-keys (primary-keys conn db-type table)
                  :indexes      (indexes conn db-type table)
                  :foreign-keys (foreign-keys conn db-type table)}])))

(def ^:private view-column-ignored-metadata
  "Metadata a view column carries that a restored dump cannot reproduce.

  MySQL fixes an expression column's nullability when the view is created, reading the base tables as they are at
  that moment, and never revisits it: `concat('database_', id)` recorded NOT NULL by the changeset that created
  `v_databases` stays NOT NULL after a later changeset rebuilds `metabase_database`. A snapshot recreates every view
  as it loads, against the finished schema, so it lands on what MySQL would say about that view today -- which is the
  same answer re-running the original `CREATE` would give. Views have no defaults, so `column_def` goes with it."
  #{:nullable :is_nullable :column_def})

(defn- view-fingerprint
  "Each view and the columns it exposes.

  The columns are the point: a view whose body could not be resolved when the snapshot loaded still shows up as a
  view, just with nothing in it, and the instance analytics views are only ever read through the app so nothing else
  here would notice."
  [^java.sql.Connection conn db-type]
  (with-open [rs (.getTables (.getMetaData conn) nil (schema-of db-type) "%" (into-array String ["VIEW"]))]
    (into (sorted-map)
          (map (fn [view]
                 [(u/upper-case-en (:table_name view))
                  (into (sorted-map)
                        (map (fn [[col row]] [col (apply dissoc row view-column-ignored-metadata)]))
                        (columns conn db-type (:table_name view)))]))
          (jdbc/result-set-seq rs))))

(defn- database-attributes
  "Settings that belong to the database itself rather than to anything inside it. No table's DDL carries them, and a
  dump tool only reproduces them when asked, so this is the layer a snapshot most easily loses."
  [^java.sql.Connection conn db-type]
  (case db-type
    :mysql    (first (jdbc/query {:connection conn}
                                 ["SELECT @@character_set_database AS charset, @@collation_database AS collation"]))
    :postgres (first (jdbc/query {:connection conn}
                                 ["SELECT pg_encoding_to_char(encoding) AS encoding, datcollate, datctype
                                   FROM pg_database WHERE datname = current_database()"]))
    :h2       (into (sorted-map)
                    (map (juxt :setting_name :setting_value))
                    (jdbc/query {:connection conn}
                                ["SELECT SETTING_NAME, SETTING_VALUE FROM INFORMATION_SCHEMA.SETTINGS"]))))

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

(def ^:private unstable-id-tables
  "Tables whose auto-generated `id` two migration runs can disagree on.

  Each is seeded by a single `INSERT ... SELECT` over a join carrying no `ORDER BY`, so which row draws which
  sequence value is settled by the plan the server picks. A snapshot is dumped from one server version and loaded
  into another, so the ids it carries are not the ids that server's own replay would have assigned -- Postgres 14
  and 18 disagree about `metabot_permissions`. `transform_job_transform_tag` is seeded the same way and every server
  tried so far happens to agree on it, which is luck rather than a guarantee.

  Only the id is dropped. Nothing references either of these, and the rows themselves are still compared, so a
  seeded row going missing, appearing twice, or changing its `group_id`/`job_id`/`tag_id` still fails."
  #{"METABOT_PERMISSIONS" "TRANSFORM_JOB_TRANSFORM_TAG"})

(defn- unstable-columns
  "Columns of `table` whose values two separate migration runs cannot be expected to share: wall-clock times, the
  generated values listed in [[generated-columns]], and the `id` of an [[unstable-id-tables]] table."
  [^java.sql.Connection conn db-type table]
  (into (cond-> generated-columns
          (unstable-id-tables (u/upper-case-en table)) (conj "ID"))
        (keep (fn [[col-name {:keys [type_name]}]]
                (when (re-find #"(?i)^(TIMESTAMP|DATETIME|DATE|TIME)" (str type_name))
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
   :views     (view-fingerprint conn db-type)
   :database  (database-attributes conn db-type)
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

  `test_config/log4j2-test.xml` gives this namespace a console appender of its own so the line lands in the CI job
  output; everything else logged at INFO during a test run only reaches `logs/test-log.json`."
  [db-type full-ms snapshot-ms]
  (let [saved (- full-ms snapshot-ms)]
    (log/infof (str "app DB snapshot timing [%s]: full changelog %dms, snapshot %s + later changesets %dms "
                    "-- saves %dms (%.1fx)")
               (name db-type)
               full-ms
               snapshot/snapshot-version
               snapshot-ms
               saved
               (if (pos? snapshot-ms)
                 (double (/ full-ms snapshot-ms))
                 ##Inf))))

(def ^:private unstable-literals
  "Values two dumps of the very same migrations disagree on, and what to put in their place. Wall-clock times, and the
  freshly generated hashes and tokens [[generated-columns]] drops on the row comparison -- here they are masked in the
  SQL text instead, since that is what is being compared.

  A migration that starts seeding some other random value will fail this comparison on that value; add it here.

  The hash and UUID patterns match the value itself, with no surrounding quotes: `auth_identity.credentials` is a
  JSON column holding both, so in the dump they arrive quoted as JSON rather than as SQL string literals. Each shape
  is specific enough to stand on its own. A timestamp is not -- plain dates turn up in seeded text -- so that one
  still has to be a SQL literal to be masked."
  [[#"'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}(?::?\d{2})?)?'" "'<timestamp>'"]
   [#"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}"                                           "<password-hash>"]
   [#"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"                 "<uuid>"]])

(defn- unstable-values-masked [statement]
  (as-> statement stmt
    (reduce (fn [sql [pattern replacement]] (str/replace sql pattern replacement))
            stmt
            unstable-literals)
    ;; the id Liquibase gives the deployment that ran the changesets, and only ever that
    (cond-> stmt
      (str/includes? (u/lower-case-en stmt) "databasechangelog")
      (str/replace #"'\d{10}'" "'<deployment-id>'"))))

(defn- value-tuples
  "The `(...)` tuples of a `VALUES` list, split on the paren closing each one rather than on the commas between them,
  so that a value holding a comma, a newline or a paren of its own cannot be read as a boundary. Nil unless every
  character is accounted for, which is what makes it safe to fall back to leaving a statement alone."
  [^String s]
  (loop [i 0, depth 0, in-string? false, start nil, acc []]
    (if (<= (.length s) i)
      (when (and (zero? depth) (not in-string?) (nil? start))
        acc)
      (let [c (.charAt s i)]
        (cond
          ;; a doubled '' reads as two toggles, which lands back inside the string, the same as escaping it does
          in-string? (case c
                       \\ (recur (+ i 2) depth true start acc)
                       \' (recur (inc i) depth false start acc)
                       (recur (inc i) depth true start acc))
          (= c \')   (recur (inc i) depth true start acc)
          (= c \()   (recur (inc i) (inc depth) false (or start i) acc)
          (= c \))   (let [depth (dec depth)]
                       (if (zero? depth)
                         (recur (inc i) depth false nil (conj acc (subs s start (inc i))))
                         (recur (inc i) depth false start acc)))
          ;; outside a tuple only the separators between them and the terminator ending the list may appear;
          ;; anything else means this is not a plain list of tuples and is left alone
          (some? start) (recur (inc i) depth false start acc)
          (or (= c \,) (= c \;) (Character/isWhitespace c)) (recur (inc i) depth false start acc)
          :else nil)))))

(defn- single-row-inserts
  "A multi-row `INSERT ... VALUES (...),(...)` split into one statement per row.

  Two dumps of the very same rows can frame them differently: H2's `SCRIPT` packs rows into multi-row inserts by
  size, so a value one character longer pushes a row into the next statement. That is a difference in batching, not
  in content, and comparing statement by statement would report it as drift. Statements that cannot be taken apart
  with certainty are left exactly as they are."
  [statement]
  (or (when-let [[_ prefix tuples] (re-matches #"(?is)^(.*?\bVALUES\s*)(\(.*)$" statement)]
        (when-let [tuples (value-tuples tuples)]
          (when (next tuples)
            (mapv #(str prefix %) tuples))))
      [statement]))

(defn- comparable-statements [snapshot-text]
  (into []
        (comp (mapcat single-row-inserts)
              (map unstable-values-masked))
        (snapshot/statements snapshot-text)))

(defn- first-difference
  "The first statement two snapshots of the same dialect disagree on, as `{:index _, :checked-in _, :regenerated _}`,
  or nil when they agree. One statement rather than a whole-file diff, because a snapshot runs to thousands of lines
  and a report of all of it says nothing about where to look."
  [checked-in regenerated]
  (or (first (keep-indexed (fn [i [in-file fresh]]
                             (when (not= in-file fresh)
                               {:index i, :checked-in in-file, :regenerated fresh}))
                           (map vector checked-in regenerated)))
      (when (not= (count checked-in) (count regenerated))
        {:index       (min (count checked-in) (count regenerated))
         :checked-in  (format "%d statements" (count checked-in))
         :regenerated (format "%d statements" (count regenerated))})))

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
                    boundary (.indexOf ^java.util.List ids (snapshot/through-changeset-id))
                    ;; compared as sets of ids rather than by count: Liquibase keys a changeset on id, author *and*
                    ;; filename, so the same id legitimately appears in two changelog files, and DATABASECHANGELOG
                    ;; then holds fewer distinct ids than there are changesets up to the boundary
                    expected (set (take (inc boundary) ids))
                    loaded   (set (keys (changelog-fingerprint conn)))]
                (is (nat-int? boundary)
                    "the snapshot's boundary changeset should still exist in the changelog")
                (is (= expected loaded)
                    "the snapshot should record exactly the changesets up to and including its boundary, no gaps")))))))))

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
                                 ;; the snapshot is dumped without the sample content, the way `setup-db!` builds a
                                 ;; test app DB, so the replay it is compared against has to leave it out too
                                 (binding [custom-migrations/*create-sample-content* false]
                                   (vreset! full-ms
                                            (timed #(impl/run-migrations-in-range! conn ["v00.00-000" nil]))))
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
              (testing "same views"
                (is (= (:views from-scratch)
                       (:views from-snapshot))))
              (testing "same database-level settings"
                (is (= (:database from-scratch)
                       (:database from-snapshot))))
              (testing "same changesets recorded as run"
                (is (= (:changelog from-scratch)
                       (:changelog from-snapshot))))
              (testing "same seeded rows"
                (is (= (:data from-scratch)
                       (:data from-snapshot)))))))))))

(deftest snapshot-is-what-generating-it-today-writes-test
  (testing "the checked-in snapshot is the file a regeneration would write, so nobody has to guess whether it is stale"
    ;; Every flavor is checked here rather than once per driver in the matrix, because regenerating starts the server
    ;; it dumps -- so which flavors this can speak does not depend on which DB the job it runs in was given. It needs
    ;; a working docker and nothing else.
    (if-not (regeneration-test-enabled?)
      (log/warn "MB_APP_DB_SNAPSHOT_REGENERATION_TEST is not set; skipping app DB snapshot regeneration check")
      (doseq [flavor server/flavors]
        (testing (name flavor)
          (let [{:keys [content]} (generate/dump-snapshot! flavor)]
            (if-let [checked-in (io/resource (snapshot/resource-path snapshot/snapshot-version flavor "sql"))]
              (is (nil? (first-difference (comparable-statements (slurp checked-in))
                                          (comparable-statements content)))
                  (format "the %s snapshot is stale; regenerate it with (snapshot-test-util.generate/generate! %s)"
                          (name flavor) flavor))
              (log/warnf "No app DB snapshot checked in for %s; skipping" flavor))))))))
