(ns metabase.sync.sync-metadata.sync-timezone
  (:require
   [java-time :as t]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.database :refer [Database]]
   [metabase.sync.interface :as i]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [schema.core :as s]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(s/defn sync-timezone!
  "Query `database` for its current time to determine its timezone. The results of this function are used by the sync
  process to update the timezone if it's different."
  [database :- i/DatabaseInstance]
  (let [driver  (driver.u/database->driver database)
        zone-id (driver/db-default-timezone driver database)]
    (log/infof (i18n/trs "{0} database {1} default timezone is {2}" driver (pr-str (:id database)) (pr-str zone-id)))
    ;; validate the timezone
    (when zone-id
      (try
        (t/zone-id zone-id)
        (catch Throwable e
          (throw (ex-info (i18n/trs "Invalid timezone {0}: {1}" (pr-str zone-id) (ex-message e))
                          {:zone-id zone-id}
                          e)))))
    (when-not (= zone-id (:timezone database))
      (t2/update! Database (:id database) {:timezone zone-id}))
    {:timezone-id zone-id}))
