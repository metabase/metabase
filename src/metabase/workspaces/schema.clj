(ns metabase.workspaces.schema
  "Malli schemas for workspace mode."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

(mr/def ::table-info
  "A warehouse table location."
  [:map {:closed true}
   [:schema [:maybe :string]]
   [:name   ::lib.schema.common/non-blank-string]])

(mr/def ::workspace-table-remapping
  "A `:model/WorkspaceTableRemapping` row: within `worktree_id`, the canonical table `from_*` is backed by the
  workspace table `to_*`. `worktree_id` is nil for the main app."
  [:map {:closed true}
   [:id           pos-int?]
   [:db_id        ::lib.schema.id/database]
   [:worktree_id  [:maybe pos-int?]]
   [:from_schema  [:maybe :string]]
   [:from_table   ::lib.schema.common/non-blank-string]
   [:to_schema    [:maybe :string]]
   [:to_table     ::lib.schema.common/non-blank-string]])
