(ns dev.sample-database-dump
  "One-shot generator: read the H2 sample database checked in at
  `resources/sample-database.db.mv.db` and write an equivalent Postgres SQL
  dump (gzipped) to `resources/sample-database.sql.gz`.

  Run via REPL: `(dev.sample-database-dump/dump!)`

  Once we commit to embedded Postgres long-term, this should be replaced with
  a source-of-truth generator (or a pg_dump invocation against a master
  embedded-PG instance). For now it derives from the pre-existing H2 artifact
  so the data stays identical across the H2/SQLite/Postgres migrations.

  The output is a stream of `CREATE TABLE` + multi-row `INSERT` statements
  using quoted identifiers (so PG preserves the uppercase H2 names) and PG
  canonical type names (so sample-content.edn's `:database_type` strings
  match what sync will see)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as rs])
  (:import
   (java.io BufferedWriter OutputStreamWriter)
   (java.sql ResultSetMetaData Types)
   (java.util.zip GZIPOutputStream)))

(def ^:private h2-source-path
  "resources/sample-database.db.mv.db")

(def ^:private sql-target-path
  "resources/sample-database.sql.gz")

(defn- h2-db []
  {:dbtype "h2"
   :dbname (str (-> (io/file h2-source-path) .getAbsolutePath
                    (str/replace #"\.mv\.db$" ""))
                ";ACCESS_MODE_DATA=r;IFEXISTS=TRUE")})

(defn- list-tables [h2]
  (->> (jdbc/execute! h2 ["SELECT TABLE_NAME
                           FROM INFORMATION_SCHEMA.TABLES
                           WHERE TABLE_SCHEMA = 'PUBLIC'
                           ORDER BY TABLE_NAME"]
                      {:builder-fn rs/as-unqualified-maps})
       (map :TABLE_NAME)))

(defn- h2-type->pg
  "Map H2 declared type name to PG canonical type name. Falls back to JDBC
  type code when H2 metadata returns a blank type name (rare). PG canonical
  names are what `information_schema.columns.data_type` will report after
  load, so sample-content.edn's `:database_type` strings should match."
  [^long jdbc-type ^String h2-type-name]
  (let [name (str/upper-case (or h2-type-name ""))]
    (cond
      (str/blank? name)
      (case (int jdbc-type)
        -5   "bigint"
        4    "integer"
        5    "smallint"
        -6   "smallint"
        16   "boolean"
        -7   "boolean"
        8    "double precision"
        6    "double precision"
        7    "real"
        3    "numeric"
        2    "numeric"
        91   "date"
        92   "time"
        93   "timestamp without time zone"
        2014 "timestamp with time zone"
        2004 "bytea"
        -3   "bytea"
        -2   "bytea"
        "text")
      (= name "BIGINT")                  "bigint"
      (= name "INTEGER")                 "integer"
      (= name "SMALLINT")                "smallint"
      (= name "TINYINT")                 "smallint"
      (= name "BOOLEAN")                 "boolean"
      (= name "DOUBLE PRECISION")        "double precision"
      (= name "REAL")                    "real"
      (= name "FLOAT")                   "double precision"
      (#{"DECIMAL" "NUMERIC"} name)      "numeric"
      (= name "DATE")                    "date"
      (= name "TIME")                    "time"
      (= name "TIMESTAMP")               "timestamp without time zone"
      (= name "TIMESTAMP WITH TIME ZONE") "timestamp with time zone"
      (= name "CHARACTER VARYING")       "character varying"
      ;; H2 stores variable-length strings in `CHARACTER` columns without
      ;; padding (legacy quirk); PG `character` would default to length 1
      ;; and reject our multi-char STATE/COUNTRY/ZIP values. Map to text.
      (= name "CHARACTER")               "text"
      (= name "CHARACTER LARGE OBJECT")  "text"
      (#{"VARCHAR" "CLOB" "TEXT"} name)  "text"
      (#{"BLOB" "VARBINARY" "BINARY"} name) "bytea"
      :else (str/lower-case name))))

(defn- column-defs [h2 table]
  (with-open [conn (jdbc/get-connection h2)
              ps   (.prepareStatement conn (format "SELECT * FROM \"PUBLIC\".\"%s\" LIMIT 0" table))
              rs   (.executeQuery ps)]
    (let [^ResultSetMetaData md (.getMetaData rs)
          n  (.getColumnCount md)]
      (vec
       (for [i (range 1 (inc n))]
         {:name      (.getColumnName md i)
          :pg-type   (h2-type->pg (.getColumnType md i) (.getColumnTypeName md i))
          :jdbc-type (.getColumnType md i)})))))

(defn- escape-pg-string ^String [^String s]
  ;; PG E'..' string literal escaping: single-quote-double, backslash-double.
  ;; Wrap in E'...' so backslashes are interpreted.
  (-> s
      (str/replace "\\" "\\\\")
      (str/replace "'" "''")
      (str/replace "\n" "\\n")
      (str/replace "\r" "\\r")
      (str/replace "\t" "\\t")))

(defn- literal
  "Render a JDBC value as a PG SQL literal."
  [v]
  (cond
    (nil? v)              "NULL"
    (boolean? v)          (if v "TRUE" "FALSE")
    (number? v)           (str v)
    (instance? java.time.LocalDate v)      (str "DATE '" v "'")
    (instance? java.time.LocalDateTime v)  (str "TIMESTAMP '" v "'")
    (instance? java.time.LocalTime v)      (str "TIME '" v "'")
    (instance? java.time.OffsetDateTime v) (str "TIMESTAMP WITH TIME ZONE '" v "'")
    (instance? java.time.ZonedDateTime v)  (str "TIMESTAMP WITH TIME ZONE '" v "'")
    (instance? java.sql.Timestamp v)       (str "TIMESTAMP '" (.toLocalDateTime ^java.sql.Timestamp v) "'")
    (instance? java.sql.Date v)            (str "DATE '" (.toLocalDate ^java.sql.Date v) "'")
    (instance? java.sql.Time v)            (str "TIME '" (.toLocalTime ^java.sql.Time v) "'")
    (bytes? v)                             (str "'\\x" (apply str (map #(format "%02x" %) v)) "'::bytea")
    :else                                  (str "E'" (escape-pg-string (str v)) "'")))

(defn- emit-create-table! [^BufferedWriter w table cols]
  (.write w (format "DROP TABLE IF EXISTS \"%s\";\n" table))
  (.write w (format "CREATE TABLE \"%s\" (\n" table))
  (doseq [[i {:keys [name pg-type]}] (map-indexed vector cols)]
    (.write w (format "  \"%s\" %s%s\n"
                      name pg-type (if (= i (dec (count cols))) "" ","))))
  (.write w ");\n\n"))

(def ^:private batch-size 500)

(defn- emit-inserts! [^BufferedWriter w h2 table cols]
  (let [col-list (str/join ", " (map #(format "\"%s\"" (:name %)) cols))
        sel-sql  (format "SELECT %s FROM \"PUBLIC\".\"%s\"" col-list table)]
    (with-open [conn (jdbc/get-connection h2)
                ps   (.prepareStatement conn sel-sql)
                ^java.sql.ResultSet rs (.executeQuery ps)]
      (loop [batch [], total 0]
        (if (.next rs)
          (let [row (vec (for [i (range 1 (inc (count cols)))]
                           (.getObject rs ^int i)))
                batch' (conj batch row)]
            (if (>= (count batch') batch-size)
              (do (.write w (format "INSERT INTO \"%s\" (%s) VALUES\n" table col-list))
                  (doseq [[i row] (map-indexed vector batch')]
                    (.write w "  (")
                    (.write w (str/join ", " (map literal row)))
                    (.write w (if (= i (dec (count batch'))) ")" "),"))
                    (.write w "\n"))
                  (.write w ";\n")
                  (recur [] (+ total (count batch'))))
              (recur batch' total)))
          (do
            (when (seq batch)
              (.write w (format "INSERT INTO \"%s\" (%s) VALUES\n" table col-list))
              (doseq [[i row] (map-indexed vector batch)]
                (.write w "  (")
                (.write w (str/join ", " (map literal row)))
                (.write w (if (= i (dec (count batch))) ")" "),"))
                (.write w "\n"))
              (.write w ";\n"))
            (println "  Wrote" (+ total (count batch)) "rows to" table)))))))

(defn dump!
  "Run the H2 -> SQL dump. Deletes any existing dump file first."
  []
  (let [target (io/file sql-target-path)]
    (when (.exists target)
      (println "Deleting existing" sql-target-path)
      (.delete target)))
  (println "Dumping H2 sample DB ->" sql-target-path)
  (let [h2     (h2-db)
        tables (list-tables h2)]
    (println "Found" (count tables) "tables in PUBLIC schema")
    (with-open [out (-> (io/output-stream sql-target-path)
                        GZIPOutputStream.
                        (OutputStreamWriter. "UTF-8")
                        BufferedWriter.)]
      (.write out "-- Sample database for Metabase, derived from the H2 artifact.\n")
      (.write out "-- Generated by dev.sample-database-dump. Do not edit by hand.\n\n")
      (.write out "BEGIN;\n\n")
      (doseq [table tables]
        (println "  Table:" table)
        (let [cols (column-defs h2 table)]
          (emit-create-table! out table cols)
          (emit-inserts! out h2 table cols)
          (.write out "\n")))
      (.write out "COMMIT;\n"))
    (println "Done. Output:" (.getAbsolutePath (io/file sql-target-path)))))

(comment
  (dump!))
