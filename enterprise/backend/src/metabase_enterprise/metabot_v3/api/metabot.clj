(ns metabase-enterprise.metabot-v3.api.metabot
  "`/api/ee/metabot-v3/metabot` routes"
  (:require
   [metabase-enterprise.metabot-v3.suggested-prompts :as metabot-v3.suggested-prompts]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.core :as mdb]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

;; TODO: Eventually this should be paged but since we are just going to hardcode two models for now
;; lets not
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "List configured metabot instances"
  []
  (api/check-superuser)
  {:items (t2/select :model/Metabot {:order-by [[:name :asc]]})})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Retrieve one metabot instance"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Metabot :id id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a metabot instance"
  [{:keys [id]} :- [:map [:id pos-int?]]
   _query-params
   metabot-updates :- [:map {:closed true}
                       [:use_verified_content {:optional true} :boolean]
                       [:collection_id {:optional true} [:maybe pos-int?]]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (let [old-metabot (t2/select-one :model/Metabot :id id)]
    ;; Prevent enabling verified content without the premium feature
    (when (:use_verified_content metabot-updates)
      (premium-features/assert-has-feature :content-verification (tru "Content verification")))
    (let [old-vals (select-keys old-metabot (keys metabot-updates))]
      (when (not= old-vals metabot-updates)
        (t2/update! :model/Metabot id metabot-updates)
        (metabot-v3.suggested-prompts/delete-all-metabot-prompts id)
        (metabot-v3.suggested-prompts/generate-sample-prompts id))
      (t2/select-one :model/Metabot :id id))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/prompt-suggestions/regenerate"
  "Remove any existing prompt suggestions for the Metabot instance with `id` and generate new ones."
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (api/check-404 (t2/exists? :model/Metabot :id id))
    (metabot-v3.suggested-prompts/delete-all-metabot-prompts id)
    (metabot-v3.suggested-prompts/generate-sample-prompts id))
  api/generic-204-no-content)

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/prompt-suggestions"
  "Return the prompt suggestions for the metabot instance with `id`."
  [{:keys [id]} :- [:map [:id pos-int?]]
   {:keys [sample model model_id]} :- [:map
                                       [:sample {:optional true} :boolean]
                                       [:model {:optional true} [:enum "metric" "model"]]
                                       [:model_id {:optional true} pos-int?]]]
  (let [offset (when-not sample (request/offset))
        rand-fn (case (mdb/db-type)
                  :postgres :random
                  :rand)
        base-query (cond-> {:join  [[{:select [:id :name :type]
                                      :from   [[(metabot-v3.tools.u/metabot-metrics-and-models-query id)
                                                :scope]]}
                                     :card]
                                    [:and
                                     [:= :card.id :metabot_prompt.card_id]]]
                            :where [:and
                                    [:= :metabot_prompt.metabot_id id]]}
                     model    (update :where conj [:= :card.type model])
                     model_id (update :where conj [:= :card.id model_id]))
        total (t2/count :model/MetabotPrompt base-query)
        order-by (if sample
                   [[[rand-fn]]]
                   [[:card.name :asc]
                    [:id :asc]])
        prompts (t2/select [:model/MetabotPrompt
                            :id
                            :prompt
                            :model
                            [:card_id :model_id]
                            [:card.name :model_name]
                            :created_at
                            :updated_at]
                           (cond-> base-query
                             true             (assoc :order-by order-by)
                             (request/limit)  (assoc :limit    (request/limit))
                             offset           (assoc :offset   offset)))]
    {:prompts prompts
     :limit   (request/limit)
     :offset  offset
     :total   total}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/prompt-suggestions"
  "Delete all prompt suggestions for the metabot instance with `id`."
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (metabot-v3.suggested-prompts/delete-all-metabot-prompts id)
  api/generic-204-no-content)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/prompt-suggestions/:prompt-id"
  "Delete the prompt suggestion with ID `prompt-id` for the metabot instance with `id`."
  [{:keys [id prompt-id]} :- [:map
                              [:id pos-int?]
                              [:prompt-id pos-int?]]]
  (api/check-superuser)
  (t2/delete! :model/MetabotPrompt {:where [:and
                                            [:= :id prompt-id]
                                            [:= :metabot_id id]]})
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/metabot` routes."
  (api.macros/ns-handler *ns* +auth))
