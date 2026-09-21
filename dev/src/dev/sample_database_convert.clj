(ns dev.sample-database-convert
  "One-shot converter: read the H2 sample database checked in at
  `resources/sample-database.db.mv.db` and write an equivalent SQLite file to
  `resources/sample-database.sqlite`.

  Run via REPL: `(dev.sample-database-convert/convert!)`.

  This exists so the SQLite sample-DB POC has a reproducible derivation from
  the pre-existing H2 artifact. Once we stop using H2 in E2E tests and retire
  the H2 snapshot DB for good we should replace this with a generator that
  builds the dataset from source rather than re-deriving it from H2."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver-api.core :as driver-api]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.prepare :as prepare]
   [next.jdbc.result-set :as rs])
  (:import
   (java.sql Clob Date ResultSetMetaData Time Timestamp Types)
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime ZonedDateTime)))

;; A Clob is a LOB handle tied to the open result set; `jdbc/execute!` with `rs/as-arrays` realizes rows for use
;; after the set is consumed, so decode it to a String at read time (while the handle is valid) rather than later in
;; `coerce-value`. Uses the same helper as the H2 driver; otherwise SQLite-JDBC stores the Clob's toString.
(extend-protocol rs/ReadableColumn
  Clob
  (read-column-by-label [^Clob v _]   (driver-api/clob->str v))
  (read-column-by-index [^Clob v _ _] (driver-api/clob->str v)))

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

(def ^:private jdbc-type-code->sqlite-type
  "Fallback declared SQLite type by JDBC type code (`java.sql.Types`), used only when H2 returns a blank type name."
  {Types/INTEGER                 "INTEGER"
   Types/BIGINT                  "BIGINT"
   Types/SMALLINT                "SMALLINT"
   Types/TINYINT                 "TINYINT"
   Types/BOOLEAN                 "BOOLEAN"
   Types/BIT                     "BOOLEAN"
   Types/REAL                    "REAL"
   Types/FLOAT                   "FLOAT"
   Types/DOUBLE                  "DOUBLE PRECISION"
   Types/DECIMAL                 "DECIMAL"
   Types/NUMERIC                 "NUMERIC"
   Types/DATE                    "DATE"
   Types/TIME                    "TIME"
   Types/TIMESTAMP               "TIMESTAMP"
   Types/TIMESTAMP_WITH_TIMEZONE "TIMESTAMP"
   Types/BLOB                    "BLOB"
   Types/VARBINARY               "BLOB"
   Types/BINARY                  "BLOB"})

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
    (get jdbc-type-code->sqlite-type (int jdbc-type) "TEXT")
    h2-type-name))

(defn- column-defs
  "Return [{:name col-name :sqlite-type ... :jdbc-type long}] for the given
  schema.table by introspecting the result-set metadata of a 0-row query against H2."
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
  ;; Identifiers are simple uppercase H2 names (no dots), so plain `keyword` is safe; `:quoted true` double-quotes
  ;; them. The declared SQLite type is emitted raw because it is an arbitrary string (e.g. "DOUBLE PRECISION").
  (first
   (sql/format
    {:create-table (keyword table)
     :with-columns
     (concat
      (for [{:keys [name sqlite-type]} cols]
        [(keyword name) [:raw sqlite-type]])
      (when (seq pks)
        [[(into [:primary-key] (map keyword) pks)]])
      (for [{:keys [fk-cols pk-table pk-cols]} fks]
        [(into [:foreign-key] (map keyword) fk-cols)
         (into [:references (keyword pk-table)] (map keyword) pk-cols)]))}
    {:dialect :ansi :quoted true})))

(defn- insert-sql [table cols]
  ;; `[:raw "?"]` forces a positional placeholder per column for the batched PreparedStatement (a nil value would
  ;; render as NULL instead). The actual values are bound later via `.setObject`/`.setNull`.
  (first
   (sql/format
    {:insert-into (keyword table)
     :columns     (mapv (comp keyword :name) cols)
     :values      [(vec (repeat (count cols) [:raw "?"]))]}
    {:dialect :ansi :quoted true})))

(defn- select-sql [schema table cols]
  (first
   (sql/format
    {:select (mapv (comp keyword :name) cols)
     :from   [(keyword (str schema "." table))]}
    {:dialect :ansi :quoted true})))

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
    (let [rows (->> (jdbc/execute! h2 [(select-sql schema table cols)] {:builder-fn rs/as-arrays})
                    rest                                    ; Skip column header
                    (mapv #(mapv coerce-value %)))]
      (jdbc/with-transaction [tx sqlite]
        (with-open [ps (jdbc/prepare tx [ins-sql])]
          (prepare/execute-batch! ps rows {:batch-size 5000})))
      (log/info "  Wrote" (count rows) "rows to" table))))

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
