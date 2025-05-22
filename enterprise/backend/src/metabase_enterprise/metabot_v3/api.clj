(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn ^:private encode-reactions [reactions :- [:sequential ::metabot-v3.reactions/reaction]]
  (mc/encode [:sequential ::metabot-v3.reactions/reaction]
             reactions
             (mtx/transformer
              {:name :api-response}
              (mtx/key-transformer {:encode u/->snake_case_en}))))

(defn request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc."
  [{:keys [metabot_id message context history conversation_id state]
    :or {metabot_id metabot-v3.config/internal-metabot-id}}]
  (let [initial-message (metabot-v3.envelope/user-message message)
        history         (conj (vec history) initial-message)
        env             (metabot-v3.tools.api/handle-envelope
                         {:context         (metabot-v3.context/create-context context)
                          :metabot-id      metabot_id
                          :profile-id      (get-in metabot-v3.config/metabot-config [metabot_id :profile-id])
                          :conversation-id conversation_id
                          :messages        history
                          :state           state})
        messages        (:messages env)]
    {:reactions (-> messages metabot-v3.envelope/reactions encode-reactions)
     :history   (into history messages)
     :state     (metabot-v3.envelope/state env)}))

(api.macros/defendpoint :post "/v2/agent"
  "Send a chat message to the LLM via the AI Proxy."
  [_route-params
   _query-params
   {:keys [conversation_id] :as body} :- [:map
                                          [:metabot_id {:optional true} :string]
                                          [:message ms/NonBlankString]
                                          [:context ::metabot-v3.context/context]
                                          [:conversation_id ms/UUIDString]
                                          [:history [:maybe ::metabot-v3.client.schema/messages]]
                                          [:state :map]]]
  (metabot-v3.context/log body :llm.log/fe->be)
  (doto (assoc
         (request body)
         :conversation_id conversation_id)
    (metabot-v3.context/log :llm.log/be->fe)))

;; TODO: Eventually this should be paged but since we are just going to hardcode two models for now
;; lets not
(api.macros/defendpoint :get "/metabots"
  "List configured metabot instances"
  []
  (api/check-superuser)
  {:items (t2/select :model/Metabot {:order-by [[:name :asc]]})})

(api.macros/defendpoint :get "/metabots/:id"
  "Retrieve one metabot instance"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Metabot :id id)))

(def ^:private default-entities-page-size 200)

(api.macros/defendpoint :get "/metabots/:id/entities"
  "List the entities this metabot has access to"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (let [limit (or (request/limit) default-entities-page-size)
        offset (or (request/offset) 0)
        root-collection (collection/root-collection-with-ui-details nil)
        entities (t2/select [:model/MetabotEntity
                             :model_id
                             :model
                             [[:coalesce :card.name :collection.name] :name]
                             :created_at
                             [:parent_collection.id :collection_id]
                             [:parent_collection.name :collection_name]]
                            {:left-join [[:report_card :card] [:and [:in :model [[:inline "dataset"] [:inline "metric"]]]  [:= :model_id :card.id]]
                                         [:collection :collection] [:and [:= :model [:inline "collection"]]  [:= :model_id :collection.id]]
                                         ;; TODO: How to join parent collections from the location column?
                                         [:collection :parent_collection] [:= :card.collection_id :parent_collection.id]]
                             :where [:= :metabot_id id]
                             :limit limit
                             :offset offset
                             :order-by [[:name :asc]]})
        total (t2/count :model/MetabotEntity :metabot_id id)]
    {:items (for [{:keys [collection_id model] :as entity} entities]
              (cond-> entity
                (and (nil? collection_id)
                     (not= :collection model)) (assoc :collection_id (:id root-collection)
                                                      :collection_name (:name root-collection))))
     :total total
     :limit limit
     :offset offset}))

(api.macros/defendpoint :put "/metabots/:id/entities"
  "Update the entities this metabot has access to"
  [{:keys [id]} :- [:map [:id pos-int?]]
   _query-params
   {:keys [items]} :- [:map
                       [:items [:sequential [:map
                                             [:id pos-int?]
                                             [:model [:enum "collection"]]]]]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (t2/with-transaction [_conn]
    (doseq [{model-id :id model :model} items]
      (when-not (t2/exists? :model/MetabotEntity
                            :metabot_id id
                            :model model
                            :model_id model-id)
        (t2/insert! :model/MetabotEntity
                    {:metabot_id id
                     :model model
                     :model_id model-id}))))
  api/generic-204-no-content)

(api.macros/defendpoint :delete ["/metabots/:id/entities/:model/:model-id" :model #"collection"]
  "Remove an entity from this metabot's access list"
  [{:keys [id model model-id]} :- [:map
                                   [:id pos-int?]
                                   [:model [:enum "collection"]]
                                   [:model-id pos-int?]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (t2/delete! :model/MetabotEntity
              :metabot_id id
              :model model
              :model_id model-id)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3` routes."
  (api.macros/ns-handler *ns* +auth))
