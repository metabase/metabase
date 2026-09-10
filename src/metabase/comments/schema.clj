(ns metabase.comments.schema
  "Malli schemas for the comments module."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::prose-mirror-node.attrs
  "The `attrs` of a ProseMirror node in a comment: the ones this code reads by name, and whatever else the editor put
  there. Every key, declared or not, is a string, so the map never mixes keyword and string keys."
  (ms/string-keyed-object
   ["model"    {:optional true} [:maybe :string]]
   ["entityId" {:optional true} [:maybe [:or :int :string]]]
   ["label"    {:optional true} [:maybe :string]]
   ["level"    {:optional true} [:maybe :int]]))

(mr/def ::prose-mirror-node
  "One node of the ProseMirror/TipTap document a comment is written in, in the shape ProseMirror's `Node.toJSON`
  emits: a `:type`, the children it contains, the marks applied to it, and `:text` on text nodes. Those five keys are
  the whole of the ProseMirror JSON node format; `:attrs` varies by node type. Marks are nodes too as far as this
  schema is concerned -- a mark carries only `:type` and `:attrs`, which is a subset of a node."
  [:map {:closed true}
   [:type                     :string]
   [:attrs   {:optional true} [:maybe [:ref ::prose-mirror-node.attrs]]]
   [:content {:optional true} [:sequential [:ref ::prose-mirror-node]]]
   [:marks   {:optional true} [:sequential [:ref ::prose-mirror-node]]]
   [:text    {:optional true} :string]])

(mr/def ::comment.content
  "The `:content` column of a Comment, decoded: the ProseMirror document the comment was written in."
  ::prose-mirror-node)

(mu/defn normalize-content :- [:maybe ::comment.content]
  "Normalize a comment's content on its way in from the API or out of the application database."
  [content]
  (some->> content (lib/normalize ::comment.content)))

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
