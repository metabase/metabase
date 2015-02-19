(ns metabase.driver.postgres.sync
  (:require [metabase.db :refer :all]
            (metabase.models [table :refer [Table]]
                             [database :refer [Database]])))

(defn sync-tables [{:keys [id table-names] :as database}]
  (dorun (map (fn [table-name]
                (or (exists? Table :db_id id :name table-name)
                    (ins Table
                      :db_id id
                      :name table-name
                      :active true)))
              @table-names)))
