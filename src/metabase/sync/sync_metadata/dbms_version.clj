(ns metabase.sync.sync-metadata.dbms-version
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.db :as sync.db]
   [metabase.sync.interface :as i]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

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
      (sync.db/update-database! (:id database) {:dbms_version version}))
    version))
