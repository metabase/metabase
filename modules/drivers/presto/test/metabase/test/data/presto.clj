(ns metabase.test.data.presto
  "Presto driver test extensions."
  (:require [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase.driver.presto :as presto]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]])
  (:import java.util.Date))

(sql.tx/add-test-extensions! :presto)

;;; IDriverTestExtensions implementation

;; in the past, we had to manually update our Docker image and add a new catalog for every new dataset definition we
;; added. That's insane. Just use the `test-data` catalog and put everything in that, and use
;; `db-qualified-table-name` like everyone else.
(def ^:private test-catalog-name "test-data")

(defmethod tx/dbdef->connection-details :presto [_ context {:keys [database-name]}]
  (merge {:host    (tx/db-test-env-var-or-throw :presto :host "localhost")
          :port    (tx/db-test-env-var-or-throw :presto :port "8080")
          :user    (tx/db-test-env-var-or-throw :presto :user "metabase")
          :ssl     false
          :catalog test-catalog-name}))

(defmethod sql.tx/qualified-name-components :presto
  ;; use the default schema from the in-memory connector
  ([_ db-name]                       [test-catalog-name "default"])
  ([_ db-name table-name]            [test-catalog-name "default" (tx/db-qualified-table-name db-name table-name)])
  ([_ db-name table-name field-name] [test-catalog-name "default" (tx/db-qualified-table-name db-name table-name) field-name]))

(defmethod sql.tx/qualify+quote-name :presto [driver & names]
  (apply #'presto/quote+combine-names (apply sql.tx/qualified-name-components driver names)))

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

(defmethod sql.tx/create-table-sql :presto  [driver {:keys [database-name]} {:keys [table-name], :as tabledef}]
  (let [field-definitions (conj (:field-definitions tabledef) {:field-name "id", :base-type  :type/Integer})
        dummy-values      (map (comp field-base-type->dummy-value :base-type) field-definitions)
        columns           (map :field-name field-definitions)]
    ;; Presto won't let us use the `CREATE TABLE (...)` form, but we can still do it creatively if we select the right
    ;; types out of thin air
    (format "CREATE TABLE %s AS SELECT * FROM (VALUES (%s)) AS t (%s) WHERE 1 = 0"
            (sql.tx/qualify+quote-name driver database-name table-name)
            (str/join \, dummy-values)
            (str/join \, (map #'presto/quote-name columns)))))

(defmethod sql.tx/drop-table-if-exists-sql :presto [driver {:keys [database-name]} {:keys [table-name]}]
  (str "DROP TABLE IF EXISTS " (sql.tx/qualify+quote-name driver database-name table-name)))

(defn- insert-sql [driver {:keys [database-name]} {:keys [table-name], :as tabledef} rows]
  (let [field-definitions (conj (:field-definitions tabledef) {:field-name "id"})
        columns           (map (comp keyword :field-name) field-definitions)
        [query & params]  (-> (apply h/columns columns)
                              (h/insert-into (apply hsql/qualify
                                                    (sql.tx/qualified-name-components driver database-name table-name)))
                              (h/values rows)
                              (hsql/format :allow-dashed-names? true, :quoting :ansi))]
    (if (nil? params)
      query
      (unprepare/unprepare (cons query params) :quote-escape "'", :iso-8601-fn :from_iso8601_timestamp))))

(defmethod tx/create-db! :presto
  [driver {:keys [table-definitions database-name] :as dbdef} & {:keys [skip-drop-db?]}]
  (let [details  (tx/dbdef->connection-details driver :db dbdef)
        execute! (partial #'presto/execute-presto-query! details)]
    (doseq [tabledef table-definitions
            :let     [rows       (:rows tabledef)
                      ;; generate an ID for each row because we don't have auto increments
                      keyed-rows (map-indexed (fn [i row] (conj row (inc i))) rows)
                      ;; make 100 rows batches since we have to inline everything
                      batches    (partition 100 100 nil keyed-rows)]]
      (when-not skip-drop-db?
        (execute! (sql.tx/drop-table-if-exists-sql driver dbdef tabledef)))
      (execute! (sql.tx/create-table-sql driver dbdef tabledef))
      (doseq [batch batches]
        (execute! (insert-sql driver dbdef tabledef batch))))))

(defmethod tx/format-name :presto [_ s]
  (str/lower-case s))

;; FIXME Presto actually has very good timezone support
(defmethod tx/has-questionable-timezone-support? :presto [_] true)
