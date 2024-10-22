(ns metabase-enterprise.metabot-v3.handle-response
  "Code for handling responses from AI Proxy ([[metabase-enterprise.metabot-v3.client]])."
  (:require
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defmulti handle-response-message
  "Handle the top-level response `:message` from AI Proxy and invoke the appropriate tools in needed; return a list of
  reactions."
  {:arglists '([message])}
  (fn [message]
    (cond
      (seq (:tool-calls message)) :tools
      (seq (:content message))    :message
      :else                       :unknown)))

(mu/defmethod handle-response-message :message :- [:sequential ::metabot-v3.reactions/reaction]
  [{message-string :content, :as _message} :- ::metabot-v3.client.schema/message]
  [{:type               :metabot.reaction/message
    :message            message-string
    :repl/message-color :green
    :repl/message-emoji "🤖"}])

(mu/defmethod handle-response-message :tools :- [:sequential ::metabot-v3.reactions/reaction]
  [{tool-calls :tool-calls, :as _message} :- ::metabot-v3.client.schema/message]
  (letfn [(invoke-tool [{tool-name :name, :keys [arguments]}]
            #_(cons
               {:type               :metabot.reaction/message
                :message            (pr-str (list '*invoke-tool* tool-name arguments))
                :repl/message-color :cyan
                :repl/message-emoji "🔧 🪛"})
            (try
              (metabot-v3.tools.interface/*invoke-tool* tool-name arguments)
              (catch Throwable e
                (log/errorf e "Error invoking MetaBot tool: %s" (ex-message e))
                [{:type               :metabot.reaction/message
                  :message            "I'm sorry, I messed up! Maybe try again later..."
                  :repl/message-color :red
                  :repl/message-emoji "⚠"}])))]
    (into []
          (mapcat invoke-tool)
          tool-calls)))

(mu/defmethod handle-response-message :default :- [:sequential ::metabot-v3.reactions/reaction]
  [response]
  [{:type               :metabot.reaction/message
    :message            (format "Unknown response type: %s" (u/pprint-to-str response))
    :repl/message-color :magenta}])
