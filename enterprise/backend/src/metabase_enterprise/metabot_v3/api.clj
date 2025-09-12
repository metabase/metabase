(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [metabase-enterprise.metabot-v3.api.document]
   [metabase-enterprise.metabot-v3.api.metabot]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.malli.schema :as ms]))

(defn streaming-request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc."
  [{:keys [metabot_id profile_id message context history conversation_id state]}]
  (let [message    (metabot-v3.envelope/user-message message)
        metabot-id (metabot-v3.config/resolve-dynamic-metabot-id metabot_id)
        profile-id (metabot-v3.config/resolve-dynamic-profile-id profile_id metabot-id)]
    (metabot-v3.tools.api/streaming-handle-envelope
     {:context         (metabot-v3.context/create-context context)
      :metabot-id      metabot-id
      :profile-id      profile-id
      :conversation-id conversation_id
      :message         message
      :history         history
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
  (metabot-v3.context/log body :llm.log/fe->be)
  (streaming-request body))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)
   (handlers/route-map-handler
    {"/metabot" metabase-enterprise.metabot-v3.api.metabot/routes
     "/document" metabase-enterprise.metabot-v3.api.document/routes})))
