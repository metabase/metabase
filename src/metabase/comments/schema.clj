(ns metabase.comments.schema
  "Malli schemas for the comments module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::comment
  "A Comment as selected from the app DB: every column of `:comment`."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:parent_comment_id [:maybe ms/PositiveInt]]
   [:target_type       [:or :keyword :string]]
   [:target_id         ms/PositiveInt]
   [:child_target_id   [:maybe [:or :string :map sequential?]]]
   [:creator_id        ::lib.schema.id/user]
   [:content           [:or :string :map sequential?]]
   [:is_resolved       :boolean]
   [:created_at        ms/TemporalInstant]
   [:updated_at        ms/TemporalInstant]
   [:deleted_at        [:maybe ms/TemporalInstant]]
   [:content_html      [:maybe [:or :string :map sequential?]]]
   [:context           [:maybe [:or :string :map sequential?]]]])

(mr/def ::comment.update
  "What an update (or insert) of a Comment accepts: every column of `:comment` except `id`, all optional."
  [:map {:closed true}
   [:parent_comment_id {:optional true} [:maybe ms/PositiveInt]]
   [:target_type       {:optional true} [:maybe [:or :keyword :string]]]
   [:target_id         {:optional true} [:maybe ms/PositiveInt]]
   [:child_target_id   {:optional true} [:maybe [:or :string :map sequential?]]]
   [:creator_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:content           {:optional true} [:maybe [:or :string :map sequential?]]]
   [:is_resolved       {:optional true} [:maybe :boolean]]
   [:created_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:deleted_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:content_html      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:context           {:optional true} [:maybe [:or :string :map sequential?]]]])

(mr/def ::comment-reaction
  "A CommentReaction as selected from the app DB: every column of `:comment_reaction`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:comment_id ms/PositiveInt]
   [:user_id    ::lib.schema.id/user]
   [:emoji      :string]
   [:created_at ms/TemporalInstant]])

(mr/def ::comment-reaction.update
  "What an update (or insert) of a CommentReaction accepts: every column of `:comment_reaction` except `id`, all optional."
  [:map {:closed true}
   [:comment_id {:optional true} [:maybe ms/PositiveInt]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:emoji      {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]])
