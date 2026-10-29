(ns metabase-enterprise.semantic-layer-import.db
  "Application database queries for the semantic-layer-import module: what
  [[metabase-enterprise.semantic-layer-import.preflight]] reads of the instance's warehouse metadata to explain a
  reference the import would not bind. Every function here is one Toucan 2 query, over sync's own values rather than
  the names users gave things, since those are what a serdes import binds a reference to."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn active-tables :- [:sequential [:map
                                        [:schema [:maybe :string]]
                                        [:name   :string]]]
  "The schema and name of every active Table of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Table :schema :name] :db_id database-id :active true
             {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn active-table-schemas :- [:set [:maybe :string]]
  "The distinct schemas of the active Tables of the Database with `database-id`, nil for a Table with none."
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn-set :schema :model/Table :db_id database-id :active true
                    {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn field-names :- [:sequential :string]
  "The names of the Fields of the Table with `table-id`, active or not."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-vec :name :model/Field :table_id table-id
                    {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn field-active? :- [:maybe :boolean]
  "Whether the Field with `field-id` is active; nil when there is no such Field."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :active :model/Field :id field-id
                    {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))
