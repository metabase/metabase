(ns metabase.content-verification.schema
  "Malli schemas for the content-verification module."
  (:require
   [metabase.users.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::moderation-review.status
  [:maybe [:enum "verified"]])

(mr/def ::moderation-review.item-type
  [:enum "card" :card "dashboard" :dashboard])

(mr/def ::moderation-review
  "A ModerationReview as selected from the app DB: every column of `:moderation_review`."
  [:merge
   ::moderation-review.update
   [:map {:closed true}
    [:id                  ms/PositiveInt]
    [:user                {:optional true} [:maybe :metabase.users.schema/user]]]])

(mr/def ::moderation-review.update
  "What an update (or insert) of a ModerationReview accepts: every column of `:moderation_review` except `id`, all optional."
  [:map {:closed true}
   [:updated_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:status              {:optional true} ::moderation-review.status]
   [:text                {:optional true} [:maybe :string]]
   [:moderated_item_id   {:optional true} [:maybe ms/PositiveInt]]
   [:moderated_item_type {:optional true} ::moderation-review.item-type]
   [:moderator_id        {:optional true} [:maybe ms/PositiveInt]]
   [:most_recent         {:optional true} [:maybe :boolean]]])

(mr/def ::moderation-review.create
  "What creating a ModerationReview takes: the item it moderates, its moderator, and optionally a status and a text."
  [:map {:closed true}
   [:moderated_item_id   ms/PositiveInt]
   [:moderated_item_type ::moderation-review.item-type]
   [:moderator_id        ms/PositiveInt]
   [:status              {:optional true} ::moderation-review.status]
   [:text                {:optional true} [:maybe :string]]])
