(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [compojure.core :refer [POST]]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.api.common :as api]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defmulti ^:private handle-response
  {:arglists '([response])}
  :type)

(mu/defmethod handle-response :message :- [:sequential ::metabot-v3.reactions/reaction]
  [{:keys [message], :as _response}]
  [{:type    :metabot.reaction/message
    :message message}])

(mu/defmethod handle-response :tools :- [:sequential ::metabot-v3.reactions/reaction]
  [{:keys [tools], :as _response}]
  (letfn [(invoke-tool [{tool-name :name, :keys [parameters]}]
            (cons
             {:type    :metabot.reaction/message
              :message (format "🔧 🪛 %s"
                               (pr-str (list `metabot-v3.tools.interface/invoke-tool
                                             tool-name
                                             parameters)))}
             (try
               (metabot-v3.tools.interface/invoke-tool tool-name parameters)
               (catch Throwable e
                 (log/errorf e "Error invoking MetaBot tool: %s" (ex-message e))
                 [{:type    :metabot.reaction/message
                   :message (str "⚠ " (i18n/tru "Error invoking MetaBot tool: {0}" (ex-message e)))}]))))]
    (into []
          (mapcat invoke-tool)
          tools)))

(mu/defn- request :- [:sequential ::metabot-v3.reactions/reaction]
  [message :- :string
   context :- ::metabot-v3.context/context
   history :- [:maybe ::metabot-v3.client/history]]
  (handle-response (metabot-v3.client/request message context history)))

(api/defendpoint POST "/agent"
  "Send a chat message to the LLM via the AI Proxy."
  [:as {{:keys [message context history] :as _body} :body}]
  {message ms/NonBlankString
   context [:map-of :keyword :any]
   history [:maybe [:sequential [:map-of :keyword :any]]]}
  (request message context history))

(api/define-routes)
