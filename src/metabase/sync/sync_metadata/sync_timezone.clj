(ns metabase.sync.sync-metadata.sync-timezone
  (:require [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.models.database :refer [Database]]
            [metabase.sync.interface :as i]
            [schema.core :as s]
            [toucan.db :as db])
  (:import org.joda.time.DateTime))

(defn- extract-time-zone [^DateTime dt]
  (-> dt .getChronology .getZone .getID))

(s/defn sync-timezone!
  "Query `DATABASE` for it's current time to determine it's
  timezone. Update that timezone if it's different."
  [database :- i/DatabaseInstance]
  (try
    (let [tz-id (some-> database
                        driver/->driver
                        (driver/current-db-time database)
                        extract-time-zone)]
      (when-not (= tz-id (:timezone database))
        (db/update! Database (:id database) {:timezone tz-id}))
      {:timezone-id tz-id})
    (catch Exception e
      (log/warn e "Error syncing database timezone"))))
