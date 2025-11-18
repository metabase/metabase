(ns metabase-enterprise.workspaces.sync
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]))

;; this ns will be probably moved

;; will figure out whether that is a good idea soonish
;; this may be tricky!!!
(defn  sync-transform-mirror!
  "TODO"
  [database schema-name table-name]
  (let [driver (driver.u/database->driver database)
        table  {:name   table-name
                :schema schema-name}]
    (if (driver/table-exists? driver database table)
      (let [created (sync-tables/create-or-reactivate-table! database table)]
        (doto created sync/sync-table!))
      (throw (ex-info "Can not find transform mirror table"
                      {:schema schema-name
                       :table table-name})))))