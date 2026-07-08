(ns metabase.session.core
  (:require
   [metabase.session.models.session]
   [metabase.session.settings]
   [metabase.util :as u]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment metabase.session.models.session/keep-me
         metabase.session.settings/keep-me)

(p/import-vars
 [metabase.session.models.session
  generate-session-key
  generate-session-id
  hash-session-key]
 (metabase.session.settings
  enable-password-login
  enable-password-login!
  password-complexity
  session-cookies))

;;; ------------------------------------------------ session activity tracking -----------------------------------------

(def ^:private session-last-update-times
  "In-memory cache of {session-key-hash -> timer} used to throttle DB writes for last_active_at updates.
   Each session's last_active_at is only written to the DB at most once per `activity-update-throttle-ms`.
   Timer values are opaque, created by [[metabase.util/start-timer]]."
  (atom {}))

(def ^:private activity-update-throttle-ms
  "Minimum interval between last_active_at DB writes for the same session, in milliseconds."
  60000)

(defn record-session-activity-update!
  "Atomically record that a session activity update is happening now if enough time has elapsed since the last update.
   Returns true if the caller should proceed with the DB write, false if throttled."
  [key-hash]
  (let [now     (u/start-timer)
        old-val @session-last-update-times
        timer   (get old-val key-hash)]
    (if (or (nil? timer)
            (> (u/since-ms timer) activity-update-throttle-ms))
      (compare-and-set! session-last-update-times old-val (assoc old-val key-hash now))
      false)))

(defn prune-session-activity-cache!
  "Remove entries from the session activity throttle cache that are older than the throttle window.
   Called by the session cleanup task to prevent unbounded growth."
  []
  (swap! session-last-update-times
         (fn [m] (into {} (filter (fn [[_ timer]] (<= (u/since-ms timer) activity-update-throttle-ms))) m))))

(defn clear-session-activity-cache!
  "Remove all entries from the session activity throttle cache. Intended for use in tests."
  []
  (reset! session-last-update-times {}))
