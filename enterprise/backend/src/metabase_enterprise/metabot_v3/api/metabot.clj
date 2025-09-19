(ns metabase-enterprise.metabot-v3.api.metabot
  "`/api/ee/metabot-v3/metabot` routes"
  (:require
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
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
(api.macros/defendpoint :get "/"
  "List configured metabot instances"
  []
  (api/check-superuser)
  {:items (t2/select :model/Metabot {:order-by [[:name :asc]]})})

(api.macros/defendpoint :get "/:id"
  "Retrieve one metabot instance"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Metabot :id id)))

(api.macros/defendpoint :put "/:id"
  "Update a metabot instance"
  [{:keys [id]} :- [:map [:id pos-int?]]
   _query-params
   metabot-updates :- [:map
                       [:use_verified_content {:optional true} :boolean]
                       [:collection_id {:optional true} [:maybe pos-int?]]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (let [old-metabot (t2/select-one :model/Metabot :id id)]
    ;; Prevent updating collection_id on the primary metabot instance
    (when (and (contains? metabot-updates :collection_id)
               (= (:entity_id old-metabot)
                  (get-in metabot-v3.config/metabot-config [metabot-v3.config/internal-metabot-id :entity-id])))
      (api/check-400 false "Cannot update collection_id for the primary metabot instance."))
    ;; Prevent enabling verified content without the premium feature
    (when (and (contains? metabot-updates :use_verified_content)
               (:use_verified_content metabot-updates))
      (premium-features/assert-has-feature :content-verification (tru "Content verification")))
    (let [verified-content-changed? (and (contains? metabot-updates :use_verified_content)
                                         (not= (:use_verified_content old-metabot)
                                               (:use_verified_content metabot-updates)))
          collection-changed? (and (contains? metabot-updates :collection_id)
                                   (not= (:collection_id old-metabot)
                                         (:collection_id metabot-updates)))]
      (t2/update! :model/Metabot id metabot-updates)
      (when (or verified-content-changed? collection-changed?)
        (metabot-v3.suggested-prompts/delete-all-metabot-prompts id)
        (metabot-v3.suggested-prompts/generate-sample-prompts id))
      (t2/select-one :model/Metabot :id id))))

(api.macros/defendpoint :post "/:id/prompt-suggestions/regenerate"
  "Remove any existing prompt suggestions for the Metabot instance with `id` and generate new ones."
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (api/check-404 (t2/exists? :model/Metabot :id id))
    (metabot-v3.suggested-prompts/delete-all-metabot-prompts id)
    (metabot-v3.suggested-prompts/generate-sample-prompts id))
  api/generic-204-no-content)

(api.macros/defendpoint :get "/:id/prompt-suggestions"
  "Return the prompt suggestions for the metabot instance with `id`."
  [{:keys [id]} :- [:map [:id pos-int?]]
   {:keys [sample model model_id]} :- [:map
                                       [:sample {:optional true} :boolean]
                                       [:model {:optional true} [:enum "metric" "model"]]
                                       [:model_id {:optional true} pos-int?]]]
  (let [offset (if sample nil (request/offset))
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

(api.macros/defendpoint :delete "/:id/prompt-suggestions"
  "Delete all prompt suggestions for the metabot instance with `id`."
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (metabot-v3.suggested-prompts/delete-all-metabot-prompts id)
  api/generic-204-no-content)

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
