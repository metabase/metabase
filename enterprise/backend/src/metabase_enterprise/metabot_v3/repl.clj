(ns metabase-enterprise.metabot-v3.repl
  "Basic user message => AI Proxy => response chat flow. This namespace implements a text-based REPL you can use from
  Clojure or the CLI with

    clj -X:ee:metabot-v3/repl"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.api :as api]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase.db :as mdb]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defmulti ^:private handle-reaction
  {:arglists '([reaction])}
  :type)

(defmethod handle-reaction :metabot.reaction/message
  [{:keys [message], repl-emoji :repl/emoji, repl-message-color :repl/message-color, :as _reaction}]
  (let [message (cond->> message
                  repl-emoji         (str repl-emoji " ")
                  repl-message-color (u/colorize repl-message-color))]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println message)))

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
  ([history context conversation-id] (user-repl history context conversation-id {}))
  ([history context conversation-id state]
   (when-let [{history' :history, state' :state} (try
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
                                                       (let [result (api/request input context history conversation-id state)]
                                                         (handle-reactions (:reactions result))
                                                         result)))
                                                   (catch Throwable e
                                                     #_{:clj-kondo/ignore [:discouraged-var]}
                                                     (println (u/pprint-to-str :red e))
                                                     history))]
     (recur history' context conversation-id state'))))

(defn user-repl-cli
  "CLI entrypoint for using the MetaBot REPL.

    clj -X:ee:metabot-v3/repl"
  [_options]
  (mdb/setup-db! :create-sample-content? false)
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "Starting MetaBot REPL... 🤖")
  (user-repl [] {} (str (random-uuid)))
  (System/exit 0))

(comment
  (require 'metabase.api.common)
  (binding [metabase.api.common/*current-user-permissions-set* (delay #{"/"})
            metabase.api.common/*current-user-id* 2
            metabase.api.common/*is-superuser?* true]
    (user-repl [] {} (str (random-uuid))))

  (defn test-context
    []
    (let [test-query {:dataset_query {:database 1, :type "query", :query {:source-table 27}},
                      :display "table",
                      :visualization_settings {},
                      :type "question"}]
      {:user_is_viewing [{:type :dashboard
                          :id 5
                          :parameters []
                          :is-embedded false}
                         {:type :table
                          :id 27}
                         {:type :model
                          :id 18}
                         {:type :metric
                          :id 135}
                         {:type :report
                          :id 43}
                         {:type :adhoc
                          :query test-query}]}))

  (defn- user-repl-with-context [context]
    (user-repl [] context (str (random-uuid))))

  #_{:clj-kondo/ignore [:metabase/modules]}
  (require '[metabase.test :as mt])

  ;; Discounted orders only
  (mt/with-test-user :crowberto
    (user-repl-with-context
     {:user_is_viewing [{:type :table :ref 5}]}))

  ;; subscribe me to this dashboard every week on monday
  (mt/with-test-user :crowberto
    (user-repl-with-context
     {:user_is_viewing [{:type :dashboard :ref 11}]}))

  ;; filter on the last 6 months
  ;; actually, only filter for current year
  (mt/with-test-user :crowberto
    (user-repl-with-context
     {:user_is_viewing [{:type :report :ref 111}]}))

  ;; any outliers?
  ;; breakout by plan
  (mt/with-test-user :crowberto
    (user-repl-with-context
     {:user_is_viewing [{:type :metric :id 122}]})))
