(ns metabase.sync.sync-metadata.sync-timezone
  (:require
   [java-time :as t]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.expression.temporal
    :as lib.schema.expression.temporal]
   [metabase.sync.interface :as i]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn sync-timezone! :- [:maybe [:map [:timezone-id [:maybe [:or
                                                                ::lib.schema.expression.temporal/timezone-id
                                                                ;; MySQL allows offset strings (metabase#34050)
                                                                [:re #"^[+-](\d+):(\d+)$"]]]]]]
  "Query `database` for its current time to determine its timezone. The results of this function are used by the sync
  process to update the timezone if it's different."
  [database :- i/DatabaseInstance]
  (let [driver  (driver.u/database->driver database)
        zone-id (driver/db-default-timezone driver database)]
    (when zone-id
      (try
        (t/zone-id zone-id)
        (catch Throwable e
          (throw (ex-info (format "Error syncing timezone: invalid timezone: %s" (ex-message e))
                          {:driver driver, :zone-id zone-id}
                          e)))))
    (when-not (= zone-id (:timezone database))
      (t2/update! :model/Database (:id database) {:timezone zone-id}))
    {:timezone-id zone-id}))
