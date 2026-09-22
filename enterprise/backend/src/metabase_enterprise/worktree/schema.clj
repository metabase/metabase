(ns metabase-enterprise.worktree.schema
  "Malli schemas for the worktree module's app-DB rows."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::worktree
  "A Worktree as selected from the app DB: every column of `:worktree`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:branch     :string]
   [:creator_id [:maybe ::lib.schema.id/user]]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]])

(mr/def ::worktree.update
  "The columns of `:worktree` an insert or update may set: every column except `id`, all optional."
  [:map {:closed true}
   [:branch     {:optional true} :string]
   [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} ms/TemporalInstant]
   [:updated_at {:optional true} ms/TemporalInstant]])

(mr/def ::worktree-entity-remapping
  "A WorktreeEntityRemapping as selected from the app DB: every column of `:worktree_entity_remapping`."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:worktree_id      ms/PositiveInt]
   [:type             :string]
   [:source_entity_id :string]
   [:local_entity_id  :string]])

(mr/def ::worktree-entity-remapping.update
  "The columns of `:worktree_entity_remapping` an insert or update may set: every column except `id`, all optional."
  [:map {:closed true}
   [:worktree_id      {:optional true} ms/PositiveInt]
   [:type             {:optional true} :string]
   [:source_entity_id {:optional true} :string]
   [:local_entity_id  {:optional true} :string]])
