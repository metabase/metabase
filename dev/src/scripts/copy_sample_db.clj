(ns scripts.copy-sample-db
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [metabase.sample-data.impl :as sample-data]))

;; Access the private function that locates/extracts the H2 DB
(def get-h2-details #'sample-data/try-to-extract-sample-database!)

(defn copy! [{:keys [host port db user password]
              :or {host "localhost" port 5432 user "postgres" password "postgres"}}]
  (let [h2-details (get-h2-details)
        ;; The result from try-to-extract-sample-database! is like {:db "file:..."}
        ;; JDBC needs {:connection-uri "jdbc:h2:..."} or just the raw connection spec for H2.
        ;; Based on metabase.sample-data.impl/process-sample-db-path, the :db value is a path string
        ;; that might already include options like ;USER=...
        ;; clojure.java.jdbc works well with a map like {:connection-uri "jdbc:h2:..."}
        h2-spec {:connection-uri (str "jdbc:h2:" (:db h2-details) ";IFEXISTS=TRUE;ACCESS_MODE_DATA=r")}

        pg-spec {:dbtype "postgresql"
                 :dbname db
                 :host host
                 :port port
                 :user user
                 :password password}
        tables ["ACCOUNTS" "ANALYTIC_EVENTS" "FEEDBACK" "INVOICES" "ORDERS" "PEOPLE" "PRODUCTS" "REVIEWS"]]

    (println "Connected to Sample Database at" (:db h2-details))
    (println "Target Postgres DB:" db)

    (doseq [table-name tables]
      (println "Processing" table-name "...")
      (let [columns (jdbc/query h2-spec (str "SHOW COLUMNS FROM " table-name))
            ;; Simple type mapping from H2 to Postgres
            map-type (fn [t]
                       (cond
                         (str/includes? t "VARCHAR") "TEXT"
                         (str/includes? t "INTEGER") "INTEGER"
                         (str/includes? t "BIGINT") "BIGINT"
                         (str/includes? t "DOUBLE") "DOUBLE PRECISION"
                         (str/includes? t "DECIMAL") "DECIMAL"
                         (str/includes? t "BOOLEAN") "BOOLEAN"
                         (str/includes? t "TIMESTAMP") "TIMESTAMP"
                         (str/includes? t "DATE") "DATE"
                         (str/includes? t "CLOB") "TEXT"
                         (str/includes? t "LARGE OBJECT") "TEXT"
                         :else t))
            ;; Create lower case table and column names in Postgres
            target-table-name (str/lower-case table-name)
            col-defs (map #(str "\"" (str/lower-case (:field %)) "\" " (map-type (:type %))) columns)
            ddl (str "CREATE TABLE IF NOT EXISTS \"" target-table-name "\" (" (str/join ", " col-defs) ")")]

        ;; Create table
        (jdbc/execute! pg-spec ddl)

        ;; Truncate to avoid duplicates if running multiple times
        (jdbc/execute! pg-spec (str "TRUNCATE TABLE \"" target-table-name "\""))

        ;; Insert data
        (let [rows (jdbc/query h2-spec (str "SELECT * FROM " table-name))]
          (when (seq rows)
            (println "  Inserting" (count rows) "rows...")
            (let [col-names (map #(str "\"" (str/lower-case (:field %)) "\"") columns)
                  row-vals (map (fn [row]
                                  (map (fn [col]
                                         ;; jdbc/query lowercases column names by default in the result map keys
                                         (get row (keyword (str/lower-case (:field col)))))
                                       columns))
                                rows)]
              (jdbc/insert-multi! pg-spec (str "\"" target-table-name "\"") col-names row-vals))))))))

(defn -main [& args]
  (if (empty? args)
    (println "Usage: clojure -M:dev -m scripts.copy-sample-db <postgres_db_name>")
    (copy! {:db (first args)})))
