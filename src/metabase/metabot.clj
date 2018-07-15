(ns metabase.metabot
  (:refer-clojure :exclude [list +])
  (:require [aleph.http :as aleph]
            [cheshire.core :as json]
            [clojure
             [edn :as edn]
             [string :as str]]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
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
            [metabase.util
             [date :as du]
             [urls :as urls]]
            [puppetlabs.i18n.core :refer [trs tru]]
            [throttle.core :as throttle]
            [toucan.db :as db]))

(defsetting metabot-enabled
  (tru "Enable MetaBot, which lets you search for and view your saved questions directly via Slack.")
  :type    :boolean
  :default false)


;;; ------------------------------------- Deciding which instance is the MetaBot -------------------------------------

;; Close your eyes, and imagine a scenario: someone is running multiple Metabase instances in a horizontal cluster.
;; Good for them, but how do we make sure one, and only one, of those instances, replies to incoming MetaBot commands?
;; It would certainly be too much if someone ran, say, 4 instances, and typing `metabot kanye` into Slack gave them 4
;; Kanye West quotes, wouldn't it?
;;
;; Luckily, we have an "elegant" solution: we'll use the Settings framework to keep track of which instance is
;; currently serving as the MetaBot. We'll have that instance periodically check in; if it doesn't check in for some
;; timeout interval, we'll consider the job of MetaBot up for grabs. Each instance will periodically check if the
;; MetaBot job is open, and, if so, whoever discovers it first will take it.


;; How do we uniquiely identify each instance?
;;
;; `local-process-uuid` is randomly-generated upon launch and used to identify this specific Metabase instance during
;; this specifc run. Restarting the server will change this UUID, and each server in a hortizontal cluster will have
;; its own ID, making this different from the `site-uuid` Setting. The local process UUID is used to differentiate
;; different horizontally clustered MB instances so we can determine which of them will handle MetaBot duties.
;;
;; TODO - if we ever want to use this elsewhere, we need to move it to `metabase.config` or somewhere else central
;; like that.
(defonce ^:private local-process-uuid
  (str (java.util.UUID/randomUUID)))

(defsetting ^:private metabot-instance-uuid
  "UUID of the active MetaBot instance (the Metabase process currently handling MetaBot duties.)"
  ;; This should be cached because we'll be checking it fairly often, basically every 2 seconds as part of the
  ;; websocket monitor thread to see whether we're MetaBot (the thread won't open the WebSocket unless that instance
  ;; is handling MetaBot duties)
  :internal? true)

(defsetting ^:private metabot-instance-last-checkin
  "Timestamp of the last time the active MetaBot instance checked in."
  :internal? true
  ;; caching is disabled for this, since it is intended to be updated frequently (once a minute or so) If we use the
  ;; cache, it will trigger cache invalidation for all the other instances (wasteful), and possibly at any rate be
  ;; incorrect (for example, if another instance checked in a minute ago, our local cache might not get updated right
  ;; away, causing us to falsely assume the MetaBot role is up for grabs.)
  :cache?    false
  :type      :timestamp)

(defn- current-timestamp-from-db
  "Fetch the current timestamp from the DB. Why do this from the DB? It's not safe to assume multiple instances have
  clocks exactly in sync; but since each instance is using the same application DB, we can use it as a cannonical
  source of truth."
  ^java.sql.Timestamp []
  (-> (db/query {:select [[(hsql/raw "current_timestamp") :current_timestamp]]})
      first
      :current_timestamp))

(defn- update-last-checkin!
  "Update the last checkin timestamp recorded in the DB."
  []
  (metabot-instance-last-checkin (current-timestamp-from-db)))

