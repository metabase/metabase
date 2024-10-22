(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [compojure.core :refer [POST]]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
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

(mu/defn- request :- ::response
  [input-message :- :string
   context       :- ::metabot-v3.context/context
   history       :- [:maybe ::metabot-v3.client.schema/messages]]
  (let [response         (metabot-v3.client/*request* input-message context history)
        response-message (:message response)]
    {:reactions (encode-reactions (metabot-v3.handle-response/handle-response-message response-message))
     :history   (into (vec history)
                      [{:role :user, :content input-message}
                       response-message])}))

(api/defendpoint POST "/agent"
  "Send a chat message to the LLM via the AI Proxy."
  [:as {{:keys [message context history] :as _body} :body}]
  {message ms/NonBlankString
   context [:map-of :keyword :any]
   history [:maybe [:sequential :map]]}
  ;; HACK: for the demo, let's catch any exceptions that occur and just respond with something semi-reasonable
  (try
    (let [context (mc/decode ::metabot-v3.context/context
                             context (mtx/transformer {:name :api-request}))
          history (mc/decode [:maybe ::metabot-v3.client.schema/messages]
                             history (mtx/transformer {:name :api-request}))]
      (request message context history))
    (catch Exception _
      {:reactions [{:type               :metabot.reaction/message
                    :message            "I'm sorry, I messed up and something went wrong! Not sure what happened, but I'll try not to do it again."
                    :repl/message-color :red
                    :repl/message-emoji "⚠"}]
       :history history})))

(api/define-routes)
