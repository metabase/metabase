"Provides the info about the ClickHouse version. Extracted from the main clickhouse.clj file,
 as both Driver and QP overrides require access to it, avoiding circular dependencies."
(ns metabase.driver.clickhouse-version
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]))

(set! *warn-on-reflection* true)

;; cache the results for 60 minutes;
;; TTL is here only to eventually clear out old entries/keep it from growing too large
(def ^:private default-cache-ttl (* 60 60 1000))

(def ^:private clickhouse-version-query
  (str "WITH s AS (SELECT version() AS ver, splitByChar('.', ver) AS verSplit) "
       "SELECT s.ver, toInt32(verSplit[1]), toInt32(verSplit[2]) FROM s"))

(def ^:private ^{:arglists '([db-details])} get-clickhouse-version
  (memoize/ttl
   (fn [db-details]
     (sql-jdbc.execute/do-with-connection-with-options
      :clickhouse
      (sql-jdbc.conn/connection-details->spec :clickhouse db-details)
      nil
      (fn [^java.sql.Connection conn]
        (with-open [stmt (.createStatement conn)
                    rset (.executeQuery stmt clickhouse-version-query)]
          (when (.next rset)
            {:version          (.getString rset 1)
             :semantic-version {:major (.getInt rset 2)
                                :minor (.getInt rset 3)}})))))
   :ttl/threshold default-cache-ttl))

(defmethod driver/dbms-version :clickhouse
  [_driver db]
  (get-clickhouse-version (:details db)))

(defn is-at-least?
  "Is ClickHouse version at least `major.minor` (e.g., 24.4)?"
  ([major minor]
   ;; used from the QP overrides; we don't have access to the DB object
   (is-at-least? major minor (lib.metadata/database (qp.store/metadata-provider))))
  ([major minor db]
   ;; used from the Driver overrides; we have access to the DB object
   (let [version  (driver/dbms-version :clickhouse db)
         semantic (:semantic-version version)]
     (driver.u/semantic-version-gte [(:major semantic) (:minor semantic)] [major minor]))))

(defn with-min
  "Execute `f` if the ClickHouse version is greater or equal to `major.minor` (e.g., 24.4);
   otherwise, execute `fallback-f`, if it's provided."
  ([major minor f]
   (with-min major minor f nil))
  ([major minor f fallback-f]
   (if (is-at-least? major minor)
     (f)
     (when (not (nil? fallback-f)) (fallback-f)))))
