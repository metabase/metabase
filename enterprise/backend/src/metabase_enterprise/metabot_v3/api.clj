(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.api.document]
   [metabase-enterprise.metabot-v3.api.metabot]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.settings :refer [assert-metabot-enabled!]]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
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
  [{:keys [metabot_id profile_id message context history conversation_id state]}]
  (let [initial-message (metabot-v3.envelope/user-message message)
        history         (conj (vec history) initial-message)
        metabot-id      (metabot-v3.config/resolve-dynamic-metabot-id metabot_id)
        profile-id      (metabot-v3.config/resolve-dynamic-profile-id profile_id metabot-id)
        env             (metabot-v3.tools.api/handle-envelope
                         {:context         (metabot-v3.context/create-context context)
                          :metabot-id      metabot-id
                          :profile-id      profile-id
                          :conversation-id conversation_id
                          :messages        history
                          :state           state})
        messages        (:messages env)]
    {:reactions (-> messages metabot-v3.envelope/reactions encode-reactions)
     :history   (into history messages)
     :state     (metabot-v3.envelope/state env)}))

(api.macros/defendpoint :post "/v2/agent"
  "Send a chat message to the LLM via the AI Service."
  [_route-params
   _query-params
   {:keys [conversation_id] :as body} :- [:map
                                          [:metabot_id {:optional true} :string]
                                          [:profile_id {:optional true} :string]
                                          [:message ms/NonBlankString]
                                          [:context ::metabot-v3.context/context]
                                          [:conversation_id ms/UUIDString]
                                          [:history [:maybe ::metabot-v3.client.schema/messages]]
                                          [:state :map]]]
  (assert-metabot-enabled!)
  (metabot-v3.context/log body :llm.log/fe->be)
  (doto (assoc
         (request body)
         :conversation_id conversation_id)
    (metabot-v3.context/log :llm.log/be->fe)))

(defn streaming-request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc."
  [{:keys [metabot_id profile_id message context history conversation_id state]}]
  (let [initial-message (metabot-v3.envelope/user-message message)
        history         (conj (vec history) initial-message)
        metabot-id      (metabot-v3.config/resolve-dynamic-metabot-id metabot_id)
        profile-id      (metabot-v3.config/resolve-dynamic-profile-id profile_id metabot-id)]
    (metabot-v3.tools.api/streaming-handle-envelope
     {:context         (metabot-v3.context/create-context context)
      :metabot-id      metabot-id
      :profile-id      profile-id
      :conversation-id conversation_id
      :messages        history
      :state           state})))

(api.macros/defendpoint :post "/v2/agent-streaming"
  "Send a chat message to the LLM via the AI Proxy."
  [_route-params
   _query-params

   body :- [:map
            [:profile_id {:optional true} :string]
            [:metabot_id {:optional true} :string]
            [:message ms/NonBlankString]
            [:context ::metabot-v3.context/context]
            [:conversation_id ms/UUIDString]
            [:history [:maybe ::metabot-v3.client.schema/messages]]
            [:state :map]]]
  (assert-metabot-enabled!)
  (metabot-v3.context/log body :llm.log/fe->be)
  (streaming-request body))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)
   (handlers/route-map-handler
    {"/metabot" metabase-enterprise.metabot-v3.api.metabot/routes
     "/document" metabase-enterprise.metabot-v3.api.document/routes})))
