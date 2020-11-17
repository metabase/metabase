(ns metabase.metabot.events
  "Logic related to handling Slack events, running commands for events that are messages to the MetaBot, and posting the
  response on Slack."
  (:require [cheshire.core :as json]
            [clojure
             [edn :as edn]
             [string :as str]]
            [clojure.tools.logging :as log]
            [metabase.metabot
             [command :as metabot.cmd]
             [slack :as metabot.slack]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]))

(defn- str->tokens [s]
  (edn/read-string (str "(" (-> s
                                (str/replace "“" "\"") ; replace smart quotes
                                (str/replace "”" "\"")) ")")))

(defn- eval-command-str [s]
  (when (string? s)
    ;; if someone just typed "metabot" (no command) act like they typed "metabot help"
    (let [s (if (seq s)
              s
              "help")]
      (log/debug (trs "Evaluating Metabot command:") s)
      (when-let [tokens (seq (str->tokens s))]
        (apply metabot.cmd/command tokens)))))


;;; --------------------------------------------- Metabot Input Handling ---------------------------------------------

(defn- message->command-str
  "Get the command portion of a message *event* directed at Metabot.

     (message->command-str {:text \"metabot list\"}) -> \"list\""
  [{:keys [text]}]
  (when (seq text)
    (second (re-matches #"^mea?ta?boa?t\s*(.*)$" text)))) ; handle typos like metaboat or meatbot

(defn- respond-to-message! [response]
  (when response
    (let [response (if (coll? response) (str "```\n" (u/pprint-to-str response) "```")
                       (str response))]
      (when (seq response)
        (metabot.slack/post-chat-message! response)))))

(defn- handle-slack-message [message]
  (respond-to-message! (eval-command-str (message->command-str message))))

(defn- human-message?
  "Was this Slack WebSocket event one about a *human* sending a message?"
  [{event-type :type, subtype :subtype}]
  (and (= event-type "message")
       (not (contains? #{"bot_message" "message_changed" "message_deleted"} subtype))))

(defn- event-timestamp-ms
  "Get the UNIX timestamp of a Slack WebSocket event, in milliseconds."
  [{:keys [ts], :or {ts "0"}}]
  (* (Double/parseDouble ts) 1000))

(defn handle-slack-event
  "Handle a Slack `event`; if the event is a message that starts with `metabot`, parse the message, execute the
  appropriate command, and reply with the results."
  [start-time-ms event]
  (when-let [event (json/parse-string event keyword)]
    ;; Only respond to events where a *human* sends a message that have happened *after* the MetaBot launches
    (when (and (human-message? event)
               (> (event-timestamp-ms event) start-time-ms))
      (metabot.slack/with-channel-id (:channel event)
        (metabot.slack/async
          (handle-slack-message event))))))
