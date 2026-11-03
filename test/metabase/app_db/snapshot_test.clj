(ns metabase.app-db.snapshot-test
  "Guards the checked-in app DB snapshots against drift.

  A snapshot stands in for every changeset up to its boundary, so it is only safe while loading it and migrating the
  rest produces the same DB as migrating the whole changelog from scratch.
  That is what these tests check, and it is what breaks if someone edits a changeset at or below the boundary without
  regenerating the snapshot.

  The comparison always runs on H2, where a full replay takes seconds, so drift Liquibase cannot see, such as an edit
  to a custom migration's code, is caught on every backend run.
  The other dialects are slower and only checked when `MB_APP_DB_SNAPSHOT_DRIFT_TEST=true`, which the
  `app-db-snapshot` CI workflow sets.
  Everything else about the snapshot is cheap enough to check every run."
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.custom-migrations :as custom-migrations]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- drift-test-enabled? [driver]
  (or (= driver :h2)
      (= "true" (config/config-str :mb-app-db-snapshot-drift-test))))

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
  "The user table names exactly as the DB reports them, not case-folded."
  [^java.sql.Connection conn db-type]
  ;; the two DBs being compared are always the same DB type, and MySQL on a case-sensitive filesystem will not answer
  ;; to a name in the wrong case
  (into (sorted-set)
        (map :table_name)
        (snapshot/user-tables conn db-type)))

(defn- schema-of
  "The schema to pass JDBC metadata calls: H2's named explicitly, and nil for Postgres and MySQL, which find theirs
  from the connection."
  [db-type]
  (when (= db-type :h2) "PUBLIC"))

;; Everything the driver reports other than these is compared, so a field nobody thought about still gets checked.
;;
;; - The catalog and schema columns, including their foreign-key spellings, name the database the connection is to,
;;   and the two being compared are deliberately different throwaway databases.
;; - Index, primary key and foreign key names are left for the DB to generate, so they differ run to run.
;; - The cardinality and page counts are index statistics, not structure.
;; - The ordinal position is a column's physical position, and a table rebuilt by a later changeset can hold the same
;;   columns in a different order. Where it means position *within an index* it is used for ordering before being
;;   dropped, so composite index column order is still compared.
(def ^:private ignored-metadata
  "Metadata columns two DBs built by different routes disagree on for reasons that are not drift."
  #{:cardinality
    :fk_name
    :fktable_cat
    :fktable_schem
    :index_name
    :index_qualifier
    :ordinal_position
    :pages
    :pk_name
    :pktable_cat
    :pktable_schem
    :table_cat
    :table_schem})

