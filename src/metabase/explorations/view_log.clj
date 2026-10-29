(ns metabase.explorations.view-log
  "Records exploration reads in the view log.

  The exploration page polls `GET /api/exploration/:id` every couple of seconds while research is
  running, so repeated reads by one user within [[recent-read-window-ms]] count as a single view."
  (:require
   [clojure.core.cache.wrapped :as cache.wrapped]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [metabase.view-log.core :as view-log]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]))

(events/derive! ::exploration-read :metabase/event)
(events/derive! :event/exploration-read ::exploration-read)

(def ^:private recent-read-window-ms (* 10 60 1000))

(def ^:private recent-reads
  "`[user-id exploration-id]` of reads within [[recent-read-window-ms]]."
  (cache.wrapped/ttl-cache-factory {} :ttl recent-read-window-ms))

(defn- first-read-in-window?
  "True for the one caller that adds `[user-id exploration-id]` to [[recent-reads]]. `lookup-or-miss` runs the
  value function at most once per key, so concurrent readers of the same exploration cannot both claim the first read."
  [user-id exploration-id]
  (let [claim (Object.)]
    (identical? claim (cache.wrapped/lookup-or-miss recent-reads [user-id exploration-id] (constantly claim)))))

(m/defmethod events/publish-event! ::exploration-read
  "Log an exploration view, collapsing the page's polling reads into one view per user."
  [topic {:keys [object-id user-id] :as event}]
  (span/with-span!
    {:name    "view-log-exploration-read"
     :topic   topic
     :user-id user-id}
    (try
      (when (first-read-in-window? user-id object-id)
        (view-log/record-views! (view-log/generate-view :model :model/Exploration event)))
      (catch Throwable e
        (log/warnf "Failed to process exploration view event. %s: %s" topic (ex-message e))))))
