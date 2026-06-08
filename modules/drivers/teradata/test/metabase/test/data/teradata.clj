(ns metabase.test.data.teradata
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [metabase.driver.common :as driver.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u])
  (:import
   (java.sql Connection PreparedStatement SQLException Types)))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :teradata)

(defmethod sql.tx/field-base-type->sql-type [:teradata :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Boolean]    [_ _] "BYTEINT")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/DateTime]   [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/DateTimeWithTZ] [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Float]      [_ _] "FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Text]       [_ _] "VARCHAR(2048) CHARACTER SET UNICODE")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Time]       [_ _] "TIME")

;; Tested using Teradata Express VM image. Set the host to the correct address if localhost does not work.
(def ^:private connection-details
  (delay
    {:host     (tx/db-test-env-var-or-throw :teradata :host "localhost")
     :user     (tx/db-test-env-var-or-throw :teradata :user "dbc")
     :password (tx/db-test-env-var-or-throw :teradata :password "dbc")}))

(defmethod tx/dbdef->connection-details :teradata [_ context {:keys [database-name]}]
  (merge @connection-details
         (when (= context :db)
           {:user database-name
            :password database-name
            :dbnames database-name})))

(defmethod sql.tx/drop-table-if-exists-sql :teradata [_ {:keys [_database-name]} {:keys [_table-name]}]
  ;; Disabling this as teradata doesn't support DROP TABLE IF EXISTS and throws an error if the table doesn't exist
  nil #_(format "DROP TABLE \"%s\".\"%s\";" database-name table-name))

(defmethod sql.tx/create-db-sql :teradata [_ {:keys [database-name]}]
  (format "CREATE user \"%s\" AS password=\"%s\" perm=8388608 spool=134217728;" database-name database-name))

(defmethod sql.tx/drop-db-if-exists-sql :teradata [_ {:keys [database-name]}]
  ;; Need the AbortSessions to avoid a "Can not drop user when logged in" error
  (format "SELECT SYSLIB.AbortSessions(-1, '%s', 0, 'Y', 'Y'); DELETE user \"%s\" ALL; DROP user \"%s\";"
          database-name database-name database-name))

(defmethod ddl/drop-db-ddl-statements :sql/test-extensions
  [_driver {:keys [database-name] :as _dbdef} & {:as _options}]
  (mapv #(format % database-name)
        ["SELECT SYSLIB.AbortSessions(-1, '%s', 0, 'Y', 'Y');"
         "DELETE user \"%s\";"
         "DROP user \"%s\";"]))

(defmethod sql.tx/qualified-name-components :teradata
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name table-name])
  ([_ db-name table-name field-name] [db-name table-name field-name]))

;; TODO override execute to be able to suppress db/table does not exist error.

(defn- jdbc-execute-any!
  [^Connection conn sql]
  (with-open [stmt (.createStatement conn)]
    (when (.execute stmt sql)
      (with-open [rs (.getResultSet stmt)]
        (while (.next rs))))))

(defn- execute-sql!
  [driver conn sql]
  (execute/default-execute-sql! driver conn sql :execute! jdbc-execute-any!))

(defmethod execute/execute-sql! :teradata
  [driver conn sql]
  (execute/sequentially-execute-sql! driver conn sql :execute! execute-sql!))

(defn- insert-sql
  [driver table-identifier columns]
  (let [row             (zipmap columns (repeat [:raw "?"]))
        [sql & params] (sql.qp/format-honeysql driver (ddl/insert-rows-honeysql-form driver table-identifier [row]))]
    (assert (empty? params))
    sql))

(defn- sql-type-for-base-type
  [base-type]
  (cond
    (isa? base-type :type/Boolean)  Types/TINYINT
    (isa? base-type :type/Integer)  Types/BIGINT
    (isa? base-type :type/Decimal)  Types/DECIMAL
    (isa? base-type :type/Float)    Types/DOUBLE
    (isa? base-type :type/DateTime) Types/TIMESTAMP
    (isa? base-type :type/Date)     Types/DATE
    (isa? base-type :type/Time)     Types/TIME
    :else                           Types/VARCHAR))

(defn- sql-type-for-value
  [value]
  (sql-type-for-base-type (driver.common/class->base-type (class value))))

(defn- column-sql-types
  [columns rows]
  (into {}
        (map (fn [column]
               [column (or (some (fn [row]
                                   (when-some [value (get row column)]
                                     (sql-type-for-value value)))
                                 rows)
                           Types/VARCHAR)]))
        columns))

(defn- set-row-parameters!
  [driver ^PreparedStatement stmt columns column-types row]
  (doseq [[i column] (map-indexed vector columns)]
    (let [value (get row column)]
      (if (nil? value)
        (.setNull stmt (inc i) (get column-types column Types/VARCHAR))
        (sql-jdbc.execute/set-parameter driver stmt (inc i) value)))))

