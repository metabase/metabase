(ns metabase.sidecar.seed
  "Loads CSV files from `resources/sidecar/data/` into the H2 application database
  on sidecar startup. Each CSV file is loaded into a table whose name matches the
  file name (without the `.csv` extension). The first row of each CSV is treated as
  column headers."
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- csv-resource-files
  "Return a seq of [table-name, URL] pairs for all CSV files in `resources/sidecar/data/`."
  []
  (when-let [seed-dir (io/resource "sidecar/data")]
    (let [dir (io/file seed-dir)]
      (when (.isDirectory dir)
        (for [^java.io.File f (sort-by #(.getName ^java.io.File %) (.listFiles dir))
              :when (and (.isFile f)
                         (str/ends-with? (.getName f) ".csv"))]
          [(str/replace (.getName f) #"\.csv$" "")
           f])))))

(defn- read-csv [file]
  (with-open [reader (io/reader file)]
    (doall (csv/read-csv reader))))

(defn- create-table-and-insert!
  "Create a table with the given name and insert all rows from the CSV data.
  The first row is treated as column headers. All columns are created as VARCHAR(1024)."
  [ds table-name csv-data]
  (let [headers  (first csv-data)
        rows     (rest csv-data)
        columns  (map #(str/replace % #"[^a-zA-Z0-9_]" "_") headers)
        col-defs (str/join ", " (map #(str % " VARCHAR(1024)") columns))]
    ;; Drop existing table if it exists, then create fresh
    (jdbc/execute! {:datasource ds} [(str "DROP TABLE IF EXISTS " table-name)])
    (jdbc/execute! {:datasource ds} [(str "CREATE TABLE " table-name " (" col-defs ")")])
    (when (seq rows)
      (let [placeholders (str/join ", " (repeat (count columns) "?"))
            insert-sql   (str "INSERT INTO " table-name " VALUES (" placeholders ")")]
        (jdbc/execute! {:datasource ds}
                       (into [insert-sql] (first rows)))
        (doseq [row (rest rows)]
          (jdbc/execute! {:datasource ds}
                         (into [insert-sql] row)))))
    (log/infof "Loaded %d rows into table %s from CSV" (count rows) table-name)))

(defn load-seed-data!
  "Load all CSV files from `resources/sidecar/data/` into the application database.
  Each file `foo.csv` is loaded into a table called `foo`."
  []
  (let [files (csv-resource-files)]
    (if (seq files)
      (let [ds (mdb/data-source)]
        (doseq [[table-name file] files]
          (try
            (let [csv-data (read-csv file)]
              (when (seq csv-data)
                (create-table-and-insert! ds table-name csv-data)))
            (catch Exception e
              (log/errorf e "Failed to load seed data from %s" (.getName ^java.io.File file))))))
      (log/info "No sidecar seed CSV files found in resources/sidecar/data/"))))
