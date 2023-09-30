(ns metabase.driver.sql.test-data
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.test-data :as driver.test-data]
   [metabase.test.data.interface :as tx]
   [metabase.util.date-2 :as u.date]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;;; interface

(defmulti quote-identifier
  {:arglists '([driver s]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti quoted-database-identifier
  {:arglists '([driver database-name]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti quoted-table-identifier
  {:arglists '([driver database-name table-name]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti quoted-field-identifier-for-current-table
  {:arglists '([driver database-name table-name field-name]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti quoted-field-identifier-for-other-table
  {:arglists '([driver database-name table-name field-name]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti primary-key-sql-type
  {:arglists '([driver]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti base-type->sql-type
  {:arglists '([driver base-type]), :added "0.46.0"}
  (fn [driver base-type]
    [(tx/dispatch-on-driver-with-test-extensions driver)
     (keyword base-type)])
  :hierarchy #'driver/hierarchy)

(defmulti field-definition-foreign-key-reference
  {:arglists '([driver dbdef source-tabledef source-field-def dest-tabledef dest-field-def]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti create-table-field-definition
  "Field definition as it should appear in a `CREATE TABLE` statement."
  {:arglists '(^String [driver dbdef tabledef fielddef]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti table-comment-sql
  "Return SQL to add a comment to a table, e.g.

    COMMENT ON TABLE my_table IS 'my comment';

  If the database does not support table comments, this method should return `nil`."
  {:arglists '(^String [driver dbdef tabledef]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti field-comment-sql
  "Return SQL to add a comment to a field, e.g.

    COMMENT ON COLUMN my_table.my_field IS 'my comment';

  If the database does not support field comments, this method should return `nil`."
  {:arglists '(^String [driver dbdef tabledef fielddef]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(def to-sql-literal nil) ; NOCOMMIT

(defmulti to-sql-literal
  "Convert some sort of value to a SQL literal."
  {:arglists '(^String [driver base-type value]), :added "0.46.0"}
  (fn [driver _base-type value]
    [;; this uses `keyword` because [[tx/dispatch-on-driver-with-test-extensions]] is significantly slower and this gets
     ;; called like millions of times and it adds up
     (keyword driver)
     (type value)])
  :hierarchy #'driver/hierarchy)

(defmulti server-steps
  "Do stuff like `DROP DATABASE IF EXISTS` and `CREATE DATABASE` if needed."
  {:arglists '([driver dbdef]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti create-table-steps!
  "Do stuff like `DROP DATABASE IF EXISTS` and `CREATE DATABASE` if needed."
  {:arglists '([driver dbdef tabledef ^java.io.Writer w]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti load-data-steps!
  "Do stuff like `DROP DATABASE IF EXISTS` and `CREATE DATABASE` if needed."
  {:arglists '([driver dbdef tabledef ^java.io.Writer w]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

;;;; default impls

(defmethod quote-identifier :sql
  [_driver s]
  (str \" (str/replace s #"\"" "\"\"") \"))

(defmethod quoted-database-identifier :sql
  [driver database-name]
  (quote-identifier driver database-name))

(defmethod quoted-table-identifier :sql
  [driver _database-name table-name]
  (quote-identifier driver table-name))

(defmethod quoted-field-identifier-for-current-table :sql
  [driver _database-name _table-name field-name]
  (quote-identifier driver field-name))

(defmethod quoted-field-identifier-for-other-table :sql
  [driver database-name table-name field-name]
  (str (quoted-table-identifier driver database-name table-name)
       \.
       (quote-identifier driver field-name)))

(defmethod primary-key-sql-type :sql
  [_driver]
  "INTEGER AUTO_INCREMENT")

(defmethod base-type->sql-type [:sql :type/BigInteger]     [_driver _base-type] "BIGINT")
(defmethod base-type->sql-type [:sql :type/Boolean]        [_driver _base-type] "BOOLEAN")
(defmethod base-type->sql-type [:sql :type/Date]           [_driver _base-type] "DATE")
(defmethod base-type->sql-type [:sql :type/DateTime]       [_driver _base-type] "TIMESTAMP")
(defmethod base-type->sql-type [:sql :type/DateTimeWithTZ] [_driver _base-type] "TIMESTAMP WITH TIME ZONE")
(defmethod base-type->sql-type [:sql :type/Decimal]        [_driver _base-type] "DECIMAL")
(defmethod base-type->sql-type [:sql :type/Float]          [_driver _base-type] "FLOAT")
(defmethod base-type->sql-type [:sql :type/Integer]        [_driver _base-type] "INTEGER")
(defmethod base-type->sql-type [:sql :type/Text]           [_driver _base-type] "TEXT")
(defmethod base-type->sql-type [:sql :type/Time]           [_driver _base-type] "TIME")

(defn base-type->sql* [driver base-type]
  (cond
    (keyword? base-type)
    (base-type->sql-type driver base-type)

    (:native base-type)
    (:native base-type)

    (:natives base-type)
    (get-in base-type [:natives driver])

    :else
    (throw (ex-info (format "Invalid base type %s" (pr-str base-type))
                    {:drive driver, :base-type base-type}))))

(defn find-tabledef [{:keys [table-definitions], :as _dbdef} table-name]
  (or (some (fn [tabledef]
              (when (= (name (:table-name tabledef)) (name table-name))
                tabledef))
            table-definitions)
      (throw (ex-info (format "Cannot find table definition for table %s" (pr-str (name table-name)))
                      {:table-name table-name
                       :found      (set (map :table-name table-definitions))}))))

(defn primary-key-field-definition [driver]
  {:field-name "id"
   :base-type  {:native (primary-key-sql-type driver)}
   :pk?        true})

(defmethod field-definition-foreign-key-reference :sql
  [driver
   {:keys [database-name], :as _dbdef}
   _source-tabledef
   _source-fielddef
   {dest-table-name :table-name, :as _dest-tabledef}
   {dest-field-name :field-name, :as _dest-fielddef}]
  (format "REFERENCES %s (%s)"
          (quoted-table-identifier driver database-name dest-table-name)
          (quoted-field-identifier-for-current-table driver database-name dest-table-name dest-field-name)))

(defn fk-reference*
  [driver dbdef {:keys [table-name], :as tabledef} {:keys [fk], :as fielddef}]
  (when fk
    (let [dest-tabledef (find-tabledef dbdef table-name)
          dest-fielddef (primary-key-field-definition driver)]
      (field-definition-foreign-key-reference driver dbdef tabledef fielddef dest-tabledef dest-fielddef))))

(defmethod create-table-field-definition :sql
  [driver
   {:keys [database-name], :as dbdef}
   {:keys [table-name], :as tabledef}
   {:keys [field-name base-type not-null? pk?], :as fielddef}]
  (str/join " " (filter some? [(quoted-field-identifier-for-current-table driver database-name table-name field-name)
                               (base-type->sql* driver base-type)
                               (when not-null?
                                 "NOT NULL")
                               (when pk?
                                 "PRIMARY KEY")
                               (fk-reference* driver dbdef tabledef fielddef)])))

(defn add-primary-key-if-needed [driver field-definitions]
  (if (:pk? (first field-definitions))
    field-definitions
    (cons (primary-key-field-definition driver)
          field-definitions)))

(defn insert-into-table-values-field-list
  [driver {:keys [database-name], :as _dbdef} {:keys [table-name field-definitions], :as _tabledef}]
  (str/join ", " (for [{:keys [field-name], :as _fielddef} field-definitions]
                   (quoted-field-identifier-for-current-table driver database-name table-name field-name))))

(defmethod to-sql-literal [:sql nil]
  [_driver _base-type _nil]
  "NULL")

(defmethod to-sql-literal [:sql String]
  [_driver _base-type s]
  (str "'" (str/replace s #"'" "''") "'"))

(defmethod to-sql-literal [:sql java.time.LocalDate]
  [_driver _base-type t]
  (format "date '%s'" (u.date/format-sql t)))

(defmethod to-sql-literal [:sql java.time.OffsetDateTime]
  [_driver _base-type t]
  (format "timestamp with time zone '%s'" (u.date/format-sql t)))

(defmethod to-sql-literal [:sql java.time.ZonedDateTime]
  [_driver _base-type t]
  (format "timestamp with time zone '%s'" (u.date/format-sql t)))

(defmethod to-sql-literal [:sql java.time.LocalTime]
  [_driver _base-type t]
  (format "time '%s'" (u.date/format-sql t)))

(defmethod to-sql-literal [:sql java.time.OffsetTime]
  [_driver _base-type t]
  (format "time with time zone '%s'" (u.date/format-sql t)))

(defmethod to-sql-literal [:sql Number]
  [_driver _base-type n]
  (str n))

(defmethod to-sql-literal [:sql java.time.LocalDateTime]
  [_driver _base-type s]
  (str "'" (str/replace s #"'" "''") "'"))

;;;; [[metabase.driver.test-data]] methods

(defn server-file-name ^String [driver database-name]
  (format "target/%s.%s.server.sql"
          (str/replace (u/qualified-name driver) #"/" "__")
          (str/replace (name database-name) #"/" "__")))

(defn write-server-steps-file! [driver {:keys [database-name], :as _dbdef} statements]
  (let [file-name (server-file-name driver database-name)]
    (with-open [w (java.io.FileWriter. file-name)]
      (doseq [^String sql statements]
        (.write w sql)
        (.write w "\n\n")))
    [{:type :sql, :context :server, :file file-name}]))

(defmethod server-steps :sql
  [driver {:keys [database-name], :as dbdef}]
  (let [db-identifier (quoted-database-identifier driver database-name)]
    (write-server-steps-file! driver dbdef [(format "DROP DATABASE IF EXISTS %s;" db-identifier)
                                            (format "CREATE DATABASE %s;" db-identifier)])))

(defn create-table-statement-steps!
  [driver
   {:keys [database-name], :as dbdef}
   {:keys [table-name field-definitions], :as tabledef}
   ^java.io.Writer w]
  (.write w (format "CREATE TABLE %s (\n" (quoted-table-identifier driver database-name table-name)))
  (loop [[fielddef & more] (add-primary-key-if-needed driver field-definitions)]
    (let [sql (create-table-field-definition driver dbdef tabledef fielddef)]
      (.write w "  ")
      (.write w sql)
      (if (seq more)
        (do
          (.write w ",\n")
          (recur more))
        (.write w "\n);\n\n")))))

(defn table-comment-steps!
  [driver dbdef {:keys [table-comment], :as tabledef} ^java.io.Writer w]
  (when table-comment
    (when-let [sql (table-comment-sql driver dbdef tabledef)]
      (.write w sql)
      (.write w "\n\n"))))

(defn field-comment-steps!
  [driver dbdef {:keys [field-definitions], :as tabledef} ^java.io.Writer w]
  (doseq [{:keys [field-comment], :as fielddef} field-definitions
          :when                                 field-comment
          :let                                  [sql (field-comment-sql driver dbdef tabledef fielddef)]
          :when                                 sql]
    (.write w sql)
    (.write w "\n\n")))

(defmethod create-table-steps! :sql
  [driver dbdef tabledef ^java.io.Writer w]
  (concat
   (create-table-statement-steps! driver dbdef tabledef w)
   (table-comment-steps! driver dbdef tabledef w)
   (field-comment-steps! driver dbdef tabledef w)))

(defn write-insert-into!
  [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef} ^java.io.Writer w]
  (.write w (format "INSERT INTO %s (%s)\nVALUES\n"
                    (quoted-table-identifier driver database-name table-name)
                    (insert-into-table-values-field-list driver dbdef tabledef))))

(defn write-row! [driver {:keys [field-definitions], :as _tabledef} row ^java.io.Writer w]
  (.write w "(")
  (loop [[i & more] (range (count field-definitions))]
    (let [{:keys [base-type], :as _fielddef} (nth field-definitions i)
          value                              (nth row i)]
      (.write w (to-sql-literal driver base-type value))
      (when (seq more)
        (.write w ", ")
        (recur more))))
  (.write w ")"))

(defn write-rows! [driver dbdef {:keys [rows], :as tabledef} ^java.io.Writer w]
  (loop [[row & more] rows]
    (write-row! driver tabledef row w)
    (if (seq more)
      (do
        (.write w ",\n")
        (recur more))
      (.write w ";\n\n"))))

(defmethod load-data-steps! :sql
  [driver dbdef tabledef ^java.io.Writer w]
  (write-insert-into! driver dbdef tabledef w)
  (time (write-rows! driver dbdef tabledef w))
  nil)

(defn db-file-name ^String [driver database-name]
  (format "target/%s.%s.db.sql"
          (str/replace (u/qualified-name driver) #"/" "__")
          (str/replace (name database-name) #"/" "__")))

(defn table-steps [driver {:keys [database-name table-definitions], :as dbdef}]
  (let [file-name (db-file-name driver database-name)]
    (with-open [w (java.io.FileWriter. file-name)]
      (into
       [{:type :sql, :context :db, :file file-name}]
       cat
       [(mapcat (fn [tabledef]
                  (create-table-steps! driver dbdef tabledef w))
                table-definitions)
        (mapcat (fn [tabledef]
                  (load-data-steps! driver dbdef tabledef w))
                table-definitions)]))))

(defmethod driver.test-data/dataset-steps :sql
  [driver dataset]
  (let [dbdef (driver.test-data/get-dataset dataset)]
    (into
     []
     (comp cat (distinct))
     [(server-steps driver dbdef)
      (table-steps driver dbdef)])))


;; NOCOMMIT
(defn x []
  (binding [driver.test-data/*preview* false #_true]
    (driver.test-data/dataset-steps :postgres 'sample-dataset)))
