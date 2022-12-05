(ns metabase.sync.sync-metadata.dbms-version
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.models.database :refer [Database]]
            [metabase.sync.interface :as i]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn sync-dbms-version!
  "Get the DBMS version as provided by the driver and save it in the Database."
  [database :- i/DatabaseInstance]
  (let [driver  (driver.u/database->driver database)
        version (driver/dbms-version driver database)]
    (when (not= version (:dbms_version database))
      (db/update! Database (:id database) {:dbms_version version}))
    version))
