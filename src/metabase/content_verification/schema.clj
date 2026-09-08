(ns metabase.content-verification.schema
  "Malli schemas for the content-verification module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::moderation-review
  "A ModerationReview as selected from the app DB: every column of `:moderation_review`."
  [:map {:closed true}
   [:id                  ms/PositiveInt]
   [:updated_at          ms/TemporalInstant]
   [:created_at          ms/TemporalInstant]
   [:status              [:maybe [:or :keyword :string]]]
   [:text                [:maybe [:or :string :map sequential?]]]
   [:moderated_item_id   ms/PositiveInt]
   [:moderated_item_type [:or :keyword :string]]
   [:moderator_id        ms/PositiveInt]
   [:most_recent         :boolean]])

(mr/def ::moderation-review.update
  "What an update (or insert) of a ModerationReview accepts: every column of `:moderation_review` except `id`, all optional."
  [:map {:closed true}
   [:updated_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:status              {:optional true} [:maybe [:or :keyword :string]]]
   [:text                {:optional true} [:maybe [:or :string :map sequential?]]]
   [:moderated_item_id   {:optional true} [:maybe ms/PositiveInt]]
   [:moderated_item_type {:optional true} [:maybe [:or :keyword :string]]]
   [:moderator_id        {:optional true} [:maybe ms/PositiveInt]]
   [:most_recent         {:optional true} [:maybe :boolean]]])
