(ns metabase.session.core
  (:require
   [metabase.session.db]
   [metabase.session.models.session]
   [metabase.session.query]
   [metabase.session.settings]
   [metabase.util.timer-cache :as timer-cache]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment metabase.session.db/keep-me
         metabase.session.models.session/keep-me
         metabase.session.query/keep-me
         metabase.session.settings/keep-me)

(p/import-vars
 [metabase.session.db
  end-sessions!
  end-sessions-by-ids!]
 [metabase.session.query
  live-expr
  live-session-conditions
  liveness-params
  mcp-provider
  not-mcp-session
  session-from-and-joins
  session-left-joins]
 [metabase.session.models.session
  generate-session-key
  generate-session-id
  hash-session-key]
 (metabase.session.settings
  enable-password-login
  enable-password-login!
  mfa-required?
  password-complexity
  session-cookies))

;;; ------------------------------------------------ session activity tracking -----------------------------------------

(def ^:private session-last-update-times
  "In-memory cache of {session-key-hash -> timer} used to throttle DB writes for last_active_at updates.
   Each session's last_active_at is only written to the DB at most once per `activity-update-throttle-ms`."
  (timer-cache/cache))

(def ^:private activity-update-throttle-ms
  "Minimum interval between last_active_at DB writes for the same session, in milliseconds."
  60000)

(defn record-session-activity-update!
  "Atomically record that a session activity update is happening now if enough time has elapsed since the last update.
   Returns true if the caller should proceed with the DB write, false if throttled."
  [key-hash]
  (timer-cache/record-if-due! session-last-update-times activity-update-throttle-ms key-hash))

(defn prune-session-activity-cache!
  "Remove entries from the session activity throttle cache that are older than the throttle window.
   Called by the session cleanup task to prevent unbounded growth."
  []
  (timer-cache/prune! session-last-update-times activity-update-throttle-ms))

(defn clear-session-activity-cache!
  "Remove all entries from the session activity throttle cache. Intended for use in tests."
  []
  (timer-cache/clear! session-last-update-times))
