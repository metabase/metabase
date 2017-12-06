(ns metabase.metabot
  (:refer-clojure :exclude [list +])
  (:require [aleph.http :as aleph]
            [cheshire.core :as json]
            [clojure
             [edn :as edn]
             [string :as str]]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [manifold
             [deferred :as d]
             [stream :as s]]
            [metabase
             [pulse :as pulse]
             [util :as u]]
            [metabase.api.common :refer [*current-user-permissions-set* read-check]]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [card :refer [Card]]
             [interface :as mi]
             [permissions :refer [Permissions]]
             [permissions-group :as perms-group]
             [setting :as setting :refer [defsetting]]]
            [metabase.util.urls :as urls]
            [puppetlabs.i18n.core :refer [tru trs]]
            [throttle.core :as throttle]
            [toucan.db :as db]))

(defsetting metabot-enabled
  (tru "Enable MetaBot, which lets you search for and view your saved questions directly via Slack.")
  :type    :boolean
  :default false)


;;; ------------------------------------------------------------ Perms Checking ------------------------------------------------------------

(defn- metabot-permissions
  "Return the set of permissions granted to the MetaBot."
  []
  (db/select-field :object Permissions, :group_id (u/get-id (perms-group/metabot))))

(defn- do-with-metabot-permissions [f]
  (binding [*current-user-permissions-set* (delay (metabot-permissions))]
    (f)))

