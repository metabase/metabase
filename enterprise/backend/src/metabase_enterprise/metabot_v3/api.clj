(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.api.document]
   [metabase-enterprise.metabot-v3.api.metabot]
   [metabase-enterprise.metabot-v3.api.slackbot]
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
   [metabase.premium-features.core :as premium-features]
   [metabase.store-api.core :as store-api]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
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
                         (store-message! conversation_id profile-id (metabot-v3.u/aisdk->messages :assistant lines))
                         :store-in-db)})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/agent-streaming"
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/feedback"
  "Proxy Metabot feedback to Harbormaster, adding the premium embedding token."
  [_route-params
   _query-params
   feedback :- :map]
  (let [token (premium-features/premium-embedding-token)
        base-url (store-api/store-api-url)]
    (api/check-400 (not (or (str/blank? token) (str/blank? base-url)))
                   "Cannot build a request. The license token and/or Store api url are missing!")
    (try
      (http/post (str base-url "/api/v2/metabot/feedback/" token)
                 {:content-type :json
                  :body         (json/encode feedback)})
      api/generic-204-no-content
      (catch Exception e
        (log/error e "Failed to submit feedback to Harbormaster")
        (throw e)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3` routes."
  (handlers/routes
   ;; TODO: seems to already be done in the route definitions? (api.macros/ns-handler *ns* +auth)
   (handlers/route-map-handler
    {"/metabot" metabase-enterprise.metabot-v3.api.metabot/routes
     "/document" metabase-enterprise.metabot-v3.api.document/routes
     "/slack" metabase-enterprise.metabot-v3.api.slackbot/routes})))
