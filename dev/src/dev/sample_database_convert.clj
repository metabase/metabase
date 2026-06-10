(ns dev.sample-database-convert
  "One-shot converter: read the H2 sample database checked in at
  `resources/sample-database.db.mv.db` and write an equivalent SQLite file to
  `resources/sample-database.sqlite`.

  Run via REPL: `(dev.sample-database-convert/convert!)`.

  This exists so the SQLite sample-DB POC has a reproducible derivation from the
  pre-existing H2 artifact. Once we commit to SQLite long-term we should replace
  this with a generator that builds the dataset from source rather than
  re-deriving it from H2."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.driver-api.core :as driver-api]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as rs])
  (:import
   (java.sql Clob Date ResultSet ResultSetMetaData Time Timestamp Types)
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime ZonedDateTime)))

(set! *warn-on-reflection* true)

(def ^:private h2-source-path
  "resources/sample-database.db.mv.db")

(def ^:private sqlite-target-path
  "resources/sample-database.sqlite")

(defn- h2-db []
  ;; Read-only; do not touch the bundled artifact. H2 expects the dbname WITHOUT
  ;; the `.mv.db` suffix on disk.
  {:dbtype "h2"
   :dbname (str (str/replace (.getAbsolutePath (io/file h2-source-path)) #"\.mv\.db$" "")
                ";ACCESS_MODE_DATA=r;IFEXISTS=TRUE")})

(defn- sqlite-db []
  {:dbtype "sqlite"
   :dbname (.getAbsolutePath (io/file sqlite-target-path))})

(defn- list-tables [h2]
  (->> (jdbc/execute! h2 ["SELECT TABLE_SCHEMA, TABLE_NAME
                           FROM INFORMATION_SCHEMA.TABLES
                           WHERE TABLE_SCHEMA = 'PUBLIC'"]
                      {:builder-fn rs/as-unqualified-maps})
       (map (juxt :TABLE_SCHEMA :TABLE_NAME))))

(defn- h2-type->sqlite
  "Pass the H2 declared type name through verbatim. SQLite stores the declared
  type string in `sqlite_master` / `PRAGMA table_info` and Metabase's
  `database-type->base-type` mapping for SQLite is regex-based on that string
  (`#\"BIGINT\"` -> `:type/BigInteger`, `#\"CHAR\"` -> `:type/Text`,
  `#\"DOUB\"` -> `:type/Float`, etc.). Preserving H2's names means sync
  produces the same `:database_type` and `:base_type` values as the H2
  original, which keeps `resources/sample-content.edn` consistent without
  rewriting every field entry. JDBC type code is the disambiguator only when
  the H2 metadata returns a blank type name."
  [^long jdbc-type ^String h2-type-name]
  (if (str/blank? h2-type-name)
    (case (int jdbc-type)
      4 "INTEGER"        ;; Types/INTEGER
      -5 "BIGINT"        ;; Types/BIGINT
      5 "SMALLINT"       ;; Types/SMALLINT
      -6 "TINYINT"       ;; Types/TINYINT
      16 "BOOLEAN"       ;; Types/BOOLEAN
      -7 "BOOLEAN"       ;; Types/BIT
      7 "REAL"           ;; Types/REAL
      6 "FLOAT"          ;; Types/FLOAT
      8 "DOUBLE PRECISION" ;; Types/DOUBLE
      3 "DECIMAL"        ;; Types/DECIMAL
      2 "NUMERIC"        ;; Types/NUMERIC
      91 "DATE"          ;; Types/DATE
      92 "TIME"          ;; Types/TIME
      93 "TIMESTAMP"     ;; Types/TIMESTAMP
      2014 "TIMESTAMP"   ;; Types/TIMESTAMP_WITH_TIMEZONE
      2004 "BLOB"        ;; Types/BLOB
      -3 "BLOB"          ;; Types/VARBINARY
      -2 "BLOB"          ;; Types/BINARY
      "TEXT")
    h2-type-name))

(defn- column-defs
  "Return [{:name col-name :sqlite-type ... :jdbc-type long}] for the given
  schema.table by introspecting a 1-row query against H2."
  [h2 schema table]
  (with-open [conn (jdbc/get-connection h2)
              ps   (.prepareStatement conn (format "SELECT * FROM \"%s\".\"%s\" LIMIT 0"
                                                   schema table))
              rs   (.executeQuery ps)]
    (let [^ResultSetMetaData md (.getMetaData rs)
          n  (.getColumnCount md)]
      (vec
       (for [i (range 1 (inc n))]
         {:name        (.getColumnName md i)
          :sqlite-type (h2-type->sqlite (.getColumnType md i)
                                        (.getColumnTypeName md i))
          :jdbc-type   (.getColumnType md i)})))))

(defn- fk-defs
  "Return [{:fk-cols [...] :pk-table ... :pk-cols [...]}] for schema.table by
  reading H2's imported (foreign) keys. SQLite only records FK relationships
  when they are declared as FOREIGN KEY clauses in the CREATE TABLE DDL, and
  Metabase's sync derives `fk_target_field_id` (and thus implicit joins) from
  those declarations. Grouping on `fk_name` keeps composite keys intact."
  [h2 schema table]
  (with-open [conn (jdbc/get-connection h2)]
    (->> (resultset-seq (.getImportedKeys (.getMetaData conn) nil schema table))
         (group-by :fk_name)
         vals
         (mapv (fn [rows]
                 (let [ordered (sort-by :key_seq rows)]
                   {:fk-cols  (mapv :fkcolumn_name ordered)
                    :pk-table (:pktable_name (first ordered))
                    :pk-cols  (mapv :pkcolumn_name ordered)}))))))

(defn- pk-defs
  "Return the ordered primary-key column names for schema.table by reading H2's
  primary keys. Emitted as a table-level `PRIMARY KEY (...)` constraint (rather
  than an inline `INTEGER PRIMARY KEY`) so the declared column types — and thus
  Metabase's synced `:database_type`/`:base_type` — stay identical to H2. SQLite
  records the constraint in its catalog, so JDBC `getPrimaryKeys` reports it and
  sync assigns `:type/PK`, restoring ID-filter widgets and PK drills."
  [h2 schema table]
  (with-open [conn (jdbc/get-connection h2)]
    (->> (resultset-seq (.getPrimaryKeys (.getMetaData conn) nil schema table))
         (sort-by :key_seq)
         (mapv :column_name))))

(defn- create-table-sql [table cols fks pks]
  (format "CREATE TABLE \"%s\" (%s)"
          table
          (str/join ", "
                    (concat
                     (for [{:keys [name sqlite-type]} cols]
                       (format "\"%s\" %s" name sqlite-type))
                     (when (seq pks)
                       [(format "PRIMARY KEY (%s)"
                                (str/join ", " (map #(format "\"%s\"" %) pks)))])
                     (for [{:keys [fk-cols pk-table pk-cols]} fks]
                       (format "FOREIGN KEY (%s) REFERENCES \"%s\" (%s)"
                               (str/join ", " (map #(format "\"%s\"" %) fk-cols))
                               pk-table
                               (str/join ", " (map #(format "\"%s\"" %) pk-cols))))))))

(defn- insert-sql [table cols]
  (format "INSERT INTO \"%s\" (%s) VALUES (%s)"
          table
          (str/join ", " (map #(format "\"%s\"" (:name %)) cols))
          (str/join ", " (repeat (count cols) "?"))))

(defn- coerce-value
  "Coerce H2 values to types SQLite-JDBC accepts cleanly."
  [v]
  (cond
    (nil? v) nil
    (instance? LocalDate v) (str v)
    (instance? LocalDateTime v) (str v)
    (instance? LocalTime v) (str v)
    (instance? OffsetDateTime v) (str v)
    (instance? ZonedDateTime v) (str v)
    (instance? Timestamp v) (str (.toLocalDateTime ^Timestamp v))
    (instance? Date v) (str (.toLocalDate ^Date v))
    (instance? Time v) (str (.toLocalTime ^Time v))
    ;; CLOB columns (H2 CHARACTER LARGE OBJECT) come back as a java.sql.Clob, not a String. Decode with the
    ;; same helper the H2 driver uses (read-column-thunk :h2); otherwise SQLite-JDBC stores the Clob's
    ;; toString (H2's internal SCRIPT dump).
    (instance? Clob v) (driver-api/clob->str v)
    :else v))

(defn- copy-table!
  [h2 sqlite schema table]
  (let [cols     (column-defs h2 schema table)
        fks      (fk-defs h2 schema table)
        pks      (pk-defs h2 schema table)
        ddl      (create-table-sql table cols fks pks)
        ins-sql  (insert-sql table cols)]
    (log/info "  Creating table" table "with" (count cols) "columns")
    (jdbc/execute! sqlite [ddl])
    (let [row-count (atom 0)]
      (with-open [conn (jdbc/get-connection h2)]
        (let [ps (.prepareStatement conn (format "SELECT %s FROM \"%s\".\"%s\""
                                                 (str/join ", "
                                                           (map #(format "\"%s\"" (:name %)) cols))
                                                 schema table))]
          (with-open [^ResultSet rs (.executeQuery ps)]
            (with-open [scon (jdbc/get-connection sqlite)]
              (.setAutoCommit scon false)
              (with-open [insert-ps (.prepareStatement scon ins-sql)]
                (while (.next rs)
                  (doseq [i (range 1 (inc (count cols)))]
                    (let [raw (.getObject rs ^int i)
                          v   (coerce-value raw)]
                      (if (nil? v)
                        (.setNull insert-ps ^int i Types/NULL)
                        (.setObject insert-ps ^int i v))))
                  (.addBatch insert-ps)
                  (swap! row-count inc)
                  (when (zero? (mod @row-count 5000))
                    (.executeBatch insert-ps)))
                (.executeBatch insert-ps))
              (.commit scon)))))
      (log/info "  Wrote" @row-count "rows to" table))))

(defn convert!
  "Run the H2 -> SQLite conversion. Deletes any existing SQLite file first."
  []
  (let [target (io/file sqlite-target-path)]
    (when (.exists target)
      (log/info "Deleting existing" sqlite-target-path)
      (.delete target)))
  (log/info "Converting H2 sample DB ->" sqlite-target-path)
  (let [h2     (h2-db)
        sqlite (sqlite-db)
        tables (list-tables h2)]
    (log/info "Found" (count tables) "tables in PUBLIC schema")
    (doseq [[schema table] tables]
      (copy-table! h2 sqlite schema table))
    (log/info "Done. Output:" (.getAbsolutePath (io/file sqlite-target-path)))))

(comment
  (convert!))
