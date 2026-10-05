(ns metabase.sync.sync-metadata.default-schema
  (:require
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.util :as driver.u]
   [metabase.sync.db :as sync.db]
   [metabase.sync.interface :as i]
   [metabase.util.malli :as mu]))

(mu/defn sync-default-schema! :- [:map [:default-schema [:maybe :string]]]
  "Ask the driver which schema unqualified table references use and persist it on `database`."
  [database :- i/DatabaseInstance]
  (let [driver         (driver.u/database->driver database)
        default-schema (driver.sql/default-schema driver database)]
    (when-not (= default-schema (:default_schema database))
      (sync.db/update-database! (:id database) {:default_schema default-schema}))
    {:default-schema default-schema}))
