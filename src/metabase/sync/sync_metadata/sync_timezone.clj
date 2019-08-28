(ns metabase.sync.sync-metadata.sync-timezone
  (:require [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.models.database :refer [Database]]
            [metabase.sync.interface :as i]
            [schema.core :as s]
            [toucan.db :as db])
  (:import org.joda.time.DateTime))

(defn- extract-time-zone [^DateTime dt]
  (-> dt .getChronology .getZone .getID))

(s/defn sync-timezone!
  "Query `database` for it' current time to determine its timezone. The results of this function are used by the sync
  process to update the timezone if it's different.

  Catches and logs Exceptions if querying for current timezone fails. Returns timezone as `{:timezone-id <timezone>}`
  upon success, `nil` if query failed."
  [database :- i/DatabaseInstance]
  (try
    (let [tz-id (some-> database
                        driver.u/database->driver
                        (driver/current-db-time database)
                        extract-time-zone)]
      (when-not (= tz-id (:timezone database))
        (db/update! Database (:id database) {:timezone tz-id}))
      {:timezone-id tz-id})
    (catch Exception e
      (log/warn e "Error syncing database timezone"))))
