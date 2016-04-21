(ns metabase.metabot
  (:refer-clojure :exclude [list +])
  (:require (clojure [edn :as edn]
                     [string :as str])
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [aleph.http :as aleph]
            [cheshire.core :as json]
            [korma.core :as k]
            (manifold [bus :as bus]
                      [deferred :as d]
                      [stream :as s])
            [metabase.api.common :refer [let-404]]
            [metabase.db :refer [sel]]
            [metabase.integrations.slack :as slack]
            [metabase.models.setting :as setting]
            [metabase.task.send-pulses :as pulses]
            [metabase.util :as u]
            [metabase.util.urls :as urls]))

(setting/defsetting metabot-enabled "Enable Metabot, which lets you search for and view your saved questions directly via Slack." "true")

;;; # ------------------------------------------------------------ Metabot Command Handlers ------------------------------------------------------------

(def ^:private ^:dynamic *channel-id* nil)

(defn- keys-description
  ([message m]
   (str message " " (keys-description m)))
  ([m]
   (apply str (interpose ", " (sort (for [[k varr] m
                                          :when    (not (:unlisted (meta varr)))]
                                      (str \` (name k) \`)))))))

(defn- dispatch-fn [verb tag]
  (let [fn-map (into {} (for [[symb varr] (ns-interns *ns*)
                              :let        [dispatch-token (get (meta varr) tag)]
                              :when       dispatch-token]
                          {(if (true? dispatch-token)
                             (keyword symb)
                             dispatch-token) varr}))]
    (fn dispatch*
      ([]
       (keys-description (format "Here's what I can %s:" verb) fn-map))
      ([what & args]
       (if-let [f (fn-map (keyword what))]
         (apply f args)
         (format "I don't know how to %s `%s`.\n%s"
                 verb
                 (if (instance? clojure.lang.Named what)
                   (name what)
                   what)
                 (dispatch*)))))))

(defn- format-exception
  "Format a `Throwable` the way we'd like for posting it on slack."
  [^Throwable e]
  (str "Uh oh! :cry:\n>" (.getMessage e)))

(defmacro ^:private do-async {:style/indent 0} [& body]
  `(do (future (try ~@body
                    (catch Throwable e#
                      (log/error (u/format-color '~'red (u/filtered-stacktrace e#)))
                      (slack/post-chat-message! *channel-id* (format-exception e#)))))
       nil))

(defn- format-cards
  "Format a sequence of Cards as a nice multiline list for use in responses."
  [cards]
  (apply str (interpose "\n" (for [{id :id, card-name :name} cards]
                               (format "%d.  <%s|\"%s\">" id (urls/card-url id) card-name)))))


(defn ^:metabot list
  "Implementation of the `metabot list cards` command."
  [& _]
  (let [cards (sel :many :fields ['Card :id :name] (k/order :id :DESC) (k/limit 20))]
    (str "Here's your " (count cards) " most recent cards:\n" (format-cards cards))))

(defn- card-with-name [card-name]
  (first (u/prog1 (sel :many :fields ['Card :id :name], (k/where {(k/sqlfn :LOWER :name) [like (str \% (str/lower-case card-name) \%)]}))
           (when (> (count <>) 1)
             (throw (Exception. (str "Could you be a little more specific? I found these cards with names that matched:\n"
                                     (format-cards <>))))))))

(defn- id-or-name->card [card-id-or-name]
  (cond
    (integer? card-id-or-name)     (sel :one :fields ['Card :id :name], :id card-id-or-name)
    (or (string? card-id-or-name)
        (symbol? card-id-or-name)) (card-with-name card-id-or-name)
    :else                          (throw (Exception. (format "I don't know what Card `%s` is. Give me a Card ID or name.")))))

(defn ^:metabot show
  "Implementation of the `metabot show card <name-or-id>` command."
  ([]
   "Show which card? Give me a part of a card name or its ID and I can show it to you. If you don't know which card you want, try `metabot list`.")
  ([card-id-or-name & _]
   (let-404 [{card-id :id} (id-or-name->card card-id-or-name)]
     (do-async (pulses/send-pulse! {:cards    [{:id card-id}]
                                    :channels [{:enabled        true
                                                :channel_type   "slack"
                                                :recipients     []
                                                :details        {:channel *channel-id*}
                                                :schedule_type  "hourly"
                                                :schedule_day   "mon"
                                                :schedule_hour  8
                                                :schedule_frame "first"}]})))
   "Ok, just a second..."))


(defn meme:up-and-to-the-right
  "Implementation of the `metabot meme up-and-to-the-right <title>` command."
  {:meme :up-and-to-the-right}
  [& _]
  ":chart_with_upwards_trend:")

(def ^:metabot ^:unlisted meme
  "Dispatch function for the `metabot meme` family of commands."
  (dispatch-fn "meme" :meme))


(declare apply-metabot-fn)

(defn ^:metabot help
  "Implementation of the `metabot help` command."
  [& _]
  (apply-metabot-fn))


(def ^:private kanye-quotes
  (delay (log/debug "Loading kanye quotes...")
         (when-let [data (slurp (io/reader (io/resource "kanye-quotes.edn")))]
           (edn/read-string data))))

(defn ^:metabot ^:unlisted kanye
  "Implementation of the `metabot kanye` command."
  [& _]
  (str ":kanye:\n> " (rand-nth @kanye-quotes)))


;;; # ------------------------------------------------------------ Metabot Command Dispatch ------------------------------------------------------------

(def ^:private apply-metabot-fn
  (dispatch-fn "understand" :metabot))

(defn- eval-command-str [s]
  (when (seq s)
    (when-let [tokens (seq (edn/read-string (str "(" (-> s
                                                         (str/replace "“" "\"") ; replace smart quotes
                                                         (str/replace "”" "\"")) ")")))]
      (apply apply-metabot-fn tokens))))


;;; # ------------------------------------------------------------ Metabot Input Handling ------------------------------------------------------------

(defn- message->command-str [{:keys [text]}]
  (when (seq text)
    (second (re-matches #"^mea?ta?boa?t\s+(.*)$" text))))

(defn- respond-to-message! [message response]
  (when response
    (let [response (if (coll? response) (str "```\n" (u/pprint-to-str response) "```")
                       (str response))]
      (when (seq response)
        (slack/post-chat-message! (:channel message) response)))))

(defn- handle-slack-message [message]
  (respond-to-message! message (eval-command-str (message->command-str message))))

(defn- human-message? [{event-type :type, subtype :subtype}]
  (and (= event-type "message")
       (not (contains? #{"bot_message" "message_changed" "message_deleted"} subtype))))

(defn- event-timestamp-ms [{:keys [ts], :or {ts "0"}}]
  (* (Double/parseDouble ts) 1000))


(defonce ^:private websocket (atom nil))

(defn- handle-slack-event [socket start-time event]
  (when-not (= socket @websocket)
    (log/debug "Go home websocket, you're drunk.")
    (s/close! socket)
    (throw (Exception.)))

  (when-let [event (json/parse-string event keyword)]
    (when (and (human-message? event)
               (> (event-timestamp-ms event) start-time))
      (binding [*channel-id* (:channel event)]
        (do-async (handle-slack-message event))))))


;;; # ------------------------------------------------------------ Websocket Connection Stuff ------------------------------------------------------------

(defn- connect-websocket! []
  (when-let [websocket-url (slack/websocket-url)]
    (let [socket @(aleph/websocket-client websocket-url)]
      (reset! websocket socket)
      (d/catch (s/consume (partial handle-slack-event socket (System/currentTimeMillis))
                          socket)
          (fn [error]
            (log/error "Error launching metabot:" error))))))

(defn- disconnect-websocket! []
  (when-let [socket @websocket]
    (reset! websocket nil)
    (when-not (s/closed? socket)
      (s/close! socket))))

;;; Websocket monitor

;; Keep track of the Thread ID of the current monitor thread. Monitor threads should check this ID and if it is no longer equal to
;; theirs they should die
(defonce ^:private websocket-monitor-thread-id (atom nil))

(defn- start-websocket-monitor! []
  (future
    (reset! websocket-monitor-thread-id (.getId (Thread/currentThread)))
    ;; Every 2 seconds check to see if websocket connection is [still] open, [re-]open it if not
    (loop []
      (Thread/sleep 500)
      (when (= (.getId (Thread/currentThread)) @websocket-monitor-thread-id)
        (try
          (when (or (not  @websocket)
                    (s/closed? @websocket))
            (log/debug "MetaBot WebSocket is closed.  Reconnecting now.")
            (connect-websocket!))
          (catch Throwable e
            (log/error "Error connecting websocket:" (.getMessage e))))
        (recur)))))

(defn start-metabot!
  "Start the MetaBot! :robot_face:

   This will spin up a background thread that opens and maintains a Slack WebSocket connection."
  []
  (when (and (setting/get :slack-token)
             (= "true" (metabot-enabled)))
    (log/info "Starting MetaBot WebSocket monitor thread...")
    (start-websocket-monitor!)))

(defn stop-metabot!
  "Stop the MetaBot! :robot_face:

   This will stop the background thread that responsible for the Slack WebSocket connection."
  []
  (log/info "Stopping MetaBot...  🤖")
  (reset! websocket-monitor-thread-id nil)
  (disconnect-websocket!))