(defmacro ^:private with-metabot-permissions
  "Execute BODY with MetaBot's permissions bound to `*current-user-permissions-set*`."
  {:style/indent 0}
  [& body]
  `(do-with-metabot-permissions (fn [] ~@body)))


;;; # ------------------------------------------------------------ Metabot Command Handlers ------------------------------------------------------------

(def ^:private ^:dynamic *channel-id* nil)

(defn- keys-description
  ([message m]
   (str message " " (keys-description m)))
  ([m]
   (str/join ", " (sort (for [[k varr] m
                              :when    (not (:unlisted (meta varr)))]
                          (str \` (name k) \`))))))

(defn- dispatch-fn [verb tag]
  (let [fn-map (into {} (for [[symb varr] (ns-interns *ns*)
                              :let        [dispatch-token (get (meta varr) tag)]
                              :when       dispatch-token]
                          {(if (true? dispatch-token)
                             (keyword symb)
                             dispatch-token) varr}))]
    (fn dispatch*
      ([]
       (keys-description (tru "Here's what I can {0}:" verb) fn-map))
      ([what & args]
       (if-let [f (fn-map (keyword what))]
         (apply f args)
         (tru "I don't know how to {0} `{1}`.\n{2}"
                 verb
                 (if (instance? clojure.lang.Named what)
                   (name what)
                   what)
                 (dispatch*)))))))

(defn- format-exception
  "Format a `Throwable` the way we'd like for posting it on slack."
  [^Throwable e]
  (tru "Uh oh! :cry:\n>" (.getMessage e)))

(defmacro ^:private do-async {:style/indent 0} [& body]
  `(future (try ~@body
                (catch Throwable e#
                  (log/error (u/format-color '~'red (u/filtered-stacktrace e#)))
                  (slack/post-chat-message! *channel-id* (format-exception e#))))))

(defn- format-cards
  "Format a sequence of Cards as a nice multiline list for use in responses."
  [cards]
  (apply str (interpose "\n" (for [{id :id, card-name :name} cards]
                               (format "%d.  <%s|\"%s\">" id (urls/card-url id) card-name)))))


(defn ^:metabot list
  "Implementation of the `metabot list cards` command."
  [& _]
  (let [cards (with-metabot-permissions
                (filterv mi/can-read? (db/select [Card :id :name :dataset_query], {:order-by [[:id :desc]], :limit 20})))]
    (tru "Here's your {0} most recent cards:\n{1}" (count cards) (format-cards cards))))

(defn- card-with-name [card-name]
  (first (u/prog1 (db/select [Card :id :name], :%lower.name [:like (str \% (str/lower-case card-name) \%)])
           (when (> (count <>) 1)
             (throw (Exception. (tru "Could you be a little more specific? I found these cards with names that matched:\n{0}"
                                     (format-cards <>))))))))

(defn- id-or-name->card [card-id-or-name]
  (cond
    (integer? card-id-or-name)     (db/select-one [Card :id :name], :id card-id-or-name)
    (or (string? card-id-or-name)
        (symbol? card-id-or-name)) (card-with-name card-id-or-name)
    :else                          (throw (Exception. (tru "I don't know what Card `{0}` is. Give me a Card ID or name." card-id-or-name)))))


(defn ^:metabot show
  "Implementation of the `metabot show card <name-or-id>` command."
  ([]
   (tru "Show which card? Give me a part of a card name or its ID and I can show it to you. If you don't know which card you want, try `metabot list`."))
  ([card-id-or-name]
   (if-let [{card-id :id} (id-or-name->card card-id-or-name)]
     (do
       (with-metabot-permissions
         (read-check Card card-id))
       (do-async (let [attachments (pulse/create-and-upload-slack-attachments! (pulse/create-slack-attachment-data [(pulse/execute-card card-id, :context :metabot)]))]
                   (slack/post-chat-message! *channel-id*
                                             nil
                                             attachments)))
       (tru "Ok, just a second..."))
     (throw (Exception. (tru "Not Found")))))
  ;; If the card name comes without spaces, e.g. (show 'my 'wacky 'card) turn it into a string an recur: (show "my wacky card")
  ([word & more]
   (show (str/join " " (cons word more)))))


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
  (delay (log/debug (trs "Loading Kanye quotes..."))
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
  (when (string? s)
    ;; if someone just typed "metabot" (no command) act like they typed "metabot help"
    (let [s (if (seq s)
              s
              "help")]
      (log/debug (trs "Evaluating Metabot command:") s)
      (when-let [tokens (seq (edn/read-string (str "(" (-> s
                                                           (str/replace "“" "\"") ; replace smart quotes
                                                           (str/replace "”" "\"")) ")")))]
        (apply apply-metabot-fn tokens)))))


;;; # ------------------------------------------------------------ Metabot Input Handling ------------------------------------------------------------

(defn- message->command-str
  "Get the command portion of a message *event* directed at Metabot.

     (message->command-str {:text \"metabot list\"}) -> \"list\""
  [{:keys [text]}]
  (when (seq text)
    (second (re-matches #"^mea?ta?boa?t\s*(.*)$" text)))) ; handle typos like metaboat or meatbot

(defn- respond-to-message! [message response]
  (when response
    (let [response (if (coll? response) (str "```\n" (u/pprint-to-str response) "```")
                       (str response))]
      (when (seq response)
        (slack/post-chat-message! (:channel message) response)))))

(defn- handle-slack-message [message]
  (respond-to-message! message (eval-command-str (message->command-str message))))

(defn- human-message?
  "Was this Slack WebSocket event one about a *human* sending a message?"
  [{event-type :type, subtype :subtype}]
  (and (= event-type "message")
       (not (contains? #{"bot_message" "message_changed" "message_deleted"} subtype))))

(defn- event-timestamp-ms
  "Get the UNIX timestamp of a Slack WebSocket event, in milliseconds."
  [{:keys [ts], :or {ts "0"}}]
  (* (Double/parseDouble ts) 1000))


(defonce ^:private websocket (atom nil))

(defn- handle-slack-event [socket start-time event]
  (when-not (= socket @websocket)
    (log/debug (trs "Go home websocket, you're drunk."))
    (s/close! socket)
    (throw (Exception.)))

  (when-let [event (json/parse-string event keyword)]
    ;; Only respond to events where a *human* sends a message that have happened *after* the MetaBot launches
    (when (and (human-message? event)
               (> (event-timestamp-ms event) start-time))
      (binding [*channel-id* (:channel event)]
        (do (future (try
                      (handle-slack-message event)
                      (catch Throwable t
                        (slack/post-chat-message! *channel-id* (format-exception t)))))
            nil)))))


;;; # ------------------------------------------------------------ Websocket Connection Stuff ------------------------------------------------------------

(defn- connect-websocket! []
  (when-let [websocket-url (slack/websocket-url)]
    (let [socket @(aleph/websocket-client websocket-url)]
      (reset! websocket socket)
      (d/catch (s/consume (partial handle-slack-event socket (System/currentTimeMillis))
                          socket)
          (fn [error]
            (log/error (trs "Error launching metabot:") error))))))

(defn- disconnect-websocket! []
  (when-let [socket @websocket]
    (reset! websocket nil)
    (when-not (s/closed? socket)
      (s/close! socket))))

;;; Websocket monitor

;; Keep track of the Thread ID of the current monitor thread. Monitor threads should check this ID
;; and if it is no longer equal to theirs they should die
(defonce ^:private websocket-monitor-thread-id (atom nil))

;; we'll use a THROTTLER to implement exponential backoff for recconenction attempts, since THROTTLERS are designed with for this sort of thing
;; e.g. after the first failed connection we'll wait 2 seconds, then each that amount increases by the `:delay-exponent` of 1.3
;; so our reconnection schedule will look something like:
;; number of consecutive failed attempts | seconds before next try (rounded up to nearest multiple of 2 seconds)
;; --------------------------------------+----------------------------------------------------------------------
;;                                    0  |   2
;;                                    1  |   4
;;                                    2  |   4
;;                                    3  |   6
;;                                    4  |   8
;;                                    5  |  14
;;                                    6  |  30
;; we'll throttle this based on values of the `slack-token` setting; that way if someone changes its value they won't have to wait
;; whatever the exponential delay is before the connection is retried
(def ^:private reconnection-attempt-throttler
  (throttle/make-throttler nil :attempts-threshold 1, :initial-delay-ms 2000, :delay-exponent 1.3))

(defn- should-attempt-to-reconnect? ^Boolean []
  (boolean (u/ignore-exceptions
             (throttle/check reconnection-attempt-throttler (slack/slack-token))
             true)))

(defn- start-websocket-monitor! []
  (future
    (reset! websocket-monitor-thread-id (.getId (Thread/currentThread)))
    ;; Every 2 seconds check to see if websocket connection is [still] open, [re-]open it if not
    (loop []
      (while (not (should-attempt-to-reconnect?))
        (Thread/sleep 2000))
      (when (= (.getId (Thread/currentThread)) @websocket-monitor-thread-id)
        (try
          (when (or (not  @websocket)
                    (s/closed? @websocket))
            (log/debug (trs "MetaBot WebSocket is closed. Reconnecting now."))
            (connect-websocket!))
          (catch Throwable e
            (log/error (trs "Error connecting websocket:") (.getMessage e))))
        (recur)))))

(defn start-metabot!
  "Start the MetaBot! :robot_face:

   This will spin up a background thread that opens and maintains a Slack WebSocket connection."
  []
  (when (and (slack/slack-token)
             (metabot-enabled))
    (log/info "Starting MetaBot WebSocket monitor thread...")
    (start-websocket-monitor!)))

(defn stop-metabot!
  "Stop the MetaBot! :robot_face:

   This will stop the background thread that responsible for the Slack WebSocket connection."
  []
  (log/info (trs "Stopping MetaBot...  🤖"))
  (reset! websocket-monitor-thread-id nil)
  (disconnect-websocket!))

(defn restart-metabot!
  "Restart the MetaBot listening process.
   Used on settings changed"
  []
  (when @websocket-monitor-thread-id
    (log/info (trs "MetaBot already running. Killing the previous WebSocket listener first."))
    (stop-metabot!))
  (start-metabot!))
