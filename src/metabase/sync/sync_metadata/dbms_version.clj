(ns metabase.sync.sync-metadata.dbms-version
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.interface :as i]
   [metabase.sync.persist :as persist]
   [metabase.sync.persist.appdb :as persist.appdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def DBMSVersion
  "Schema for the expected output of [[sync-dbms-version!]]."
  [:map
   [:version ms/NonBlankString]])

(mu/defn sync-dbms-version! :- [:maybe DBMSVersion]
  "Get the DBMS version as provided by the driver and save it in the Database."
  ([database :- i/DatabaseInstance]
   (sync-dbms-version! database persist.appdb/writer))
  ([database :- i/DatabaseInstance
    writer   :- [:fn #(satisfies? persist/SyncDatabaseWriter %)]]
   (let [driver  (driver.u/database->driver database)
         version (driver/dbms-version driver database)]
     (when (not= version (:dbms_version database))
       (persist/set-dbms-version! writer (:id database) version))
     version)))
