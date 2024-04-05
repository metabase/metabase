(ns metabase.sync.sync-metadata.sync-timezone
  (:require
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.expression.temporal
    :as lib.schema.expression.temporal]
   [metabase.sync.interface :as i]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- validate-zone-id [driver zone-id]
  (when zone-id
    (when-not (some (fn [klass]
                      (instance? klass zone-id))
                    [String java.time.ZoneId java.time.ZoneOffset])
      (throw (ex-info (format (str "metabase.driver/db-default-timezone should return a String, java.time.ZoneId, or "
                                   "java.time.ZoneOffset, but the %s implementation returned ^%s %s")
                              (pr-str driver)
                              (.getCanonicalName (class zone-id))
                              (pr-str zone-id))
                      {:driver driver, :zone-id zone-id})))
    (when (string? zone-id)
      (try
        (t/zone-id zone-id)
        (catch Throwable e
          (throw (ex-info (trs "Invalid timezone {0}: {1}" (pr-str zone-id) (ex-message e))
                          {:zone-id zone-id}
                          e)))))
    zone-id))

(mu/defn sync-timezone! :- [:map [:timezone-id [:maybe ::lib.schema.expression.temporal/timezone-id]]]
  "Query `database` for its current time to determine its timezone. The results of this function are used by the sync
  process to update the timezone if it's different."
  [database :- i/DatabaseInstance]
  (let [driver  (driver.u/database->driver database)
        zone-id (driver/db-default-timezone driver database)]
    (log/infof "%s database %s default timezone is %s" driver (pr-str (:id database)) (pr-str zone-id))
    (validate-zone-id driver zone-id)
    (let [zone-id (some-> zone-id str)
          zone-id (if (= zone-id "Z") "UTC" zone-id)]
      (when-not (= zone-id (:timezone database))
        (t2/update! :model/Database (:id database) {:timezone zone-id}))
      {:timezone-id zone-id})))