(defn- comparable-row
  "A metadata row with the [[ignored-metadata]] columns dropped, and a `DEFAULT NULL` collapsed onto no default."
  [row]
  ;; A dump writes DEFAULT NULL where the original DDL simply omitted the default, and MariaDB reports the two
  ;; differently: the string "NULL" versus no value at all. For a nullable column they mean the same thing, and a NOT
  ;; NULL column cannot have DEFAULT NULL, so collapsing them cannot hide a real difference.
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
  "Which column tuples the table has an index on, as `{:indexed #{...}, :unique #{...}}`."
  [^java.sql.Connection conn db-type table]
  ;; Deliberately coverage rather than a list of indexes. Index names are auto-generated and differ run to run, and a
  ;; restored dump can legitimately end up with one index fewer: when a column already carries a unique index, H2 will
  ;; not add a redundant non-unique one alongside it. Neither is drift. Losing an index on a column, or losing its
  ;; uniqueness, still is.
  (with-open [rs (.getIndexInfo (.getMetaData conn) nil (schema-of db-type) table false false)]
    (let [by-name    (->> (jdbc/result-set-seq rs)
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

;; MySQL fixes an expression column's nullability when the view is created, reading the base tables as they are at that
;; moment, and never revisits it: `concat('database_', id)` recorded NOT NULL by the changeset that created
;; `v_databases` stays NOT NULL after a later changeset rebuilds `metabase_database`. A snapshot recreates every view as
;; it loads, against the finished schema, so it lands on what MySQL would say about that view today, which is the same
;; answer re-running the original CREATE would give. Views have no defaults, so the column default goes with it.
(def ^:private view-column-ignored-metadata
  "Metadata a view column carries that a restored dump cannot reproduce."
  #{:nullable :is_nullable :column_def})

(defn- view-security
  "MySQL's `SQL SECURITY` for each view, from upper-cased view name to `DEFINER` or `INVOKER`.
  Empty for the other dialects, which have no such setting."
  [^java.sql.Connection conn db-type]
  ;; the JDBC metadata does not report it, and a view recreated without the clause silently becomes DEFINER
  (if (= db-type :mysql)
    (u/for-map [{:keys [table_name security_type]}
                (jdbc/query {:connection conn}
                            ["SELECT table_name, security_type FROM information_schema.views
                              WHERE table_schema = DATABASE()"])]
      [(u/upper-case-en table_name) security_type])
    {}))

(defn- view-fingerprint
  "Each view by upper-cased name, as `{:security ..., :columns ...}`: its [[view-security]] on MySQL, and the columns
  it exposes."
  [^java.sql.Connection conn db-type]
  ;; The columns are the point: a view whose body could not be resolved when the snapshot loaded still shows up as a
  ;; view, just with nothing in it, and the instance analytics views are only ever read through the app so nothing
  ;; else here would notice.
  (let [security (view-security conn db-type)]
    (with-open [rs (.getTables (.getMetaData conn) nil (schema-of db-type) "%" (into-array String ["VIEW"]))]
      (into (sorted-map)
            (map (fn [view]
                   (let [view-name (u/upper-case-en (:table_name view))]
                     [view-name
                      {:security (get security view-name)
                       :columns  (into (sorted-map)
                                       (map (fn [[col row]] [col (apply dissoc row view-column-ignored-metadata)]))
                                       (columns conn db-type (:table_name view)))}])))
            (jdbc/result-set-seq rs)))))

(defn- database-attributes
  "Settings that belong to the database itself rather than to anything inside it: character set and collation, or
  H2's settings table."
  [^java.sql.Connection conn db-type]
  ;; no table's DDL carries these, and a dump tool only reproduces them when asked, so this is the layer a snapshot most
  ;; easily loses
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
  "Which changesets the DB believes it has run, from `[id author filename]` to `{:md5sum ..., :exectype ...}`."
  [^java.sql.Connection conn]
  ;; Keyed on all three because that is how Liquibase tells changesets apart, and the changelog has ids that appear in
  ;; more than one file. The execution date, order, deployment and Liquibase version legitimately differ between a
  ;; replay and a snapshot load, so they are left out.
  (into (sorted-map)
        (map (fn [{:keys [id author filename] :as row}]
               [[id author filename] (select-keys row [:md5sum :exectype])]))
        (jdbc/query {:connection conn} ["SELECT id, author, filename, md5sum, exectype FROM DATABASECHANGELOG"])))

(defn- recorded-changesets
  "The `[id author filename]` of every changeset DATABASECHANGELOG records as run.
  The version-tracking marker rows are left out, since they are not changesets."
  [^java.sql.Connection conn]
  (into #{}
        (comp (remove versions/legacy-version-tracking-marker?)
              (map (juxt :id :author :filename)))
        (jdbc/query {:connection conn} ["SELECT id, author, filename FROM DATABASECHANGELOG"])))

;; If a migration starts seeding randomness into some other column, the drift test fails on that column; add it here.
(def ^:private generated-columns
  "Columns migrations fill with freshly generated values, such as NanoIDs, password hashes and salts.
  Two runs never agree on them, so they are dropped before rows are compared."
  #{"CREDENTIALS"
    "ENTITY_ID"
    "PASSWORD"
    "PASSWORD_SALT"
    "RESET_TOKEN"})

;; The two seeded tables are each filled by a single INSERT ... SELECT over a join carrying no ORDER BY, so which row
;; draws which sequence value is settled by the plan the server picks. A snapshot is dumped from one server version
;; and loaded into another, so the ids it carries are not the ids that server's own replay would have assigned:
;; Postgres 14 and 18 disagree about `metabot_permissions`. The transform job tags are seeded the same way, and every
;; server tried so far happens to agree on them, which is luck rather than a guarantee. Nothing references either
;; table, and their rows are still compared, so a seeded row going missing, appearing twice, or changing what it
;; points at still fails.
;;
;; The version table is here for a different reason. A loaded snapshot has no version rows, so the first run against
;; it backfills one for the snapshot's deployment, which the per-major split then replaces. That uses up an id a full
;; replay never does, and every later row is numbered one higher.
(def ^:private unstable-id-tables
  "Tables whose auto-generated `id` two migration runs can disagree on, so only that column is dropped."
  #{"DATABASECHANGELOG_VERSION" "METABOT_PERMISSIONS" "TRANSFORM_JOB_TRANSFORM_TAG"})

(defn- unstable-columns
  "Upper-cased columns of `table` whose values two separate migration runs cannot be expected to share.
  They are the wall-clock times, the [[generated-columns]], and the `id` of an [[unstable-id-tables]] table."
  [^java.sql.Connection conn db-type table]
  (into (cond-> generated-columns
          (unstable-id-tables (u/upper-case-en table)) (conj "ID"))
        (keep (fn [[col-name {:keys [type_name]}]]
                (when (re-find #"(?i)^(TIMESTAMP|DATETIME|DATE|TIME)" (str type_name))
                  col-name)))
        (columns conn db-type table)))

(defn- data-fingerprint
  "The rows migrations seeded, from table to the frequencies of its row shapes, without the [[unstable-columns]].
  Tables with no rows are left out."
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
  "Log what the snapshot buys on this machine: the time to reach a fully migrated app DB by replaying the whole
  changelog, against the time to load the snapshot and replay only what it does not record.
  Neither includes fingerprinting."
  [db-type full-ms snapshot-ms]
  ;; This is the same work [[metabase.test.initialize.db/init!]] does once per test JVM, so the difference is what
  ;; every backend job saves at startup. The log4j test config gives this namespace a console appender of its own, so
  ;; the line lands in the job output; everything else logged at INFO during a test run only reaches the JSON log.
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

;; A migration that starts seeding some other random value will fail the regeneration check on that value; add it here.
;;
;; The hash and UUID patterns match the value itself, with no surrounding quotes: the auth identity credentials are a
;; JSON column holding both, so in the dump they arrive quoted as JSON rather than as SQL string literals. Each shape is
;; specific enough to stand on its own. A timestamp is not, since plain dates turn up in seeded text, so that one still
;; has to be a SQL literal to be masked, and neither is an entity id. The backfill in
;; `064/20260723_backfill_entity_ids.yaml` gives the internal user one of 21 random hex characters taken from a UUID.
(def ^:private unstable-literals
  "Values two dumps of the very same migrations disagree on, as `[pattern replacement]` pairs.
  They are the wall-clock times, and the generated hashes, tokens and entity ids [[generated-columns]] drops on the row
  comparison, masked in the SQL text instead since that is what the regeneration check compares."
  [[#"'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}(?::?\d{2})?)?'" "'<timestamp>'"]
   [#"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}"                                           "<password-hash>"]
   [#"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"                 "<uuid>"]
   [#"'[0-9a-f]{21}'"                                                               "'<entity-id>'"]])

(defn- unstable-values-masked
  "The `statement` with every [[unstable-literals]] pattern replaced."
  [statement]
  (reduce (fn [sql [pattern replacement]] (str/replace sql pattern replacement))
          statement
          unstable-literals))

(defn- value-tuples
  "The `(...)` tuples of a `VALUES` list `s`, or nil unless every character of it is accounted for.
  Tuples are split on the paren closing each one rather than on the commas between them, so a value holding a comma,
  a newline or a paren of its own is not read as a boundary."
  [^String s]
  ;; returning nil rather than a guess is what makes it safe for the caller to fall back to leaving a statement alone
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
  "A multi-row `INSERT ... VALUES (...),(...)` split into one statement per row, as a vector.
  Any other statement, or one that cannot be taken apart with certainty, comes back alone and unchanged."
  [statement]
  ;; Two dumps of the very same rows can frame them differently: H2's SCRIPT packs rows into multi-row inserts by size,
  ;; so a value one character longer pushes a row into the next statement. That is a difference in batching, not in
  ;; content, and comparing statement by statement would report it as drift.
  (or (when-let [[_ prefix tuples] (re-matches #"(?is)^(.*?\bVALUES\s*)(\(.*)$" statement)]
        (when-let [tuples (value-tuples tuples)]
          (when (next tuples)
            (mapv #(str prefix %) tuples))))
      [statement]))

(defn- comparable-statements
  "The statements of a snapshot file, one row per insert and with the [[unstable-literals]] masked."
  [snapshot-text]
  (into []
        (comp (mapcat single-row-inserts)
              (map unstable-values-masked))
        (snapshot/statements snapshot-text)))

(defn- first-difference
  "The first statement two snapshots of the same dialect disagree on, as `{:index _, :checked-in _, :regenerated _}`.
  Returns nil when they agree, and the two statement counts when one is a prefix of the other."
  [checked-in regenerated]
  ;; one statement rather than a whole-file diff, because a snapshot runs to thousands of lines and a report of all of
  ;; it says nothing about where to look
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
          (let [flavor    (snapshot/flavor conn driver)
                loadable? (snapshot/loadable? conn driver)]
            (is loadable? (format "a snapshot should be checked in for %s" flavor))
            (when loadable?
              (snapshot/load-snapshot! conn driver)
              (let [changesets (snapshot/changesets conn)
                    through    (snapshot/through-changeset-id)
                    boundary   (u/index-of (comp #{through} first) changesets)
                    recorded   (recorded-changesets conn)]
                (is (some? boundary)
                    "the snapshot's boundary changeset should still exist in the changelog")
                (is (some (comp #{through} first) recorded)
                    "the snapshot should record its boundary changeset")
                (is (empty? (remove (set changesets) recorded))
                    "every changeset the snapshot records should still be in the changelog")
                (is (= :valid (liquibase/with-liquibase [lb conn]
                                (.validate lb)
                                :valid))
                    "Liquibase should accept the checksums the snapshot records")
                ;; not a failure: these run after the snapshot loads, so tests stay correct. Each is time the snapshot
                ;; no longer saves, and regenerating gets it back.
                (when-let [missing (when boundary
                                     (seq (remove recorded (take (inc boundary) changesets))))]
                  (log/infof "app DB snapshot %s [%s] predates %d changesets before its boundary; regenerate it: %s"
                             snapshot/snapshot-version flavor (count missing)
                             (str/join ", " (map first missing))))))))))))

(defn- migrate-from-snapshot!
  "Load the snapshot into the empty DB behind `conn` and migrate the rest of the way.
  Returns `{:flavor _, :ms _, :fingerprint _}`, with `:ms` and `:fingerprint` nil when no snapshot is checked in for
  the flavor."
  [^java.sql.Connection conn driver]
  (merge {:flavor (snapshot/flavor conn driver)}
         (when (snapshot/loadable? conn driver)
           {:ms          (timed (fn []
                                  (snapshot/load-snapshot! conn driver)
                                  ;; the whole changelog, skipping what the snapshot records, so a changeset the
                                  ;; snapshot predates runs wherever it sits
                                  (impl/run-migrations-in-range! conn ["v00.00-000" nil] {:skip-ran? true})))
            :fingerprint (fingerprint conn driver)})))

(defn- migrate-from-scratch!
  "Migrate the empty DB behind `conn` through the whole changelog. Returns `{:ms _, :fingerprint _}`."
  [^java.sql.Connection conn driver]
  {:ms          (timed #(impl/run-migrations-in-range! conn ["v00.00-000" nil]))
   :fingerprint (fingerprint conn driver)})

(deftest snapshot-matches-full-migration-test
  (testing "loading the snapshot and migrating the rest produces the same DB as migrating everything from scratch"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (let [driver driver/*driver*]
        (if-not (drift-test-enabled? driver)
          (log/warnf "MB_APP_DB_SNAPSHOT_DRIFT_TEST is not set; skipping app DB snapshot drift comparison for %s"
                     driver)
          ;; the snapshot is dumped without the sample content, the way `setup-db!` builds a test app DB, so neither
          ;; side gets it
          (binding [custom-migrations/*create-sample-content* false]
            ;; snapshot side first, so a dialect with no snapshot checked in costs nothing to skip
            (let [{flavor :flavor, snapshot-ms :ms, from-snapshot :fingerprint}
                  (impl/with-temp-empty-app-db [conn driver]
                    (migrate-from-snapshot! conn driver))]
              (is (some? from-snapshot) (format "a snapshot should be checked in for %s" flavor))
              (when from-snapshot
                (let [{full-ms :ms, from-scratch :fingerprint} (impl/with-temp-empty-app-db [conn driver]
                                                                 (migrate-from-scratch! conn driver))]
                  (log-timings! flavor full-ms snapshot-ms)
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
                           (:data from-snapshot)))))))))))))

(deftest snapshot-is-what-generating-it-today-writes-test
  (testing "the checked-in snapshot is the file a regeneration would write, so nobody has to guess whether it is stale"
    ;; Every flavor is checked here rather than once per driver in the matrix, because regenerating starts the server
    ;; it dumps -- so which flavors this can speak does not depend on which DB the job it runs in was given. It needs
    ;; a working docker and nothing else.
    (if-not (regeneration-test-enabled?)
      (log/warn "MB_APP_DB_SNAPSHOT_REGENERATION_TEST is not set; skipping app DB snapshot regeneration check")
      (doseq [flavor (sort snapshot/flavors)]
        (testing (name flavor)
          (let [checked-in (io/resource (snapshot/resource-path snapshot/snapshot-version flavor "sql"))]
            (is (some? checked-in)
                (format "a snapshot should be checked in for %s" (name flavor)))
            (when checked-in
              (let [{:keys [content]} (generate/dump-snapshot! flavor)]
                (is (nil? (first-difference (comparable-statements (slurp checked-in))
                                            (comparable-statements content)))
                    (format "the %s snapshot is stale; regenerate it with (snapshot-test-util.generate/generate! %s)"
                            (name flavor) flavor))))))))))

(deftest skip-ran-replays-only-what-the-snapshot-does-not-record-test
  (testing "replaying the whole changelog over a loaded snapshot runs none of the changesets it records again"
    (impl/with-temp-empty-app-db [conn :h2]
      (snapshot/load-snapshot! conn :h2)
      (let [recorded (recorded-changesets conn)]
        (impl/run-migrations-in-range! conn ["v00.00-000" nil] {:skip-ran? true})
        (is (= []
               (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE exectype = 'RERAN'"])))
        (is (= (set (snapshot/changesets conn))
               (set/union recorded (recorded-changesets conn))))))))

;;; ------------------------------------------- comparing snapshot files --------------------------------------------

(deftest single-row-inserts-test
  (are [statement expected] (= expected (single-row-inserts statement))
    ;; one statement per row, each with the full prefix
    "INSERT INTO t VALUES (1, 'a'), (2, 'b')"     ["INSERT INTO t VALUES (1, 'a')" "INSERT INTO t VALUES (2, 'b')"]
    ;; commas, parens and doubled quotes inside a value are not boundaries
    "INSERT INTO t VALUES ('a, (b)'), ('it''s')" ["INSERT INTO t VALUES ('a, (b)')" "INSERT INTO t VALUES ('it''s')"]
    ;; a single row, or anything that is not a plain list of tuples, is left alone
    "INSERT INTO t VALUES (1)"                    ["INSERT INTO t VALUES (1)"]
    "INSERT INTO t VALUES (1), (2) RETURNING *"   ["INSERT INTO t VALUES (1), (2) RETURNING *"]
    "CREATE TABLE t (id INT, name TEXT)"          ["CREATE TABLE t (id INT, name TEXT)"]))

(deftest first-difference-test
  (are [checked-in regenerated expected] (= expected (first-difference checked-in regenerated))
    ["a" "b"] ["a" "b"]     nil
    ["a" "b"] ["a" "c"]     {:index 1, :checked-in "b", :regenerated "c"}
    ["a" "b"] ["a"]         {:index 1, :checked-in "2 statements", :regenerated "1 statements"}
    ["a"]     ["a" "b" "c"] {:index 1, :checked-in "1 statements", :regenerated "3 statements"}))
