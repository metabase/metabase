(ns metabase.llm.db
  "Application database queries for the LLM module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(mu/defn database-engine :- [:maybe :keyword]
  "The engine of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
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

(mu/defn active-tables-matching :- [:sequential ::warehouse-schema.schema/table.row]
  "The active Tables of the Database with `database-id` matching one of `tables` (each a map of `:table` and
  optional `:schema`), by case-insensitive name/schema."
  [database-id :- ::lib.schema.id/database
   tables      :- [:sequential [:map {:closed true}
                                [:table  :string]
                                [:schema {:optional true} [:maybe :string]]]]]
  (t2/select :model/Table
             {:where [:and
                      [:= :db_id database-id]
                      [:= :active true]
                      (into [:or] (map table-match-clause) tables)]}))

(mu/defn visible-tables :- [:sequential ::warehouse-schema.schema/table.row]
  "The active, visible Tables among `table-ids` of the Database with `database-id` that `user-id` (or a
  superuser) can access for querying, requiring unrestricted view-data and query-builder-or-native create
  permissions."
  [table-ids   :- [:set ::lib.schema.id/table]
   database-id :- ::lib.schema.id/database
   user-id     :- [:maybe ::lib.schema.id/user]
   superuser?  :- :boolean]
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

(mu/defn unarchived-cards :- [:sequential ::queries.schema/card.row]
  "The unarchived Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select :model/Card :id [:in card-ids] :archived false))

(mu/defn fields :- [:sequential ::warehouse-schema.schema/field]
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids]))

(def ^:private FieldNamesAndTable
  "Rows returned by [[field-names-and-tables]]."
  (mut/select-keys ::warehouse-schema.schema/field [:id :name :table_id]))

(mu/defn field-names-and-tables :- [:sequential FieldNamesAndTable]
  "The id, name, and Table id of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select [:model/Field :id :name :table_id] :id [:in field-ids]))

(mu/defn field-fingerprints :- [:map-of ::lib.schema.id/field [:maybe :map]]
  "A map of Field id to fingerprint for the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select-pk->fn :fingerprint :model/Field :id [:in field-ids]))
