(ns metabase-enterprise.workspaces.schema
  "Malli schemas shared across the workspaces module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::workspace
  "A `:model/Workspace` row."
  [:map
   [:id           ms/PositiveInt]
   [:name         ms/NonBlankString]
   [:instance_id  {:optional true} [:maybe :string]]
   [:instance_url {:optional true} [:maybe :string]]])

(mr/def ::workspace-database
  "A `:model/WorkspaceDatabase` row."
  [:map
   [:id ms/PositiveInt]])
