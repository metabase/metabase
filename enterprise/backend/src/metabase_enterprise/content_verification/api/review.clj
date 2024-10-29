(ns metabase-enterprise.content-verification.api.review
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.models.moderation-review :as moderation-review]
   [metabase.moderation :as moderation]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint POST "/"
  "Create a new `ModerationReview`."
  [:as {{:keys [text moderated_item_id moderated_item_type status reason]} :body}]
  {moderated_item_id   ms/PositiveInt
   moderated_item_type moderation/moderated-item-types
   status              [:maybe moderation-review/Statuses]
   reason              [:maybe moderation-review/Reasons]
   text                [:maybe :string]}
  (api/check-superuser)
  (let [review-data {:moderated_item_id   moderated_item_id
                     :moderated_item_type moderated_item_type
                     :moderator_id        api/*current-user-id*
                     :status              status
                     :reason              reason
                     :text                text}]
    (api/check-404 (t2/exists? (get moderation/moderated-item-type->model moderated_item_type) moderated_item_id))
    (moderation-review/create-review! review-data)))

(api/define-routes)
