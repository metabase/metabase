(ns metabase.llm.db
  "Application database queries for the LLM module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn database-engine
  "The engine of the Database with `database-id`, or nil."
  [database-id]
  (t2/select-one-fn :engine :model/Database :id database-id))

(defn- table-match-clause
  "Match a Table by name and, when given, schema, both case-insensitively."
  [{:keys [schema table]}]
  (let [table-lower (u/lower-case-en table)]
    (if schema
      [:and
       [:= [:lower :name] table-lower]
       [:= [:lower :schema] (u/lower-case-en schema)]]
      [:= [:lower :name] table-lower])))

(defn active-tables-matching
  "The active Tables of the Database with `database-id` matching one of `tables` (each a map of `:table` and
  optional `:schema`), by case-insensitive name/schema."
  [database-id tables]
  (t2/select :model/Table
             {:where [:and
                      [:= :db_id database-id]
                      [:= :active true]
                      (into [:or] (map table-match-clause) tables)]}))

(defn visible-tables
  "The active, visible Tables among `table-ids` of the Database with `database-id` that `user-id` (or a
  superuser) can access for querying, requiring unrestricted view-data and query-builder-or-native create
  permissions."
  [table-ids database-id user-id superuser?]
  (let [{:keys [clause with]} (mi/visible-filter-clause
                               :model/Table :id
                               {:user-id user-id, :is-superuser? superuser?}
                               {:perms/view-data      :unrestricted
                                :perms/create-queries :query-builder-and-native})]
    (t2/select :model/Table
               :id [:in table-ids]
               :db_id database-id
               :active true
               :visibility_type nil
               (cond-> {:where clause}
                 with (assoc :with with)))))

(defn unarchived-cards
  "The unarchived Cards with `card-ids`."
  [card-ids]
  (t2/select :model/Card :id [:in card-ids] :archived false))

(defn fields
  "The Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field :id [:in field-ids]))

(defn field-names-and-tables
  "The id, name, and Table id of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :name :table_id] :id [:in field-ids]))

(defn field-fingerprints
  "A map of Field id to fingerprint for the Fields with `field-ids`."
  [field-ids]
  (t2/select-pk->fn :fingerprint :model/Field :id [:in field-ids]))
