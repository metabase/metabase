(ns metabase.sync.sync-metadata.fks
  "Logic for updating FK properties of Fields from metadata fetched from a physical DB."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.sync
             [fetch-metadata :as fetch-metadata]
             [interface :as i]
             [util :as sync-util]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private FKRelationshipObjects
  "Relevant objects for a foreign key relationship."
  {:source-field i/FieldInstance
   :dest-table   i/TableInstance
   :dest-field   i/FieldInstance})

(s/defn ^:private fetch-fk-relationship-objects :- (s/maybe FKRelationshipObjects)
  "Fetch the Metabase objects (Tables and Fields) that are relevant to a foreign key relationship described by FK."
  [database :- i/DatabaseInstance, table :- i/TableInstance, fk :- i/FKMetadataEntry]
  (when-let [source-field (db/select-one Field
                            :table_id           (u/get-id table)
                            :%lower.name        (str/lower-case (:fk-column-name fk))
                            :fk_target_field_id nil
                            :active             true
                            :visibility_type    [:not= "retired"])]
    (when-let [dest-table (db/select-one Table
                            :db_id           (u/get-id database)
                            :%lower.name     (str/lower-case (-> fk :dest-table :name))
                            :%lower.schema   (when-let [schema (-> fk :dest-table :schema)]
                                               (str/lower-case schema))
                            :active          true
                            :visibility_type nil)]
      (when-let [dest-field (db/select-one Field
                              :table_id           (u/get-id dest-table)
                              :%lower.name        (str/lower-case (:dest-column-name fk))
                              :active             true
                              :visibility_type    [:not= "retired"])]
        {:source-field source-field
         :dest-table   dest-table
         :dest-field   dest-field}))))


(s/defn ^:private mark-fk!
  [database :- i/DatabaseInstance, table :- i/TableInstance, fk :- i/FKMetadataEntry]
  (when-let [{:keys [source-field dest-table dest-field]} (fetch-fk-relationship-objects database table fk)]
    (log/info (u/format-color 'cyan "Marking foreign key from %s %s -> %s %s"
                (sync-util/name-for-logging table)
                (sync-util/name-for-logging source-field)
                (sync-util/name-for-logging dest-table)
                (sync-util/name-for-logging dest-field)))
    (db/update! Field (u/get-id source-field)
      :special_type       :type/FK
      :fk_target_field_id (u/get-id dest-field))
    true))


(s/defn sync-fks-for-table!
  "Sync the foreign keys for a specific TABLE."
  ([table :- i/TableInstance]
   (sync-fks-for-table! (table/database table) table))
  ([database :- i/DatabaseInstance, table :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging table))
     (let [fks-to-update (fetch-metadata/fk-metadata database table)]
       {:total-fks   (count fks-to-update)
        :updated-fks (sync-util/sum-numbers (fn [fk]
                                              (if (mark-fk! database table fk)
                                                1
                                                0))
                                            fks-to-update)}))))

(s/defn sync-fks!
  "Sync the foreign keys in a DATABASE. This sets appropriate values for relevant Fields in the Metabase application DB
   based on values from the `FKMetadata` returned by `describe-table-fks`."
  [database :- i/DatabaseInstance]
  (reduce (fn [update-info table]
            (let [table-fk-info (sync-fks-for-table! database table)]
              (if (instance? Exception table-fk-info)
                (update update-info :total-failed inc)
                (merge-with + update-info table-fk-info))))
          {:total-fks    0
           :updated-fks  0
           :total-failed 0}
          (sync-util/db->sync-tables database)))
