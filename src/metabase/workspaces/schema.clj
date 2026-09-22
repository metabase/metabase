(ns metabase.workspaces.schema
  "Malli schemas for workspace mode."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

(mr/def ::table-info
  "A warehouse table location."
  [:map
   [:schema [:maybe :string]]
   [:name   ::lib.schema.common/non-blank-string]])

(mr/def ::workspace-id
  "The id of a `:model/Workspace`."
  pos-int?)

(mr/def ::workspace
  "A `:model/Workspace` row."
  [:map
   [:id         ::workspace-id]
   [:name       ::lib.schema.common/non-blank-string]
   [:creator_id pos-int?]])

(mr/def ::workspace-table-remapping
  "A `:model/WorkspaceTableRemapping` row: within `workspace_id`, the canonical table `from_*` is backed by the
  workspace table `to_*`. `workspace_id` is nil for rows predating workspaces, which belong to none."
  [:map
   [:id           pos-int?]
   [:db_id        ::lib.schema.id/database]
   [:workspace_id [:maybe ::workspace-id]]
   [:from_schema  [:maybe :string]]
   [:from_table   ::lib.schema.common/non-blank-string]
   [:to_schema    [:maybe :string]]
   [:to_table     ::lib.schema.common/non-blank-string]])
