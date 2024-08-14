(ns metabase.sync.sync-metadata.dbms-version
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.database :refer [Database]]
   [metabase.sync.interface :as i]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def DBMSVersion
  "Schema for the expected output of [[sync-dbms-version!]]."
  [:map
   [:version ms/NonBlankString]])

(mu/defn sync-dbms-version! :- [:maybe DBMSVersion]
  "Get the DBMS version as provided by the driver and save it in the Database."
  [database :- i/DatabaseInstance]
  (let [driver  (driver.u/database->driver database)
        version (driver/dbms-version driver database)]
    (when (not= version (:dbms_version database))
      (t2/update! Database (:id database) {:dbms_version version}))
    version))
