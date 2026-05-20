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
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as rs])
  (:import
   (java.sql ResultSetMetaData Types)))

(def ^:private h2-source-path
  "resources/sample-database.db.mv.db")

(def ^:private sqlite-target-path
  "resources/sample-database.sqlite")

(defn- h2-db []
  ;; Read-only; do not touch the bundled artifact. H2 expects the dbname WITHOUT
  ;; the `.mv.db` suffix on disk.
  {:dbtype "h2"
   :dbname (str (-> (io/file h2-source-path) .getAbsolutePath
                    (str/replace #"\.mv\.db$" ""))
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
  "Map H2 JDBC type code to a SQLite column affinity. SQLite is dynamically
  typed; affinity is purely advisory but downstream Metabase sync uses
  `DATABASE_TYPE` (the declared type string) for base-type inference, so picking
  recognizable names matters."
  [^long jdbc-type ^String h2-type-name]
  (cond
    (#{Types/INTEGER Types/BIGINT Types/SMALLINT Types/TINYINT} jdbc-type) "INTEGER"
    (#{Types/BOOLEAN Types/BIT} jdbc-type) "INTEGER"
    (#{Types/REAL Types/FLOAT Types/DOUBLE} jdbc-type) "REAL"
    (#{Types/DECIMAL Types/NUMERIC} jdbc-type) "NUMERIC"
    (#{Types/DATE} jdbc-type) "DATE"
    (#{Types/TIME} jdbc-type) "TIME"
    (#{Types/TIMESTAMP Types/TIMESTAMP_WITH_TIMEZONE} jdbc-type) "TIMESTAMP"
    (#{Types/VARBINARY Types/BINARY Types/BLOB} jdbc-type) "BLOB"
    :else
    ;; Default to TEXT for VARCHAR / CLOB / CHAR / unknown.
    (if (str/blank? h2-type-name) "TEXT" "TEXT")))

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

(defn- create-table-sql [table cols]
  (format "CREATE TABLE \"%s\" (%s)"
          table
          (str/join ", "
                    (for [{:keys [name sqlite-type]} cols]
                      (format "\"%s\" %s" name sqlite-type)))))

(defn- insert-sql [table cols]
  (format "INSERT INTO \"%s\" (%s) VALUES (%s)"
          table
          (str/join ", " (map #(format "\"%s\"" (:name %)) cols))
          (str/join ", " (repeat (count cols) "?"))))

(defn- coerce-value
  "Coerce H2 values to types SQLite-JDBC accepts cleanly."
  [v]
  (cond
    (nil? v)                              nil
    (instance? java.time.LocalDate v)     (str v)
    (instance? java.time.LocalDateTime v) (str v)
    (instance? java.time.LocalTime v)     (str v)
    (instance? java.time.OffsetDateTime v) (str v)
    (instance? java.time.ZonedDateTime v) (str v)
    (instance? java.sql.Timestamp v)      (str (.toLocalDateTime ^java.sql.Timestamp v))
    (instance? java.sql.Date v)           (str (.toLocalDate ^java.sql.Date v))
    (instance? java.sql.Time v)           (str (.toLocalTime ^java.sql.Time v))
    :else v))

(defn- copy-table!
  [h2 sqlite schema table]
  (let [cols     (column-defs h2 schema table)
        ddl      (create-table-sql table cols)
        ins-sql  (insert-sql table cols)]
    (println "  Creating table" table "with" (count cols) "columns")
    (jdbc/execute! sqlite [ddl])
    (let [row-count (atom 0)]
      (with-open [conn (jdbc/get-connection h2)]
        (let [ps (.prepareStatement conn (format "SELECT %s FROM \"%s\".\"%s\""
                                                 (str/join ", "
                                                           (map #(format "\"%s\"" (:name %)) cols))
                                                 schema table))]
          (with-open [^java.sql.ResultSet rs (.executeQuery ps)]
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
      (println "  Wrote" @row-count "rows to" table))))

(defn convert!
  "Run the H2 -> SQLite conversion. Deletes any existing SQLite file first."
  []
  (let [target (io/file sqlite-target-path)]
    (when (.exists target)
      (println "Deleting existing" sqlite-target-path)
      (.delete target)))
  (println "Converting H2 sample DB ->" sqlite-target-path)
  (let [h2     (h2-db)
        sqlite (sqlite-db)
        tables (list-tables h2)]
    (println "Found" (count tables) "tables in PUBLIC schema")
    (doseq [[schema table] tables]
      (copy-table! h2 sqlite schema table))
    (println "Done. Output:" (.getAbsolutePath (io/file sqlite-target-path)))))
