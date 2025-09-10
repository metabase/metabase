(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [metabase-enterprise.metabot-v3.api.document]
   [metabase-enterprise.metabot-v3.api.metabot]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.app-db.core :as app-db]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- store-message! [conversation-id profile-id messages]
  (let [finish   (let [m (u/last messages)]
                   (when (= (:_type m) :FINISH_MESSAGE)
                     m))
        state    (u/seek #(and (= (:_type %) :DATA)
                               (= (:type %) "state"))
                         messages)
        messages (-> (remove #(or (= % state) (= % finish)) messages)
                     vec)]
    (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                              (constantly (cond-> {:user_id    api/*current-user-id*}
                                            state (assoc :state state))))
    ;; NOTE: this will need to be constrained at some point, see BOT-386
    (t2/insert! :model/MetabotMessage
                {:conversation_id conversation-id
                 :data            messages
                 :usage           (:usage finish)
                 :role            (:role (first messages))
                 :profile_id      profile-id
                 :total_tokens    (->> (vals (:usage finish))
                                       ;; NOTE: this filter is supporting backward-compatible usage format, can be
                                       ;; removed when ai-service does not give us `completionTokens` in `usage`
                                       (filter map?)
                                       (map #(+ (:prompt %) (:completion %)))
                                       (apply +))})))

(defn streaming-request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc."
  [{:keys [metabot_id profile_id message context history conversation_id state]}]
  (let [message    (metabot-v3.envelope/user-message message)
        metabot-id (metabot-v3.config/resolve-dynamic-metabot-id metabot_id)
        profile-id (metabot-v3.config/resolve-dynamic-profile-id profile_id metabot-id)
        session-id (metabot-v3.client/get-ai-service-token api/*current-user-id* metabot-id)]
    (store-message! conversation_id profile-id [message])
    (metabot-v3.client/streaming-request
     {:context         (metabot-v3.context/create-context context)
      :metabot-id      metabot-id
      :profile-id      profile-id
      :session-id      session-id
      :conversation-id conversation_id
      :message         message
      :history         history
      :state           state
      :on-complete     (fn [lines]
                         (store-message! conversation_id profile-id (metabot-v3.u/aisdk->messages "assistant" lines))
                         :store-in-db)})))

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
