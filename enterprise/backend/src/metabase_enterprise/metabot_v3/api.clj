(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [compojure.core :refer [POST]]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.handle-response :as metabot-v3.handle-response]
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

(defn- request [message context history]
  (let [env (metabot-v3.handle-response/handle-envelope
             (metabot-v3.envelope/add-user-message
              (metabot-v3.envelope/create context history)
              message))]
    {:reactions (if-let [reactions (seq (metabot-v3.envelope/reactions env))]
                  (encode-reactions reactions)
                  (encode-reactions [(metabot-v3.envelope/last-assistant-message->reaction env)]))
     :history (metabot-v3.envelope/history env)}))

(api/defendpoint POST "/agent"
  "Send a chat message to the LLM via the AI Proxy."
  [:as {{:keys [message context history] :as _body} :body}]
  {message ms/NonBlankString
   context [:map-of :keyword :any]
   history [:maybe [:sequential :map]]}
  ;; HACK: for the demo, let's catch any exceptions that occur and just respond with something semi-reasonable
  (metabot-v3.context/log _body :llm.log/fe->be)
  (let [context (mc/decode ::metabot-v3.context/context
                           context (mtx/transformer {:name :api-request}))
        history (mc/decode [:maybe ::metabot-v3.client.schema/messages]
                           history (mtx/transformer {:name :api-request}))]
    (doto (request message context history)
      (metabot-v3.context/log :llm.log/be->fe))))

(api/define-routes)
