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
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

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

(def ^:private metabots [{:id 1 :name "Internal Metabot"}
                         {:id 2 :name "Embedding Metabot"}])

(api.macros/defendpoint :get "/metabots"
  "List configured metabot instances"
  []
  (api/check-superuser)
  [{:id 1 :name "Internal Metabot"}
   {:id 2 :name "Embedding Metabot"}])

(api.macros/defendpoint :get "/metabots/:id"
  "Retrieve one metabot instance"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (get metabots (dec id)))

(api.macros/defendpoint :get "/metabots/:id/entities"
  "List the entities this metabot has access to"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  {:data [{:id "model-123"
           :model "model"
           :name "Sample Model"
           :collection_id "1"
           :collection_name "Analytics"}
          {:id "metric-456"
           :model "metric"
           :name "Sample Metric"
           :collection_id "2"
           :collection_name "Marketing"}]
   :total 2
   :limit (request/limit)
   :offset (request/offset)})

(api.macros/defendpoint :put "/metabots/:id/entities"
  "Update the entities this metabot has access to"
  [{:keys [id]} :- [:map [:id pos-int?]]
   _query-params
   entities :- [:sequential [:map
                             [:id ms/NonBlankString]
                             [:model ms/NonBlankString]]]]
  (api/check-superuser)
  api/generic-204-no-content)

(api.macros/defendpoint :delete ["/metabots/:id/entities/:model-type/:model-id" :model-type #"model|metric"]
  "Remove an entity from this metabot's access list"
  [{:keys [id model-type model-id]} :- [:map
                                        [:id pos-int?]
                                        [:model-type [:enum "model" "metric"]]
                                        [:model-id pos-int?]]]
  (api/check-superuser)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3` routes."
  (api.macros/ns-handler *ns* +auth))
