(ns metabase.warehouse-schema.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

(mr/def ::table
  "Schema for an instance of a `:model/Table`."
  [:map
   [:id ::lib.schema.id/table]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:schema {:optional true} [:maybe :string]]
   [:db_id ::lib.schema.id/database]])
