(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.time.format DateTimeFormatter)))

(mu/defn ^:private encode-reactions [reactions :- [:sequential ::metabot-v3.reactions/reaction]]
  (mc/encode [:sequential ::metabot-v3.reactions/reaction]
             reactions
             (mtx/transformer
              {:name :api-response}
              (mtx/key-transformer {:encode u/->snake_case_en}))))

(defn request-v2
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc."
  [message context history conversation_id state]
  (let [llm-context (metabot-v3.context/create-context context {:date-format DateTimeFormatter/ISO_INSTANT})
        env (-> {:context llm-context
                 :conversation-id conversation_id
                 :history history
                 :state state}
                metabot-v3.envelope/create
                (metabot-v3.envelope/add-user-message message)
                metabot-v3.dummy-tools/invoke-dummy-tools
                metabot-v3.tools.api/handle-envelope-v2)
        history (into (vec (metabot-v3.envelope/history env)) (:messages env))]
    {:reactions (-> env
                    (assoc :history history)
                    metabot-v3.envelope/reactions
                    encode-reactions)
     :history history
     :state (metabot-v3.envelope/state env)}))

(api.macros/defendpoint :post "/v2/agent"
  "Send a chat message to the LLM via the AI Proxy."
  [_route-params
   _query-params
   {:keys [message context conversation_id history state] :as body}
   :- [:map
       [:message ms/NonBlankString]
       [:context [:map-of :keyword :any]]
       [:conversation_id ms/UUIDString]
       [:history [:maybe [:sequential :map]]]
       [:state :map]]]
  (metabot-v3.context/log body :llm.log/fe->be)
  (let [context (mc/decode ::metabot-v3.context/context
                           context (mtx/transformer {:name :api-request}))
        history (mc/decode [:maybe ::metabot-v3.client.schema/messages]
                           history (mtx/transformer {:name :api-request}))]
    (doto (assoc
           (request-v2 message context history conversation_id state)
           :conversation_id conversation_id)
      (metabot-v3.context/log :llm.log/be->fe))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3` routes."
  (api.macros/ns-handler *ns* +auth))
