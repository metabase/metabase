(ns metabase.metabot.instance
  "Logic for deciding which Metabase instance in a multi-instance (i.e., horizontally scaled) setup gets to be the
  MetaBot.

  Close your eyes, and imagine a scenario: someone is running multiple Metabase instances in a horizontal cluster.
  Good for them, but how do we make sure one, and only one, of those instances, replies to incoming MetaBot commands?
  It would certainly be too much if someone ran, say, 4 instances, and typing `metabot kanye` into Slack gave them 4
  Kanye West quotes, wouldn't it?

  Luckily, we have an \"elegant\" solution: we'll use the Settings framework to keep track of which instance is
  currently serving as the MetaBot. We'll have that instance periodically check in; if it doesn't check in for some
  timeout interval, we'll consider the job of MetaBot up for grabs. Each instance will periodically check if the
  MetaBot job is open, and, if so, whoever discovers it first will take it.

  How do we uniquiely identify each instance?

  `metabase.public-settings/local-process-uuid` is randomly-generated upon launch and used to identify this specific
  Metabase instance during this specifc run. Restarting the server will change this UUID, and each server in a
  hortizontal cluster will have its own ID, making this different from the `site-uuid` Setting. The local process UUID
  is used to differentiate different horizontally clustered MB instances so we can determine which of them will handle
  MetaBot duties."
  (:require [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase
             [config :refer [local-process-uuid]]
             [util :as u]]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import java.time.temporal.Temporal))

(defsetting ^:private metabot-instance-uuid
  "UUID of the active MetaBot instance (the Metabase process currently handling MetaBot duties.)"
  ;; This should be cached because we'll be checking it fairly often, basically every 2 seconds as part of the
  ;; websocket monitor thread to see whether we're MetaBot (the thread won't open the WebSocket unless that instance
  ;; is handling MetaBot duties)
  :visibility :internal)

(defsetting ^:private metabot-instance-last-checkin
  "Timestamp of the last time the active MetaBot instance checked in."
  :visibility :internal
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
  ^Temporal []
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
    (u/prog1 (.getSeconds (t/duration last-checkin (current-timestamp-from-db)))
      (log/debug (u/format-color 'magenta (trs "Last MetaBot checkin was {0} ago." (u/format-seconds <>)))))))

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

(defn am-i-the-metabot?
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


(defn start-instance-monitor!
  "Start the thread that will monitor whether this Metabase instance should become, or cease being, the instance that
  handles MetaBot functionality."
  []
  (future
    (loop []
      (check-and-update-instance-status!)
      (Thread/sleep (* 60 1000))
      (recur))))
