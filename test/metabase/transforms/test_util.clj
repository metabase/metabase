(ns metabase.transforms.test-util
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDateTime ZonedDateTime ZoneId)))

(set! *warn-on-reflection* true)

(defn drop-target!
  "Drop transform target `target` and clean up its metadata.
   `target` can be a string or a map. If `target` is a string, type :table is assumed.
   If no schema is provided, uses the driver's default schema."
  [target]
  (let [driver driver/*driver*
        target (cond-> (if (map? target)
                         target
                         ;; assume this is just a plain table name
                         {:type :table, :name target})
                 (and (nil? (:schema target)) (isa? driver/hierarchy driver/*driver* :sql))
                 (u/assoc-dissoc :schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))))]
    (binding [api/*is-superuser?* true
              api/*current-user-id* (mt/user->id :crowberto)]
      ;; Drop the actual table/view from the database
      (try
        (driver/drop-transform-target! driver (mt/db) target)
        (catch Exception e
          (log/warnf e "Failed to drop transform target table %s.%s for driver %s"
                     (:schema target) (:name target) driver)))
      ;; Also clean up the Metabase metadata
      (try
        (t2/delete! :model/Table :name (:name target) :db_id (:id (mt/db)))
        (catch Exception e
          (log/warnf e "Failed to delete Table metadata for %s" (:name target)))))))

(defn gen-table-name
  "Generate a random table name with prefix `table-name-prefix`."
  [table-name-prefix]
  (if (map? table-name-prefix)
    ;; table-name-prefix is a whole target, randomize the name
    (update table-name-prefix :name gen-table-name)
    ;; Strip off some of the randomness, so that less tests run afoul of the length limit.
    (let [table-name (str table-name-prefix \_ (subs (str/replace (str (random-uuid)) \- \_) 0 26))]
      ;; this caught me out when testing, was annoying to debug - hence assert
      (assert (< (count table-name) (driver/table-name-length-limit driver/*driver*))
              "chosen identifier prefix should not cause identifiers longer than the driver/table-name-length-limit")
      table-name)))

(defmacro with-transform-cleanup!
  "Execute `body`, then delete any new :model/Transform instances and drop tables generated from `table-gens`."
  [table-gens & body]
  (assert (seqable? table-gens) "need a seqable? as table-gens")
  (assert (even? (count table-gens)) "need an even number of forms in table-gens")
  (if-let [[sym prefix & more-gens] (seq table-gens)]
    `(let [target# (gen-table-name ~prefix)
           ~sym target#]
       (try
         (with-transform-cleanup! ~more-gens ~@body)
         (finally
           (drop-target! target#))))
    `(mt/with-model-cleanup [:model/Transform]
       ~@body)))

(defn table-rows
  [table-name]
  (->>
   (mt/rows (mt/process-query {:database (mt/id)
                               :query    {:source-table (t2/select-one-pk :model/Table :name table-name)}
                               :type     :query}))
   (map (fn [x] (if (= :mongo driver/*driver*) (rest x) x)))))

(defn parse-timestamp
  "Parse a local datetime and convert it to a ZonedDateTime in the default timezone."
  ^ZonedDateTime [timestamp-string]
  (-> timestamp-string
      LocalDateTime/parse
      (.atZone (ZoneId/systemDefault))))

(defn parse-instant
  "Parse a local datetime and convert it to an Instant in the default timezone."
  ^Instant [timestamp-string]
  (-> timestamp-string parse-timestamp .toInstant))

(defn utc-timestamp
  "Parse a local datetime and convert it to a string encoding a ZonedDateTime in the default timezone."
  ^String [timestamp-string]
  (-> timestamp-string parse-instant str))

(defn wait-for-table
  "Wait for a table to appear in metadata, with timeout."
  [^String table-name timeout-ms]
  (let [timer (u/start-timer)]
    (loop []
      (let [table (t2/select-one :model/Table :name table-name)
            fields (t2/select :model/Field :table_id (:id table))]
        (cond
          (and table (seq fields)) table
          (> (u/since-ms timer) timeout-ms)
          (throw (ex-info (format "Table %s did not appear after %dms" table-name timeout-ms)
                          {:table-name table-name :timeout-ms timeout-ms}))
          :else (do (Thread/sleep 100)
                    (recur)))))))

(defn test-run
  [transform-id]
  (let [resp      (mt/user-http-request :crowberto :post 202 (format "transform/%s/run" transform-id))
        timeout-s 10 ; 10 seconds is our timeout to finish execution and sync
        limit     (+ (System/currentTimeMillis) (* timeout-s 1000))]
    (is (=? {:message "Transform run started"}
            resp))
    (loop [last-resp nil]
      (when (> (System/currentTimeMillis) limit)
        (throw (ex-info (str "Transform run timed out after " timeout-s " seconds") {:resp last-resp})))
      (let [resp   (mt/user-http-request :crowberto :get 200 (format "transform/%s" transform-id))
            status (some-> resp :last_run :status keyword)]
        (when-not (contains? #{:started :succeeded} status)
          (throw (ex-info (str "Transform run failed with status " status) {:resp resp :status status})))
        (when-not (some? (:table resp))
          (Thread/sleep 100)
          (recur resp))))))

(defn wait-for-transform-completion
  "Wait for a transform run to complete without triggering a new run.
   Polls the transform status until it succeeds or times out."
  [transform-id timeout-ms]
  (let [start-time (u/start-timer)]
    (loop []
      (when (> (u/since-ms start-time) timeout-ms)
        (throw (ex-info (format "Transform %d did not complete after %dms" transform-id timeout-ms)
                        {:transform-id transform-id :timeout-ms timeout-ms})))
      (let [resp (mt/user-http-request :crowberto :get 200 (format "transform/%d" transform-id))
            status (some-> resp :last_run :status keyword)]
        (case status
          :succeeded resp
          (:started :running) (do (Thread/sleep 100) (recur))
          (throw (ex-info (format "Transform run failed with status %s" status)
                          {:resp resp :status status})))))))

(defn get-test-schema
  "Get the schema from the products table in the test dataset.
   This is needed for databases like BigQuery that require a schema/dataset."
  []
  (t2/select-one-fn :schema :model/Table (mt/id :transforms_products)))

(defn default-schema-or-public
  "Returns the driver's default schema (e.g., 'dbo' for SQL Server) or 'public' as fallback.
   Useful for tests that need to create tables with a schema matching transform targets."
  []
  (or (when (get-method driver.sql/default-schema driver/*driver*)
        (driver.sql/default-schema driver/*driver*))
      "public"))

(defmulti delete-schema!
  "Deletes a schema."
  {:arglists '([driver db schema])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod delete-schema! :default [_driver _db _schema] nil)

(doseq [driver [:postgres :snowflake]]
  (defmethod delete-schema! driver [driver db schema]
    (let [conn-spec (driver/connection-spec driver db)
          sql [[(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;" schema)]]]
      (driver/execute-raw-queries! driver/*driver* conn-spec sql))))

(defmethod delete-schema! :sqlserver [driver db schema]
  (let [conn-spec (driver/connection-spec driver db)
        sql [[(format "IF EXISTS (SELECT * FROM sys.schemas WHERE name = '%s') DROP SCHEMA [%s];" schema schema)]]]
    (driver/execute-raw-queries! driver/*driver* conn-spec sql)))

(defmethod delete-schema! :clickhouse [driver db schema]
  (let [conn-spec (driver/connection-spec driver db)
        sql [[(format "DROP DATABASE IF EXISTS `%s`;" schema)]]]
    (driver/execute-raw-queries! driver/*driver* conn-spec sql)))
