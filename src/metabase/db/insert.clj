(ns metabase.db.insert
  (:require
   [clojure.java.io :as jio]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.insert :as mdb.insert]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.io StringReader)
   (org.postgresql.copy CopyManager)
   (org.postgresql.jdbc PgConnection)))

(set! *warn-on-reflection* true)

(defmulti bulk-insert!*
  "The driver-specific part of the implementation of `bulk-insert`."
  {:arglists '([driver conn table+schema column-names values])}
  (fn [driver _conn _table+schema _column-names _values]
    driver))

(defn bulk-insert!
  "Insert many rows into the application DB at once.
   This is a performance optimization over toucan2.core/insert! for drivers that support it."
  [table+schema column-names values]
  (let [driver (:db-type mdb.connection/*application-db*)
        conn   (.getConnection mdb.connection/*application-db*)]
    (bulk-insert!* driver conn table+schema column-names values)))

(sql/register-clause!
 ::copy
 (fn
   [_clause table]
   [(str "COPY " (sql/format-entity table))]) :insert-into)

(sql/register-clause!
 ::from-stdin
 (fn format-from-stdin
   [_clause delimiter]
   [(str "FROM STDIN NULL " delimiter)])
 :from)

(defmethod bulk-insert!* :postgres
  [driver ^java.sql.Connection conn table+schema column-names values]
  (let [copy-manager (CopyManager. (.unwrap conn PgConnection))
        [sql & _]    (sql/format {::copy       (keyword table+schema)
                                  :columns     (map keyword column-names)
                                  ::from-stdin "''"}
                                 :quoted true
                                 :dialect (sql.qp/quote-style driver))]
    ;; There's nothing magic about 100, but it felt good in testing. There could well be a better number.
    (doseq [slice-of-values (partition-all 100 values)]
      (let [tsvs (->> slice-of-values
                      (map #(str/join "\t" %))
                      (str/join "\n")
                      (StringReader.))]
        (.copyIn copy-manager ^String sql tsvs)))
    (count values)))

;; Let's create 1,000,000 rows of data, like this:
;; CREATE TABLE performance_test (is_current_user BOOLEAN,
;;                                                role TEXT,
;;                                                schema TEXT,
;;                                                table TEXT,
;;                                                select BOOLEAN,
;;                                                update BOOLEAN,
;;                                                insert BOOLEAN,
;;                                                delete BOOLEAN);

;; INSERT INTO performance_test (is_current_user, role, schema, table, select, update, insert, delete)
;; SELECT
;; false AS is_current_user,                -- Static value
;; 'example_role' AS role,                  -- Static value
;; 'public' AS schema,                      -- Static value
;; 'employees' AS table,                    -- Static value
;; true AS select,                          -- Static value
;; false AS update,                         -- Static value
;; false AS insert,                         -- Static value
;; false AS delete                          -- Static value
;; FROM generate_series (1, 1000000);       -- This generates 1,000,000 rows

;; Local perf testing for postgres
;; 3 seconds for 1,000,000 rows
;; 24 seconds for 10,000,000 rows
(comment
 (let [rows (repeat 10000000 [false "example_role" "public" "employees" true false false false])]
   (time
    (bulk-insert!
     :postgres
     (.getConnection mdb.connection/*application-db*)
     "perfy"
     ["is_current_user" "role" "schema" "table" "select" "update" "insert" "delete"]
     rows))))

;; MySQL perf testing

;; ----------- MYSQL

(defn- format-load
  [_clause [file-path table-name]]
  [(format "LOAD DATA LOCAL INFILE '%s' INTO TABLE %s" file-path (sql/format-entity table-name))])

(sql/register-clause! ::load format-load :insert-into)

(defn- sanitize-value
  ;; Per https://dev.mysql.com/doc/refman/8.0/en/load-data.html#load-data-field-line-handling
  ;; Backslash is the MySQL escape character within strings in SQL statements. Thus, to specify a literal backslash,
  ;; you must specify two backslashes for the value to be interpreted as a single backslash. The escape sequences
  ;; '\t' and '\n' specify tab and newline characters, respectively.
  [v]
  (cond
    (string? v)
    (str/replace v #"\\|\n|\r|\t" {"\\" "\\\\"
                                   "\n" "\\n"
                                   "\r" "\\r"
                                   "\t" "\\t"})
    (boolean? v)
    (if v 1 0)
    :else
    v))

(defn- row->tsv
  [column-count row]
  (when (not= column-count (count row))
    (throw (Exception. (format "ERROR: missing data in row \"%s\"" (str/join "," row)))))
  (->> row
       (map sanitize-value)
       (str/join "\t")))

(defn- get-global-variable
  "The value of the given global variable in the DB. Does not do any type coercion, so, e.g., booleans come back as
  \"ON\" and \"OFF\"."
  [var-name]
  (:value
   (first
    (jdbc/query {:connection (.getConnection mdb.connection/*application-db*)}
                ["show global variables like ?" var-name]))))

(defmethod bulk-insert!* :mysql
  [driver ^java.sql.Connection conn table+schema column-names values]
  ;; `local_infile` must be turned on per
  ;; https://dev.mysql.com/doc/refman/8.0/en/load-data.html#load-data-local
  (if (not= (get-global-variable "local_infile") "ON")
    ;; If it isn't turned on, fall back to the generic "INSERT INTO ..." way
    :no-op
    #_((get-method driver/insert-into! :sql-jdbc) driver db-id table-name column-names values)
    (let [temp-file (File/createTempFile table+schema ".tsv")
          file-path (.getAbsolutePath temp-file)]
      (try
        (let [tsvs (map (partial row->tsv (count column-names)) values)
              sql  (sql/format {::load   [file-path (keyword table+schema)]
                                :columns (map keyword column-names)}
                               :quoted true
                               :dialect (sql.qp/quote-style driver))]
          (with-open [^java.io.Writer writer (jio/writer file-path)]
                     (doseq [value (interpose \newline tsvs)]
                       (.write writer (str value))))
          (jdbc/execute! {:connection conn}
                         sql))
        (finally
          (.delete temp-file))))))

;; MySQL perf testing
(comment
 (jdbc/execute! {:connection (.getConnection mdb.connection/*application-db*)}
                "CREATE TABLE perfy (
     is_current_user BOOLEAN,
     role TEXT,
     schema_name TEXT,
     table_name TEXT,
     select_ BOOLEAN,
     update_ BOOLEAN,
     insert_ BOOLEAN,
     delete_ BOOLEAN
 );
 ")
 ;; 1,000,000 rows -> 5.8 secs
 ;; 10,000,000 rows -> 56.9 secs
 (let [rows (repeat 1000000 [false "example_role" "public" "employees" true false false false])]
   (time
    (bulk-insert!
     :mysql
     (.getConnection mdb.connection/*application-db*)
     "perfy"
     ["is_current_user" "role" "schema_name" "table_name" "select_" "update_" "insert_" "delete_"]
     rows))))

(defn strings [n]
  (->> (range n)
       (map str)
       (map (fn [x]
              (apply str (map (comp char (partial + 49) int) x))))))

(comment

 (let [tables (strings 10)]
   (for [table tables]
     {:prep [(format "CREATE TABLE %s (id INTEGER);" table)]
      :cleanup [(format "DROP TABLE %s;" table)]}))


 ;; create 1000 tables in testy
 (mt/with-db (t2/select-one 'Database :name "testy")
   (let [tables (strings 100)
         conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
     (doseq [stmt (for [table tables]
                    (format "CREATE TABLE %s (id INTEGER);" table))]
       (jdbc/execute! conn-spec
                      stmt))))

 (mt/with-db (t2/select-one 'Database :name "testy")
   (let [tables (strings 100)
         conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
     (doseq [stmt (for [table tables]
                    (format "DROP TABLE %s;" table))]
       (jdbc/execute! conn-spec
                      stmt))))

 ;; 50000 -> 2174 msecs

 ;; 100000 -> 4356 msecs for the query

 (mt/with-db (t2/select-one 'Database :name "testy")
   (let [table-name   "perftesty"
         column-names ["role"
                       "is_current_user"
                       "schema"
                       "table"
                       "select"
                       "update"
                       "insert"
                       "delete"]
         conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
         roles (strings 1000) ;; faa doesn't exist (100)
         roles-set (set roles)
         prep (for [role roles]
                (format "CREATE ROLE %s WITH LOGIN; GRANT USAGE ON SCHEMA public TO %s; GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s;" role role role))
         cleanup (for [role roles]
                   (format "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %s; REVOKE USAGE ON SCHEMA public FROM %s; DROP ROLE %s;" role role role))]
     #_(time (doseq [stmt cleanup]
               (jdbc/execute! conn-spec stmt)))
     #_(time (doseq [stmt prep]
               (jdbc/execute! conn-spec stmt)))
     (let [rows      (time (->> (driver/table-privileges :postgres #_driver (mt/db))
                                #_(filter #(contains? roles-set (first %)))))
           _        (def rows rows)
           row-count (time (mdb.insert/bulk-insert! table-name column-names rows))]
       #_(doseq [stmt cleanup]
           (jdbc/execute! conn-spec stmt))
       [row-count (count rows)])
     #_(t2/delete! :model/Table) ;; delete previously created tables
     #_(let [table-id (t2/select-one-pk :model/Table :name "baz" :schema "foo")]
         (is (= [{:table_id        table-id
                  :is_current_user false
                  :role            "privilege_rows_test_example_role"
                  :select          true
                  :delete          false
                  :insert          false
                  :update          false}]
                (->> (t2/select :model/TablePrivileges :table_id table-id)
                     (filter #(= (:role %) "privilege_rows_test_example_role"))
                     (map #(dissoc % :id)))))))))

;; These are within the bounds for DB sync I think. We can just add it straight away.
(comment
 (mt/with-driver :postgres
   (mt/with-db (t2/select-fn-set :name 'Database :engine "testy")
     (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
       (try
         (jdbc/execute! conn-spec (str "CREATE SCHEMA foo;"
                                       "CREATE TABLE foo.baz (id INTEGER);"
                                       "CREATE ROLE privilege_rows_test_example_role WITH LOGIN;"
                                       "GRANT SELECT ON foo.baz TO privilege_rows_test_example_role;"
                                       "GRANT USAGE ON SCHEMA foo TO privilege_rows_test_example_role;"))
         (t2/delete! :model/Table) ;; delete previously created tables
         (let [table-id (t2/select-one-pk :model/Table :name "baz" :schema "foo")]
           (is (= [{:table_id        table-id
                    :is_current_user false
                    :role            "privilege_rows_test_example_role"
                    :select          true
                    :delete          false
                    :insert          false
                    :update          false}]
                  (->> (t2/select :model/TablePrivileges :table_id table-id)
                       (filter #(= (:role %) "privilege_rows_test_example_role"))
                       (map #(dissoc % :id))))))
         (finally
           (doseq [stmt ["REVOKE ALL PRIVILEGES ON TABLE foo.baz FROM privilege_rows_test_example_role;"
                         "REVOKE ALL PRIVILEGES ON SCHEMA foo FROM privilege_rows_test_example_role;"
                         "DROP ROLE privilege_rows_test_example_role;"]]
             (jdbc/execute! conn-spec stmt))))))))