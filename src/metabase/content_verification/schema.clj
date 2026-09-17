(ns metabase.content-verification.schema
  "Malli schemas for the content-verification module."
  (:require
   [malli.util :as mut]
   [metabase.users.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::moderation-review
  "A ModerationReview as selected from the app DB: every column of `:moderation_review`."
  [:merge
   ::moderation-review.columns
   [:map {:closed true}
    [:id                  ms/PositiveInt]
    [:user                {:optional true} [:maybe :metabase.users.schema/user]]]])

(mr/def ::moderation-review.columns
  "Every column of `:moderation_review` except `id`, all optional."
  [:map {:closed true}
   [:updated_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:status              {:optional true} [:maybe [:or :keyword :string]]]
   [:text                {:optional true} [:maybe :string]]
   [:moderated_item_id   {:optional true} [:maybe ms/PositiveInt]]
   [:moderated_item_type {:optional true} [:maybe [:or :keyword :string]]]
   [:moderator_id        {:optional true} [:maybe ms/PositiveInt]]
   [:most_recent         {:optional true} [:maybe :boolean]]])

(mr/def ::moderation-review.create
  "What an insert of a ModerationReview accepts."
  (mut/select-keys (mr/schema ::moderation-review.columns)
                   [:updated_at :created_at :status :text :moderated_item_id :moderated_item_type
                    :moderator_id :most_recent]))

(mr/def ::moderation-review.update
  "What an update of a ModerationReview accepts: no immutable columns."
  (mut/select-keys (mr/schema ::moderation-review.columns)
                   [:updated_at :created_at :status :text :moderated_item_id :moderated_item_type :most_recent]))

(mr/def ::moderation-review.partial
  "A ModerationReview row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::moderation-review [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::moderation-review.column
  "A column of `moderation_review`, for the `:columns` option of the queries in [[metabase.content-verification.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::moderation-review.columns))))
