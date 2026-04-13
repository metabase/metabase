(ns metabase.driver.clickhouse-version
  "Provides the info about the ClickHouse version. Extracted from the main clickhouse.clj file,
   as both Driver and QP overrides require access to it, avoiding circular dependencies."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]))

(set! *warn-on-reflection* true)

;; cache the results for 60 minutes;
;; TTL is here only to eventually clear out old entries/keep it from growing too large
(def ^:private default-cache-ttl (* 60 60 1000))

(def ^:private clickhouse-version-query
  (str "WITH s AS (SELECT version() AS ver, splitByChar('.', ver) AS verSplit) "
       "SELECT s.ver, toInt32(verSplit[1]), toInt32(verSplit[2]) FROM s"))

(def ^:private ^{:arglists '([database])} get-clickhouse-version
  (memoize/ttl
   ^{:clojure.core.memoize/args-fn (fn [[database]] (driver.conn/effective-details database))}
   (fn [database]
     (sql-jdbc.execute/do-with-connection-with-options
      :clickhouse
      (sql-jdbc.conn/db->pooled-connection-spec database)
      nil
      (fn [^java.sql.Connection conn]
        (with-open [ver-stmt   (.createStatement conn)
                    ver-rset   (.executeQuery ver-stmt clickhouse-version-query)
                    cloud-stmt (.createStatement conn)
                    cloud-rset (.executeQuery cloud-stmt "SELECT value='1' FROM system.settings WHERE name='cloud_mode'")]
          (cond-> nil
            (.next ver-rset)
            (assoc :version          (.getString ver-rset 1)
                   :semantic-version {:major (.getInt ver-rset 2)
                                      :minor (.getInt ver-rset 3)})

            (.next cloud-rset)
            (assoc :cloud (.getBoolean cloud-rset 1)))))))
   :ttl/threshold default-cache-ttl))

(defmethod driver/dbms-version :clickhouse
  [_driver db]
  (get-clickhouse-version db))

(defn dbms-version
  "Returns dbms version from a db that may be a snake-hating-map"
  [db]
  ((some-fn :dbms-version :dbms_version) db))

(defn is-at-least?
  "Is ClickHouse version at least `major.minor` (e.g., 24.4)?"
  ([major minor]
   ;; used from the QP overrides; we don't have access to the DB object
   (is-at-least? major minor (driver-api/database (driver-api/metadata-provider))))
  ([major minor db]
   ;; used from the Driver overrides; we have access to the DB object
   (let [semantic (-> db dbms-version :semantic-version)]
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
