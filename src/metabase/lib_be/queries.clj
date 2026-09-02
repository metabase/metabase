(ns metabase.lib-be.queries
  "Application database queries for the lib backend module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn card-database-ids
  "The `:id`, `:database_id`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :database_id :card_schema] :id [:in card-ids]))

(defn database
  "The `:metadata/database` with `database-id`, or nil."
  [database-id]
  (t2/select-one :metadata/database database-id))

(defn metadatas
  "The `metadata-type` rows selected by the Honey SQL `query`."
  [metadata-type query]
  (t2/select metadata-type query))
