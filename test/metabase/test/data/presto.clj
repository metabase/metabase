(ns metabase.test.data.presto
  (:require [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.driver.presto :as presto]
            [metabase.test.data.interface :as i]
            [metabase.util :as u])
  (:import java.util.Date
           metabase.driver.presto.PrestoDriver))

;;; IDriverTestExtensions implementation

(defn- database->connection-details [context {:keys [database-name]}]
  (merge {:host (i/db-test-env-var-or-throw :presto :host)
          :port (i/db-test-env-var-or-throw :presto :port)
          :user (i/db-test-env-var-or-throw :presto :user "metabase")
          :ssl  false}
         (when (= context :db)
           {:catalog database-name})))

(defn- qualify-name
  ;; we have to use the default schema from the in-memory connectory
  ([db-name]                       [db-name])
  ([db-name table-name]            [db-name "default" table-name])
  ([db-name table-name field-name] [db-name "default" table-name field-name]))

(defn- qualify+quote-name [& names]
  (apply #'presto/quote+combine-names (apply qualify-name names)))

(defn- field-base-type->dummy-value [field-type]
  ;; we need a dummy value for every base-type to make a properly typed SELECT statement
  (if (keyword? field-type)
    (case field-type
      :type/Boolean    "TRUE"
      :type/Integer    "1"
      :type/BigInteger "cast(1 AS bigint)"
      :type/Float      "1.0"
      :type/Decimal    "DECIMAL '1.0'"
      :type/Text       "cast('' AS varchar(255))"
      :type/Date       "current_timestamp" ; this should probably be a date type, but the test data begs to differ
      :type/DateTime   "current_timestamp"
      :type/Time       "cast(current_time as TIME)"
      "from_hex('00')") ; this might not be the best default ever
    ;; we were given a native type, map it back to a base-type and try again
    (field-base-type->dummy-value (#'presto/presto-type->base-type field-type))))

(defn- create-table-sql [{:keys [database-name]} {:keys [table-name], :as tabledef}]
  (let [field-definitions (conj (:field-definitions tabledef) {:field-name "id", :base-type  :type/Integer})
        dummy-values      (map (comp field-base-type->dummy-value :base-type) field-definitions)
        columns           (map :field-name field-definitions)]
    ;; Presto won't let us use the `CREATE TABLE (...)` form, but we can still do it creatively if we select the right
    ;; types out of thin air
    (format "CREATE TABLE %s AS SELECT * FROM (VALUES (%s)) AS t (%s) WHERE 1 = 0"
            (qualify+quote-name database-name table-name)
            (str/join \, dummy-values)
            (str/join \, (map #'presto/quote-name columns)))))

(defn- drop-table-if-exists-sql [{:keys [database-name]} {:keys [table-name]}]
  (str "DROP TABLE IF EXISTS " (qualify+quote-name database-name table-name)))

(defn- insert-sql [{:keys [database-name]} {:keys [table-name], :as tabledef} rows]
  (let [field-definitions (conj (:field-definitions tabledef) {:field-name "id"})
        columns           (map (comp keyword :field-name) field-definitions)
        [query & params]  (-> (apply h/columns columns)
                              (h/insert-into (apply hsql/qualify (qualify-name database-name table-name)))
                              (h/values rows)
                              (hsql/format :allow-dashed-names? true, :quoting :ansi))]
    (if (nil? params)
      query
      (unprepare/unprepare (cons query params) :quote-escape "'", :iso-8601-fn :from_iso8601_timestamp))))

(defn- create-db! [{:keys [table-definitions] :as dbdef}]
  (let [details (database->connection-details :db dbdef)]
    (doseq [tabledef table-definitions
            :let [rows       (:rows tabledef)
                  ;; generate an ID for each row because we don't have auto increments
                  keyed-rows (map-indexed (fn [i row] (conj row (inc i))) rows)
                  ;; make 100 rows batches since we have to inline everything
                  batches    (partition 100 100 nil keyed-rows)]]
      (#'presto/execute-presto-query! details (drop-table-if-exists-sql dbdef tabledef))
      (#'presto/execute-presto-query! details (create-table-sql dbdef tabledef))
      (doseq [batch batches]
        (#'presto/execute-presto-query! details (insert-sql dbdef tabledef batch))))))

;;; IDriverTestExtensions implementation

(u/strict-extend PrestoDriver
  i/IDriverTestExtensions
  (merge i/IDriverTestExtensionsDefaultsMixin
         {:engine                             (constantly :presto)
          :database->connection-details       (u/drop-first-arg database->connection-details)
          :create-db!                         (u/drop-first-arg create-db!)
          :default-schema                     (constantly "default")
          :format-name                        (u/drop-first-arg str/lower-case)
          ;; FIXME Presto actually has very good timezone support
          :has-questionable-timezone-support? (constantly true)}))
