(ns metabase-enterprise.content-verification.api.moderation-review
  "`api/ee/moderation-review` routes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.content-verification.core :as moderation]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `ModerationReview`."
  {:scope "agent:moderation:write"
   :tool  {:name        "verify_card"
           :description (str "Mark a saved card or dashboard as Verified, or remove its "
                             "verified status. Set `status` to \"verified\" to verify or "
                             "leave it null to clear the verification. Requires superuser "
                             "and the :content-verification premium feature.")
           :feature     :content-verification
           :fields      [:moderated_item_id :moderated_item_type :status :text]}}
  [_route-params
   _query-params
   {:keys [text moderated_item_id moderated_item_type status]}
   :- [:map
       [:text                {:optional true} [:maybe :string]]
       [:moderated_item_id   ms/PositiveInt]
       [:moderated_item_type moderation/moderated-item-types]
       [:status              {:optional true} [:maybe moderation/Statuses]]]]
  (api/check-superuser)
  (let [review-data {:text                text
                     :moderated_item_id   moderated_item_id
                     :moderated_item_type moderated_item_type
                     :moderator_id        api/*current-user-id*
                     :status              status}]
    (api/check-404 (t2/exists? (get moderation/moderated-item-type->model moderated_item_type) moderated_item_id))
    (moderation/create-review! review-data)))
