(ns metabase.sync.sync-metadata.sync-timezone
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.models.database :refer [Database]]
            [metabase.sync.interface :as i]
            [schema.core :as s]
            [toucan.db :as db])
  (:import org.joda.time.DateTime))

;; TIMEZONE FIXME - no Joda Time
(defn- extract-time-zone [^DateTime dt]
  (-> dt .getChronology .getZone .getID))

(s/defn sync-timezone!
  "Query `database` for its current time to determine its timezone. The results of this function are used by the sync
  process to update the timezone if it's different."
  [database :- i/DatabaseInstance]
  (let [driver  (driver.u/database->driver database)
        zone-id (or (driver/db-default-timezone driver database)
                    (some-> (driver/current-db-time driver database) extract-time-zone))]
    (when-not (= zone-id (:timezone database))
      (db/update! Database (:id database) {:timezone zone-id}))
    {:timezone-id zone-id}))
