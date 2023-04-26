(ns metabase.sync.sync-metadata.dbms-version
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.database :refer [Database]]
   [metabase.sync.interface :as i]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]))

(def DBMSVersion
  "Schema for the expected output of `describe-table-fks`."
  {:version  su/NonBlankString
   s/Keyword s/Any})

(s/defn sync-dbms-version!
  "Get the DBMS version as provided by the driver and save it in the Database."
  [database :- i/DatabaseInstance] :- (s/maybe DBMSVersion)
  (let [driver  (driver.u/database->driver database)
        version (driver/dbms-version driver database)]
    (when (not= version (:dbms_version database))
      (t2/update! Database (:id database) {:dbms_version version}))
    version))
