(ns metabase-enterprise.content-verification.api.moderation-review
  "`api/ee/moderation-review` routes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.moderation-review :as moderation-review]
   [metabase.moderation :as moderation]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/"
  "Create a new `ModerationReview`."
  [_route-params
   _query-params
   {:keys [text moderated_item_id moderated_item_type status]}
   :- [:map
       [:text                {:optional true} [:maybe :string]]
       [:moderated_item_id   ms/PositiveInt]
       [:moderated_item_type moderation/moderated-item-types]
       [:status              {:optional true} [:maybe moderation-review/Statuses]]]]
  (api/check-superuser)
  (let [review-data {:text                text
                     :moderated_item_id   moderated_item_id
                     :moderated_item_type moderated_item_type
                     :moderator_id        api/*current-user-id*
                     :status              status}]
    (api/check-404 (t2/exists? (get moderation/moderated-item-type->model moderated_item_type) moderated_item_id))
    (moderation-review/create-review! review-data)))
