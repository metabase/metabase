(ns metabase.test.data.redshift
  (:require
   [clojure.string :as str]
   [java-time :as t]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.test-util.unique-prefix :as sql.tu.unique-prefix]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmethod tx/supports-time-type? :redshift [_driver] false)

;; we don't need to add test extensions here because redshift derives from Postgres and thus already has test
;; extensions

;; Time, UUID types aren't supported by redshift
(doseq [[base-type database-type] {:type/BigInteger "BIGINT"
                                   :type/Boolean    "BOOL"
                                   :type/Date       "DATE"
                                   :type/DateTime   "TIMESTAMP"
                                   :type/Decimal    "DECIMAL"
                                   :type/Float      "FLOAT8"
                                   :type/Integer    "INTEGER"
                                   ;; Use VARCHAR because TEXT in Redshift is VARCHAR(256)
                                   ;; https://docs.aws.amazon.com/redshift/latest/dg/r_Character_types.html#r_Character_types-varchar-or-character-varying
                                   ;; But don't use VARCHAR(MAX) either because of performance impact
                                   ;; https://docs.aws.amazon.com/redshift/latest/dg/c_best-practices-smallest-column-size.html
                                   :type/Text       "VARCHAR(1024)"}]
  (defmethod sql.tx/field-base-type->sql-type [:redshift base-type] [_ _] database-type))

;; If someone tries to run Time column tests with Redshift give them a heads up that Redshift does not support it
(defmethod sql.tx/field-base-type->sql-type [:redshift :type/Time]
  [_ _]
  (throw (UnsupportedOperationException. "Redshift does not have a TIME data type.")))

(def db-connection-details
  (delay {:host     (tx/db-test-env-var-or-throw :redshift :host)
          :port     (Integer/parseInt (tx/db-test-env-var-or-throw :redshift :port "5439"))
          :db       (tx/db-test-env-var-or-throw :redshift :db)
          :user     (tx/db-test-env-var-or-throw :redshift :user)
          :password (tx/db-test-env-var-or-throw :redshift :password)}))

(defmethod tx/dbdef->connection-details :redshift
  [& _]
  @db-connection-details)

(defn unique-session-schema []
  (str (sql.tu.unique-prefix/unique-prefix) "schema"))

(defmethod sql.tx/create-db-sql         :redshift [& _] nil)
(defmethod sql.tx/drop-db-if-exists-sql :redshift [& _] nil)

(defmethod sql.tx/pk-sql-type :redshift [_] "INTEGER IDENTITY(1,1)")

(defmethod sql.tx/qualified-name-components :redshift [& args]
  (apply tx/single-db-qualified-name-components (unique-session-schema) args))

;; don't use the Postgres implementation of `drop-db-ddl-statements` because it adds an extra statment to kill all
;; open connections to that DB, which doesn't work with Redshift
(defmethod ddl/drop-db-ddl-statements :redshift
  [& args]
  (apply (get-method ddl/drop-db-ddl-statements :sql-jdbc/test-extensions) args))

(defmethod sql.tx/drop-table-if-exists-sql :redshift
  [& args]
  (apply sql.tx/drop-table-if-exists-cascade-sql args))

;;; Create + destroy the schema used for this test session

(defn- reducible-result-set [^java.sql.ResultSet rset]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (with-open [rset rset]
        (loop [res init]
          (if (.next rset)
            (recur (rf res rset))
            res))))))

(defn- fetch-schemas [^java.sql.Connection conn]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (reduce ((map (fn [^java.sql.ResultSet rset]
                      (.getString rset "TABLE_SCHEM"))) rf)
              init
              (reducible-result-set (.. conn getMetaData getSchemas))))))

(def ^Long HOURS-BEFORE-EXPIRED-THRESHOLD
  "Number of hours that elapse before a persisted schema is considered expired."
  1)

