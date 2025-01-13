(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [compojure.core :refer [POST]]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.handle-envelope :as metabot-v3.handle-envelope]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::response
  "Shape of the response for the backend agent endpoint."
  [:map
   [:reactions [:sequential ::metabot-v3.reactions/reaction]]
   [:history   [:maybe ::metabot-v3.client.schema/messages]]])

(mu/defn ^:private encode-reactions [reactions :- [:sequential ::metabot-v3.reactions/reaction]]
  (mc/encode [:sequential ::metabot-v3.reactions/reaction]
             reactions
             (mtx/transformer
              {:name :api-response}
              (mtx/key-transformer {:encode u/->snake_case_en}))))

(defn request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc."
  [message context history session-id]
  (let [env (-> (metabot-v3.envelope/create
                 (metabot-v3.context/create-context context)
                 history
                 session-id)
                (metabot-v3.envelope/add-user-message message)
                (metabot-v3.dummy-tools/invoke-dummy-tools)
                (metabot-v3.handle-envelope/handle-envelope))]
    {:reactions (encode-reactions (metabot-v3.envelope/reactions env))
     :history (metabot-v3.envelope/history env)}))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint POST "/agent"
  "Send a chat message to the LLM via the AI Proxy."
  [:as {{:keys [message context history session_id] :as _body} :body}]
  {message ms/NonBlankString
   context [:map-of :keyword :any]
   history [:maybe [:sequential :map]]
   session_id ms/UUIDString}
  (metabot-v3.context/log _body :llm.log/fe->be)
  (let [context (mc/decode ::metabot-v3.context/context
                           context (mtx/transformer {:name :api-request}))
        history (mc/decode [:maybe ::metabot-v3.client.schema/messages]
                           history (mtx/transformer {:name :api-request}))]
    (doto (assoc
           (request message context history session_id)
           :session_id session_id)
      (metabot-v3.context/log :llm.log/be->fe))))

(api/define-routes)