(defn- sql-exception-chain
  [e]
  (when (instance? SQLException e)
    (loop [^SQLException ex e
           chain             []]
      (let [chain (conj chain {:message    (ex-message ex)
                               :sql-state  (.getSQLState ex)
                               :error-code (.getErrorCode ex)})]
        (if-let [next-ex (.getNextException ex)]
          (recur next-ex chain)
          chain)))))

(defn- execute-row!
  [driver ^PreparedStatement stmt columns column-types row]
  (set-row-parameters! driver stmt columns column-types row)
  (.executeUpdate stmt))

(defn- execute-rows-individually!
  [driver ^Connection conn sql columns column-types rows]
  (with-open [^PreparedStatement stmt (.prepareStatement conn sql)]
    (doseq [[i row] (map-indexed vector rows)]
      (try
        (execute-row! driver stmt columns column-types row)
        (catch Throwable e
          (throw (ex-info (format "INSERT FAILED on row %d: %s" (inc i) (ex-message e))
                          {:driver         driver
                           :sql            sql
                           :row-number     (inc i)
                           :rows           (count rows)
                           :row            row
                           :sql-exceptions (sql-exception-chain e)}
                          e)))))))

(defn- rows-require-individual-inserts?
  [rows]
  (boolean (some (fn [row]
                   (some #(or (nil? %) (= "" %)) (vals row)))
                 rows)))

(defn- sql-expression-value?
  [value]
  (and (vector? value)
       (#{:raw ::sql.qp/compiled} (first value))))

(defn- rows-contain-sql-expressions?
  [rows]
  (boolean (some (fn [row]
                   (some sql-expression-value? (vals row)))
                 rows)))

(defmethod load-data/do-insert! :teradata
  [driver ^Connection conn table-identifier rows]
  (when (seq rows)
    (if (rows-contain-sql-expressions? rows)
      (doseq [row rows]
        (load-data/do-insert*! driver conn table-identifier [row] nil))
      (let [columns      (vec (keys (first rows)))
            column-types (column-sql-types columns rows)
            sql          (insert-sql driver table-identifier columns)]
        (try
          (if (rows-require-individual-inserts? rows)
            (execute-rows-individually! driver conn sql columns column-types rows)
            (with-open [^PreparedStatement stmt (.prepareStatement conn sql)]
              (doseq [row rows]
                (set-row-parameters! driver stmt columns column-types row)
                (.addBatch stmt))
              (.executeBatch stmt)))
          (catch Throwable e
            (throw (ex-info (format "INSERT FAILED: %s" (ex-message e))
                            {:driver driver
                             :sql    sql
                             :rows   (count rows)
                             :sql-exceptions (sql-exception-chain e)}
                            e))))))))

(defmethod sql.tx/pk-sql-type :teradata [_]
  "INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1 MINVALUE -2147483647 MAXVALUE 2147483647 NO CYCLE)")

(defmethod tx/aggregate-column-info :teradata
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Decimal})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Decimal}))))

(defmethod load-data/chunk-size :teradata
  [_driver _dbdef _tabledef]
  200)

(defmethod tx/drop-view! :teradata
  [driver database view-name {:keys [materialized?]}]
  (let [database-name (get-in database [:settings :database-source-dataset-name])
        qualified-view (sql.tx/qualify-and-quote driver database-name (name view-name))]
    (u/ignore-exceptions
      ;; Teradata doesn't support DROP VIEW IF EXISTS
      (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec database)
                     (sql/format
                      {(if materialized? :drop-materialized-view :drop-view) [[[:raw qualified-view]]]}
                      :dialect (sql.qp/quote-style driver))
                     {:transaction? false}))))

;; Teradata uses REPLACE VIEW instead of CREATE VIEW
(defmethod sql.tx/create-view-of-table-sql :teradata
  [driver database view-name table-name {:keys [_materialized?]}]
  (let [database-name (get-in database [:settings :database-source-dataset-name])
        qualified-view (sql.tx/qualify-and-quote driver database-name view-name)
        qualified-table (sql.tx/qualify-and-quote driver database-name table-name)]
    [(format "REPLACE VIEW %s AS SELECT * FROM %s" qualified-view qualified-table)]))

(defmethod sql.tx/generated-column-sql :teradata [_ _] nil)

(defmethod sql.tx/create-table-sql :teradata
  [driver dbdef tabledef]
  (let [tabledef (update tabledef :field-definitions
                         (fn [field-defs]
                           (mapv (fn [{:keys [base-type] :as field-def}]
                                   (cond-> field-def
                                     (and (:pk? field-def)
                                          (not (and (map? base-type)
                                                    (contains? base-type :native))))
                                     (assoc :not-null? true)))
                                 field-defs)))]
    ((get-method sql.tx/create-table-sql :sql/test-extensions) driver dbdef tabledef)))

(defmethod sql.tx/default-column-sql :teradata [_ _expr] nil)

(defmethod tx/make-alias :teradata
  [_driver alias]
  (str "\"" alias "\""))
