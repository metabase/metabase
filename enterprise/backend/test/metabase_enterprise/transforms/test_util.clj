(ns metabase-enterprise.transforms.test-util
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDateTime ZonedDateTime ZoneId)))

(set! *warn-on-reflection* true)

(defn drop-target!
  "Drop transform target `target` and clean up its metadata.
   `target` can be a string or a map. If `target` is a string, type :table is assumed."
  [target]
  (let [target (if (map? target)
                 target
                 ;; assume this is just a plain table name
                 {:type :table, :name target})
        driver driver/*driver*]
    (binding [api/*is-superuser?* true
              api/*current-user-id* (mt/user->id :crowberto)]
      ;; Drop the actual table/view from the database
      (-> (driver/drop-transform-target! driver (mt/db) target)
          u/ignore-exceptions)
      ;; Also clean up the Metabase metadata
      (-> (t2/delete! :model/Table :name (:name target) :db_id (:id (mt/db)))
          u/ignore-exceptions))))

(defn gen-table-name
  "Generate a random table name with prefix `table-name-prefix`."
  [table-name-prefix]
  (if (map? table-name-prefix)
    ;; table-name-prefix is a whole target, randomize the name
    (update table-name-prefix :name gen-table-name)
    (str table-name-prefix \_ (str/replace (str (random-uuid)) \- \_))))

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