(defn- classify-cache-schemas
  "Classifies the persistence cache schemas. Returns a map with where each value is a (possibly empty) sequence of
  schemas:

  {:old-style-cache    schemas without a `cache_info` table
   :recent             schemas with a `cache_info` table and are recently created
   :expired            `cache_info` table and created [[HOURS-BEFORE-EXPIRED-THRESHOLD]] ago
   :lacking-created-at should never happen, but if they lack an entry for `created-at`
   :unknown-error      if an error was thrown while classifying the schema}"
  [^java.sql.Connection conn schemas]
  (let [threshold (t/minus (t/instant) (t/hours HOURS-BEFORE-EXPIRED-THRESHOLD))]
    (with-open [stmt (.createStatement conn)]
      (let [classify! (fn [schema-name]
                        (try (let [sql (format "select value from %s.cache_info where key = 'created-at'"
                                               schema-name)
                                   rset (.executeQuery stmt sql)]
                               (if (.next rset)
                                 (let [date-string (.getString rset "value")
                                       created-at  (java.time.Instant/parse date-string)]
                                   (if (t/before? created-at threshold)
                                     :expired
                                     :recent))
                                 :lacking-created-at))
                             (catch com.amazon.redshift.util.RedshiftException e
                               (if (re-find #"relation .* does not exist" (or (ex-message e) ""))
                                 :old-style-cache
                                 (do (log/error "Error classifying cache schema" e)
                                     :unknown-error)))
                             (catch Exception e
                               (log/error "Error classifying cache schema" e)
                               :unknown-error)))]

        (group-by classify! schemas)))))

(defn- delete-old-schemas!
  "Remove unneeded schemas from redshift. Local databases are thrown away after a test run. Shared cloud instances do
  not have this luxury. Test runs can create schemas where models are persisted and nothing cleans these up, leading
  to redshift clusters hitting the max number of tables allowed."
  [^java.sql.Connection conn]
  (let [{old-convention   :old
         caches-with-info :cache}    (reduce (fn [acc s]
                                               (cond (sql.tu.unique-prefix/old-dataset-name? s)
                                                     (update acc :old conj s)
                                                     (str/starts-with? s "metabase_cache_")
                                                     (update acc :cache conj s)
                                                     :else acc))
                                             {:old [] :cache []}
                                             (fetch-schemas conn))
        {:keys [expired
                old-style-cache
                lacking-created-at]} (classify-cache-schemas conn caches-with-info)
        drop-sql                     (fn [schema-name] (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;"
                                                               schema-name))]
    ;; don't delete unknown-error and recent.
    (with-open [stmt (.createStatement conn)]
      (doseq [[collection fmt-str] [[old-convention "Dropping old data schema: %s"]
                                    [expired "Dropping expired cache schema: %s"]
                                    [lacking-created-at "Dropping cache without created-at info: %s"]
                                    [old-style-cache "Dropping old cache schema without `cache_info` table: %s"]]
              schema               collection]
        (log/infof fmt-str schema)
        (.execute stmt (drop-sql schema))))))

(defn- create-session-schema! [^java.sql.Connection conn]
  (with-open [stmt (.createStatement conn)]
    (doseq [^String sql [(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;" (unique-session-schema))
                         (format "CREATE SCHEMA \"%s\";"  (unique-session-schema))]]
      (log/info (u/format-color 'blue "[redshift] %s" sql))
      (.execute stmt sql))))

(defmethod tx/before-run :redshift
  [driver]
  (sql-jdbc.tx/do-with-connection-for-loading-test-data
   driver
   (sql-jdbc.conn/connection-details->spec driver @db-connection-details)
   (fn [conn]
     (delete-old-schemas! conn)
     (create-session-schema! conn))))

(defonce ^:private ^{:arglists '([driver connection metadata _ _])}
  original-filtered-syncable-schemas
  (get-method sql-jdbc.sync/filtered-syncable-schemas :redshift))

(def ^:dynamic *use-original-filtered-syncable-schemas-impl?*
  "Whether to use the actual prod impl for `filtered-syncable-schemas` rather than the special test one that only syncs
  the test schema."
  false)

;; replace the impl the `metabase.driver.redshift`. Only sync the current test schema and the external "spectrum"
;; schema used for a specific test.
(defmethod sql-jdbc.sync/filtered-syncable-schemas :redshift
  [driver conn metadata schema-inclusion-filters schema-exclusion-filters]
  (if *use-original-filtered-syncable-schemas-impl?*
    (original-filtered-syncable-schemas driver conn metadata schema-inclusion-filters schema-exclusion-filters)
    #{(unique-session-schema) "spectrum"}))
