(ns metabase-enterprise.metabot-v3.repl
  "This is mainly for playing around with stuff from the REPL or CLI."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.db :as mdb]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defmulti ^:private handle-response
  {:arglists '([response])}
  :type)

(mu/defmethod handle-response :message :- [:sequential ::metabot-v3.reactions/reaction]
  [{:keys [message], :as _response}]
  [{:type    :metabot.reaction/message
    :message (u/format-color :green "🤖 %s" message)}])

(mu/defmethod handle-response :tools :- [:sequential ::metabot-v3.reactions/reaction]
  [{:keys [tools], :as _response}]
  (letfn [(invoke-tool [{tool-name :name, :keys [parameters]}]
            (cons
             {:type    :metabot.reaction/message
              :message (u/format-color :cyan "🔧 🪛 %s"
                                       (pr-str (list `metabot-v3.tools.interface/invoke-tool
                                                     tool-name
                                                     parameters)))}
             (try
               (metabot-v3.tools.interface/invoke-tool tool-name parameters)
               (catch Throwable e
                 (log/errorf e "Error invoking MetaBot tool: %s" (ex-message e))
                 [{:type    :metabot.reaction/message
                   :message (u/format-color :red "⚠ Error invoking MetaBot tool: %s" (ex-message e))}]))))]
    (into []
          (mapcat invoke-tool)
          tools)))

(mu/defmethod handle-response :default :- [:sequential ::metabot-v3.reactions/reaction]
  [response]
  [{:type    :metabot.reaction/message
    :message (u/format-color :magenta "Unknown response type: %s" (u/pprint-to-str response))}])

(defmulti ^:private handle-reaction
  {:arglists '([reaction])}
  :type)

(defmethod handle-reaction :metabot.reaction/message
  [{:keys [message], :as _reaction}]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println message))

(defmethod handle-reaction :default
  [reaction]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println (u/format-color :magenta "<REACTION>\n%s" (u/pprint-to-str reaction))))

(mu/defn- handle-reactions
  [reactions :- [:sequential ::metabot-v3.reactions/reaction]]
  (doseq [reaction reactions]
    (handle-reaction reaction)))

(defn user-repl
  "REPL for interacting with MetaBot."
  ([]
   (user-repl []))

  ([history]
   (when-let [input (try
                      #_{:clj-kondo/ignore [:discouraged-var]}
                      (print "\n> ")
                      (flush)
                      (read-line)
                      (catch Throwable _))]
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println "🗨 " (u/colorize :blue input))
     (when (and (not (#{"quit" "exit" "bye" "goodbye" "\\q"} input))
                (not (str/blank? input)))
       (let [context  {}
             response (metabot-v3.client/request input context history)]
         (-> response
             handle-response
             handle-reactions)
         (recur (concat history (:new-history response))))))))

(defn user-repl-cli
  "CLI entrypoint for using the MetaBot REPL.

    clj -X:ee:metabot-v3/repl"
  [_options]
  (mdb/setup-db! :create-sample-content? false)
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "Starting MetaBot REPL... 🤖")
  (user-repl)
  (System/exit 0))
