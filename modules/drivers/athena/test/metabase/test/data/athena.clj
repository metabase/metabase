(ns metabase.test.data.athena
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.athena :as athena]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :athena)

(doseq [feature [:test/time-type
                 :test/timestamptz-type
                 :test/dynamic-dataset-loading]]
  (defmethod driver/database-supports? [:athena feature]
    [_driver _feature _database]
    false))

;;; ----------------------------------------------- Connection Details -----------------------------------------------

;; Athena doesn't support dashes in Table names... we'll just go ahead and convert them all to underscores, even for DB
;; names.
(defmethod ddl.i/format-name :athena
  [driver database-or-table-or-field-name]
  (let [name' ((get-method ddl.i/format-name :sql-jdbc) driver (str/replace database-or-table-or-field-name #"-" "_"))]
    (if (= name' "test_data")
      "v2_test_data"
      name')))

(defmethod tx/dbdef->connection-details :athena
  [driver _context {:keys [database-name], :as _dbdef}]
  {:region                        (tx/db-test-env-var-or-throw :athena :region)
   :access_key                    (tx/db-test-env-var-or-throw :athena :access-key)
   :secret_key                    (tx/db-test-env-var-or-throw :athena :secret-key)
   :s3_staging_dir                (tx/db-test-env-var-or-throw :athena :s3-staging-dir)
   :workgroup                     "primary"
   ;; HACK -- this is here so the Athena driver sync code only syncs the database in question -- see documentation
   ;; for [[metabase.driver.athena/fast-active-tables]] for more information.
   :metabase.driver.athena/schema (some->> database-name (ddl.i/format-name driver))})

;; TODO: We need a better way to have an isolated test environment for Athena
;; If other tables exist, the tests start to query them for some reason,
;; so we exclude them via an environment variable
(defmethod sql-jdbc.sync/excluded-schemas :athena
  [_driver]
  (let [ignored-schemas (set (str/split (tx/db-test-env-var-or-throw :athena :ignore-dbs "") #","))]
    (log/infof "Excluding schemas: %s" (pr-str ignored-schemas))
    ignored-schemas))

;; Athena requires you identify an object with db-name.table-name
(defmethod sql.tx/qualified-name-components :athena
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name table-name])
  ([_ db-name table-name field-name] [db-name table-name field-name]))

;;; INSTRUCTIONS FOR MANUALLY DROPPING AND RECREATING A DATABASE
;;;
;;; 1. Install the AWS CLI if you haven't done so already
;;;
;;; 2. Create a profile using the `MB_ATHENA_TEST_ACCESS_KEY`, `MB_ATHENA_TEST_SECRET_KEY`, and `MB_ATHENA_TEST_REGION`
;;;    you're using to run tests
;;;
;;;    ````
;;;    aws configure --profile athena-ci
;;;
;;; 3. Delete the data from the `MB_ATHENA_TEST_S3_STAGING_DIR` S3 bucket. The data directory is the same as the dataset
;;;    name you want to delete with hyphens replaced with underscores e.g. `test-data` becomes `test_data`
;;;
;;;    ```
;;;    aws s3 --profile athena-ci rm s3://metabase-ci-athena-results/test_data --recursive
;;;    ```
;;;
;;; 4. Delete the database from the Glue Console.
;;;
;;;    ```
;;;    aws glue --profile athena-ci delete-database --name test_data
;;;   ```
;;;
;;; 5. After this you can recreate the database normally using the test loading code. Note that you must
;;;    enable [[*allow-database-creation*]] for this to work:
;;;
;;;    ```
;;;    (t2/delete! 'Database :engine "athena", :name "test-data (athena)")
;;;    (binding [metabase.test.data.athena/*allow-database-creation* true]
;;;      (metabase.driver/with-driver :athena
;;;        (metabase.test/dataset test-data
;;;          (metabase.test/db))))
;;;    ```

;;; Athena requires backtick-escaped database name for some queries
(defmethod sql.tx/drop-db-if-exists-sql :athena
  [_driver _dbdef]
  (log/warn (str "You cannot delete a [non-Iceberg] Athena database using DDL statements. It has to be deleted "
                 "manually from S3 and the Glue Console. See documentation in [[metabase.test.data.athena]] for "
                 "instructions for doing this.")))

(defmethod sql.tx/drop-table-if-exists-sql :athena
  [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS `%s`.`%s`"
          (ddl.i/format-name driver database-name)
          (ddl.i/format-name driver table-name)))

(defmethod sql.tx/create-db-sql :athena
  [driver {:keys [database-name]}]
  (format "CREATE DATABASE `%s`;" (ddl.i/format-name driver database-name)))

(defn- s3-location-for-table
  [driver database-name table-name]
  (let [s3-prefix (tx/db-test-env-var-or-throw :athena :s3-staging-dir)]
    (str s3-prefix
         (when-not (str/ends-with? s3-prefix "/")
           "/")
         (ddl.i/format-name driver database-name)
         "/"
         (ddl.i/format-name driver table-name)
         "/")))

;; Customize the create table table to include the S3 location
;; TODO: Specify a unique location each time
(defmethod sql.tx/create-table-sql :athena
  [driver {:keys [database-name]} {:keys [table-name field-definitions], :as _tabledef}]
  (let [fields (->> field-definitions
                    (map (fn [{:keys [field-name base-type]}]
                           (format "`%s` %s"
                                   (ddl.i/format-name driver field-name)
                                   (if (map? base-type)
                                     (:native base-type)
                                     (sql.tx/field-base-type->sql-type driver base-type)))))
                    (interpose ", ")
                    str/join)]
    ;; ICEBERG tables do what we want, and dropping them causes the data to disappear; dropping a normal non-ICEBERG
    ;; table doesn't delete data, so if you recreate it you'll have duplicate rows. 'normal' tables do not support
    ;; `DELETE .. FROM`, either, so there's no way to fix them here.
    ;;
    ;; I contemplated using ICEBERG tables here but they're unusably slow -- we're talking like 10 seconds to run a
    ;; `SELECT count(*)` query on a table with 100 rows. So for the time being, just be careful not to load the same
    ;; data twice. If you do, you'll have to manually delete those folders from the s3 bucket.
    ;;
    ;; -- Cam
    (format
     #_"CREATE TABLE `%s`.`%s` (%s) LOCATION '%s' TBLPROPERTIES ('table_type'='ICEBERG');"
     "CREATE EXTERNAL TABLE `%s`.`%s` (%s) LOCATION '%s';"
     (ddl.i/format-name driver database-name)
     (ddl.i/format-name driver table-name)
     fields
     (s3-location-for-table driver database-name table-name))))

(comment
  (let [test-data-dbdef (tx/get-dataset-definition @(requiring-resolve 'metabase.test.data.dataset-definitions/test-data))
        venues-tabledef (some (fn [tabledef]
                                (when (= (:table-name tabledef) "venues")
                                  tabledef))
                              (:table-definitions test-data-dbdef))]
    (sql.tx/create-table-sql :athena {:database-name "test-data"} venues-tabledef)))

;; The Athena JDBC driver doesn't support parameterized queries.
;; So go ahead and deparameterize all the statements for now.
(defmethod ddl/insert-rows-dml-statements :athena
  [driver table-identifier rows]
  (binding [driver/*compile-with-inline-parameters* true]
    ((get-method ddl/insert-rows-dml-statements :sql-jdbc/test-extensions) driver table-identifier rows)))

(doseq [[base-type sql-type] {:type/BigInteger     "BIGINT"
                              :type/Boolean        "BOOLEAN"
                              :type/Date           "TIMESTAMP"
                              :type/DateTime       "TIMESTAMP"
                              :type/DateTimeWithTZ "TIMESTAMP"
                              :type/Decimal        "DECIMAL"
                              :type/Float          "DOUBLE"
                              :type/Integer        "INT"
                              :type/Text           "STRING"
                              :type/UUID           "UUID"
                              :type/Time           "TIMESTAMP"}]
  (defmethod sql.tx/field-base-type->sql-type [:athena base-type] [_ _] sql-type))

;; TODO: Maybe make `add-fk-sql a noop
(defmethod sql.tx/add-fk-sql :athena [& _] nil)

;; Athena can only execute one statement at a time
(defmethod execute/execute-sql! :athena [& args]
  (apply execute/sequentially-execute-sql! args))

;; Might have to figure out autoincrement settings
(defmethod sql.tx/pk-sql-type :athena [_] "INTEGER")

(defmethod load-data/row-xform :athena
  [_driver _dbdef tabledef]
  ;; Add IDs to the sample data
  (load-data/maybe-add-ids-xform tabledef))

;;; 200 is super slow, and the query ends up being too large around 500 rows... for some reason the same dataset orders
;;; table (about 17k rows) stalls out at row 10,000 when loading them 200 at a time. It works when you do 400 at a time
;;; tho. This is just going to have to be ok for now.
(defmethod load-data/chunk-size :athena
  [_driver _dbdef _tabledef]
  400)

(defn- server-connection-details []
  (tx/dbdef->connection-details :athena :server nil))

(defn- server-connection-spec []
  (sql-jdbc.conn/connection-details->spec :athena (server-connection-details)))

(defn- existing-databases* []
  (sql-jdbc.execute/do-with-connection-with-options
   :athena
   (server-connection-spec)
   nil
   (fn [^java.sql.Connection conn]
     (let [dbs (into #{} (map :database_name) (jdbc/query {:connection conn} ["SHOW DATABASES;"]))]
       (log/infof "The following Athena databases have already been created: %s" (pr-str (sort dbs)))
       dbs))))

(defonce ^:private cached-existing-databases (atom nil))

(defn- existing-databases
  "Set of databases that already exist in our S3 bucket, so we don't try to create them a second time."
  []
  (or @cached-existing-databases
      (u/prog1 (existing-databases*)
        (reset! cached-existing-databases <>))))

(def ^:private ^:dynamic *allow-database-creation*
  "Whether to allow database creation. This is normally disabled to prevent people from accidentally loading duplicate
  data into Athena or somehow stomping over existing databases and breaking CI. If you want to create a new dataset,
  change this flag to true and run your code again so the data will be loaded normally. Set it back to false when
  you're done."
  false)

(defmethod tx/create-db! :athena
  [driver {:keys [database-name], :as db-def} & options]
  (let [database-name (ddl.i/format-name driver database-name)]
    (cond
      (contains? (existing-databases) database-name)
      (log/infof "Athena database %s already exists, skipping creation" (pr-str database-name))

      (not *allow-database-creation*)
      (log/fatalf (str "Athena database creation is disabled: not creating database %s. Tests will likely fail.\n"
                       "See metabase.test.data.athena/*allow-database-creation* for more info.")
                  (pr-str database-name))

      :else
      (binding [;; This tells Athena to convert `timestamp with time zone` literals to `timestamp` because otherwise it gets
                ;; very fussy! See [[athena/*loading-data*]] for more info.
                athena/*loading-data*  true]
        (log/infof "Creating Athena database %s" (pr-str database-name))
        (reset! cached-existing-databases nil)
        ;; call the default impl for SQL JDBC drivers
        (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)))))

(defmethod tx/sorts-nil-first? :athena
  [_driver _base-type]
  false)

(mu/defmethod tx/dataset-already-loaded? :athena
  [driver                              :- :keyword
   {:keys [database-name], :as _dbdef} :- [:map [:database-name :string]]]
  (let [physical-name (ddl.i/format-name driver database-name)]
    (contains? (existing-databases) physical-name)))
