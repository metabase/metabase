(ns metabase.comments.schema
  "Malli schemas for the comments module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::comment.content
  "The `:content` column of a Comment, decoded."
  :map)

(mr/def ::comment.context
  "The `:context` column of a Comment, decoded."
  :map)

(mr/def ::comment
  "A Comment as selected from the app DB: every column of `:comment`."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:parent_comment_id [:maybe ms/PositiveInt]]
   [:target_type       [:or :keyword :string]]
   [:target_id         ms/PositiveInt]
   [:child_target_id   [:maybe :string]]
   [:creator_id        ::lib.schema.id/user]
   [:content           ::comment.content]
   [:is_resolved       :boolean]
   [:created_at        ms/TemporalInstant]
   [:updated_at        ms/TemporalInstant]
   [:deleted_at        [:maybe ms/TemporalInstant]]
   [:content_html      [:maybe :string]]
   [:context           [:maybe ::comment.context]]])

(mr/def ::comment.update
  "What an update (or insert) of a Comment accepts: every column of `:comment` except `id`, all optional."
  [:map {:closed true}
   [:parent_comment_id {:optional true} [:maybe ms/PositiveInt]]
   [:target_type       {:optional true} [:maybe [:or :keyword :string]]]
   [:target_id         {:optional true} [:maybe ms/PositiveInt]]
   [:child_target_id   {:optional true} [:maybe :string]]
   [:creator_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:content           {:optional true} [:maybe ::comment.content]]
   [:is_resolved       {:optional true} [:maybe :boolean]]
   [:created_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:deleted_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:content_html      {:optional true} [:maybe :string]]
   [:context           {:optional true} [:maybe ::comment.context]]])

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