(defn- seconds-since-last-checkin
  "Return the number of seconds since the active MetaBot instance last checked in (updated the
  `metabot-instance-last-checkin` Setting). If a MetaBot instance has *never* checked in, this returns `nil`. (Since
  `last-checkin` is one of the few Settings that isn't cached, this always requires a DB call.)"
  []
  (when-let [last-checkin (metabot-instance-last-checkin)]
    (u/prog1 (-> (- (.getTime (current-timestamp-from-db))
                    (.getTime last-checkin))
                 (/ 1000))
      (log/debug (u/format-color 'magenta (trs "Last MetaBot checkin was {0} ago." (du/format-seconds <>)))))))

(def ^:private ^Integer recent-checkin-timeout-interval-seconds
  "Number of seconds since the last MetaBot checkin that we will consider the MetaBot job to be 'up for grabs',
  currently 3 minutes. (i.e. if the current MetaBot job holder doesn't check in for more than 3 minutes, it's up for
  grabs.)"
  (int (* 60 3)))

(defn- last-checkin-was-not-recent?
  "`true` if the last checkin of the active MetaBot instance was more than 3 minutes ago, or if there has never been a
  checkin. (This requires DB calls, so it should not be called too often -- once a minute [at the time of this
  writing] should be sufficient.)"
  []
  (if-let [seconds-since-last-checkin (seconds-since-last-checkin)]
    (> seconds-since-last-checkin
       recent-checkin-timeout-interval-seconds)
    true))

(defn- am-i-the-metabot?
  "Does this instance currently have the MetaBot job? (Does not require any DB calls, so may safely be called
  often (i.e. in the websocket monitor thread loop.)"
  []
  (= (metabot-instance-uuid)
     local-process-uuid))

(defn- become-metabot!
  "Direct this instance to assume the duties of acting as MetaBot, and update the Settings we use to track assignment
  accordingly."
  []
  (log/info (u/format-color 'green (trs "This instance will now handle MetaBot duties.")))
  (metabot-instance-uuid local-process-uuid)
  (update-last-checkin!))


;;; ------------------------------------------------- Perms Checking -------------------------------------------------

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


;;; -------------------------------------------- Metabot Command Handlers --------------------------------------------

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
       (keys-description (tru "Here''s what I can {0}:" verb) fn-map))
      ([what & args]
       (if-let [f (fn-map (keyword what))]
         (apply f args)
         (tru "I don''t know how to {0} `{1}`.\n{2}"
                 verb
                 (if (instance? clojure.lang.Named what)
                   (name what)
                   what)
                 (dispatch*)))))))

(defn- format-exception
  "Format a `Throwable` the way we'd like for posting it on slack."
  [^Throwable e]
  (tru "Uh oh! :cry:\n> {0}" (.getMessage e)))

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
    (tru "Here''s your {0} most recent cards:\n{1}" (count cards) (format-cards cards))))

(defn- card-with-name [card-name]
  (first (u/prog1 (db/select [Card :id :name], :%lower.name [:like (str \% (str/lower-case card-name) \%)])
           (when (> (count <>) 1)
             (throw (Exception.
                     (str (tru "Could you be a little more specific? I found these cards with names that matched:\n{0}"
                               (format-cards <>)))))))))

(defn- id-or-name->card [card-id-or-name]
  (cond
    (integer? card-id-or-name)     (db/select-one [Card :id :name], :id card-id-or-name)
    (or (string? card-id-or-name)
        (symbol? card-id-or-name)) (card-with-name card-id-or-name)
    :else                          (throw (Exception.
                                           (str (tru "I don''t know what Card `{0}` is. Give me a Card ID or name."
                                                     card-id-or-name))))))


(defn ^:metabot show
  "Implementation of the `metabot show card <name-or-id>` command."
  ([]
   (tru "Show which card? Give me a part of a card name or its ID and I can show it to you. If you don''t know which card you want, try `metabot list`."))
  ([card-id-or-name]
   (if-let [{card-id :id} (id-or-name->card card-id-or-name)]
     (do
       (with-metabot-permissions
         (read-check Card card-id))
       (do-async (let [attachments (pulse/create-and-upload-slack-attachments!
                                    (pulse/create-slack-attachment-data
                                     [(pulse/execute-card card-id, :context :metabot)]))]
                   (slack/post-chat-message! *channel-id*
                                             nil
                                             attachments)))
       (tru "Ok, just a second..."))
     (throw (Exception. (str (tru "Not Found"))))))
  ;; If the card name comes without spaces, e.g. (show 'my 'wacky 'card) turn it into a string an recur: (show "my
  ;; wacky card")
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


;;; -------------------------------------------- Metabot Command Dispatch --------------------------------------------

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


;;; --------------------------------------------- Metabot Input Handling ---------------------------------------------

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


;;; ------------------------------------------- Websocket Connection Stuff -------------------------------------------

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

;; we'll use a THROTTLER to implement exponential backoff for recconenction attempts, since THROTTLERS are designed
;; with for this sort of thing e.g. after the first failed connection we'll wait 2 seconds, then each that amount
;; increases by the `:delay-exponent` of 1.3. So our reconnection schedule will look something like:
;;
;; number of consecutive failed attempts | seconds before next try (rounded up to nearest multiple of 2 seconds)
;; --------------------------------------+----------------------------------------------------------------------
;;                                    0  |   2
;;                                    1  |   4
;;                                    2  |   4
;;                                    3  |   6
;;                                    4  |   8
;;                                    5  |  14
;;                                    6  |  30
;;
;; we'll throttle this based on values of the `slack-token` setting; that way if someone changes its value they won't
;; have to wait whatever the exponential delay is before the connection is retried
(def ^:private reconnection-attempt-throttler
  (throttle/make-throttler nil :attempts-threshold 1, :initial-delay-ms 2000, :delay-exponent 1.3))

(defn- should-attempt-to-reconnect? ^Boolean []
  (boolean
   (u/ignore-exceptions
     (throttle/check reconnection-attempt-throttler (slack/slack-token))
     true)))

(defn- reopen-websocket-connection-if-needed!
  "Check to see if websocket connection is [still] open, [re-]open it if not."
  []
  ;; Only open the Websocket connection if this instance is the MetaBot
  (when (am-i-the-metabot?)
    (when (= (.getId (Thread/currentThread)) @websocket-monitor-thread-id)
      (try
        (when (or (not  @websocket)
                  (s/closed? @websocket))
          (log/debug (trs "MetaBot WebSocket is closed. Reconnecting now."))
          (connect-websocket!))
        (catch Throwable e
          (log/error (trs "Error connecting websocket:") (.getMessage e)))))))

(defn- start-websocket-monitor! []
  (future
    (reset! websocket-monitor-thread-id (.getId (Thread/currentThread)))
    (loop []
      ;; Every 2 seconds...
      (while (not (should-attempt-to-reconnect?))
        (Thread/sleep 2000))
      (reopen-websocket-connection-if-needed!)
      (recur))))


(defn- check-and-update-instance-status!
  "Check whether the current instance is serving as the MetaBot; if so, update the last checkin timestamp; if not, check
  whether we should become the MetaBot (and do so if we should)."
  []
  (cond
    ;; if we're already the MetaBot instance, update the last checkin timestamp
    (am-i-the-metabot?)
    (do
      (log/debug (trs "This instance is performing MetaBot duties."))
      (update-last-checkin!))
    ;; otherwise if the last checkin was too long ago, it's time for us to assume the mantle of MetaBot
    (last-checkin-was-not-recent?)
    (become-metabot!)
    ;; otherwise someone else is the MetaBot and we're done here! woo
    :else
    (log/debug (u/format-color 'blue (trs "Another instance is already handling MetaBot duties.")))))

(defn- start-instance-monitor! []
  (future
    (loop []
      (check-and-update-instance-status!)
      (Thread/sleep (* 60 1000))
      (recur))))

(defn- seconds-to-wait-before-starting
  "Return a random number of seconds to wait before starting MetaBot processess, between 0 and 59. This is done to
  introduce a bit of jitter that should prevent a rush of multiple instances all racing to become the MetaBot at the
  same time."
  []
  (mod (.nextInt (java.security.SecureRandom.)) 60))

(defn start-metabot!
  "Start the MetaBot! :robot_face:

  This will spin up a background thread that opens and maintains a Slack WebSocket connection."
  []
  (future
    (Thread/sleep (* 1000 (seconds-to-wait-before-starting)))
    (when (and (slack/slack-token)
               (metabot-enabled))
      (log/info (trs "Starting MetaBot threads..."))
      (start-websocket-monitor!)
      (start-instance-monitor!))))

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
