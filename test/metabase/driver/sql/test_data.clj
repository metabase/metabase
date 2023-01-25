(ns metabase.driver.sql.test-data
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.test-data :as driver.test-data]
   [metabase.test.data.interface :as tx]))

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
  {:arglists '([driver dbdef tabledef fielddef]), :added "0.46.0"}
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

(defn server-sql-step
  ([sql]
   {:type    :sql
    :context :server
    :sql     sql})

  ([format-string & args]
   (server-sql-step (apply format format-string args))))

(defn db-sql-step
  ([sql]
   {:type    :sql
    :context :db
    :sql     sql})

  ([format-string & args]
   (db-sql-step (apply format format-string args))))

(defmethod driver.test-data/init-steps :sql
  [driver {:keys [database-name], :as _dbdef}]
  [(server-sql-step "DROP DATABASE IF EXISTS %s;" (quoted-database-identifier driver database-name))
   (server-sql-step "CREATE DATABASE %s;" (quoted-database-identifier driver database-name))])

(defmethod driver.test-data/create-table-steps :sql
  [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions table-comment], :as tabledef}]
  [(db-sql-step "CREATE TABLE %s (\n  %s\n);"
                (quoted-table-identifier driver database-name table-name)
                (str/join ",\n  " (for [fielddef (cons (primary-key-field-definition driver)
                                                       field-definitions)]
                                    (create-table-field-definition driver dbdef tabledef fielddef))))]
  ;; TODO -- `table-comment`
  ;; TODO -- field comments
  )

(defmethod driver.test-data/load-data-steps :sql
  [driver {:keys [database-name], :as _dbdef} {:keys [table-name], :as _tabledef}]
  [(db-sql-step "INSERT INTO %s ()\nVALUES\n();" (quoted-table-identifier driver database-name table-name))])


(defn x []
  (doseq [{:keys [sql]} (metabase.driver.test-data/dataset-steps :postgres 'test-data)]
    (println sql \newline)))
