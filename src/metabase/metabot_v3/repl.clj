(ns metabase.metabot-v3.repl
  (:require
   [clojure.string :as str]
   [metabase.metabot-v3.openai.client :as metabot-v3.openai.client]
   [metabase.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn- response-message-type [message]
  (cond
    (and (= (:role message) :assistant)
         (seq (:tool-calls message)))
    :metabot-v3.repl.response-type/function-call

    (and (= (:role message) :assistant)
         (seq (:content message)))
    :metabot-v3.repl.response-type/chat

    :else
    :metabot-v3.repl.response-type/other))

(defmulti ^:private handle-response-message
  {:arglists '([message])}
  #'response-message-type)

(defmethod handle-response-message :metabot-v3.repl.response-type/chat
  [message]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "🤖" (u/colorize :green (:content message))))

(defmethod handle-response-message :metabot-v3.repl.response-type/function-call
  [message]
  (try
    (doseq [{:keys [function]} (:tool-calls message)]
      #_{:clj-kondo/ignore [:discouraged-var]}
      (println "🔧 🪛" (u/colorize :cyan (pr-str (list `metabot-v3.tools.interface/invoke-tool (:name function) (:arguments function)))))
      (metabot-v3.tools.interface/invoke-tool (:name function) (:arguments function)))
    (catch Throwable e
      (log/errorf e "Error invoking MetaBot tool: %s" (ex-message e))
      (u/format-color :red "⚠ Error invoking MetaBot tool: %s" (ex-message e)))))

(defmethod handle-response-message :default
  [message]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println (u/pprint-to-str :magenta message)))

(defn user-repl
  "REPL for interacting with MetaBot."
  ([]
   (user-repl nil))

  ([previous-messages]
   (when-let [input (try
                      (read-line)
                      (catch Throwable _))]
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println "🗨 " (u/colorize :blue input))
     (when (and (not (#{"quit" "exit" "bye" "goodbye" "\\q"} input))
                (not (str/blank? input)))
       (let [output  (metabot-v3.openai.client/user-chat input previous-messages)
             message (get-in output [:choices 0 :message])]
         (handle-response-message message)
         (recur (when (not= (response-message-type message) :metabot-v3.repl.response-type/function-call)
                  [message])))))))
