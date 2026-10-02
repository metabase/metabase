(ns metabase.oauth-server.last-use
  "When a registered client last acted as one of this instance's users: the throttled `last_used_at` write."
  (:require
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.util.log :as log]
   [metabase.util.timer-cache :as timer-cache]))

(set! *warn-on-reflection* true)

(def ^:private client-last-used-times
  "Throttles the `last_used_at` writes, keyed by `client_id`."
  (timer-cache/cache))

(def ^:private last-used-write-throttle-ms
  "Minimum interval between `last_used_at` writes for the same client, in milliseconds."
  60000)

(defn prune-client-use-cache!
  "Drop the throttle entries older than the window, which are no longer throttling anything."
  []
  (timer-cache/prune! client-last-used-times last-used-write-throttle-ms))

(defn clear-client-use-cache!
  "Empty the throttle cache. Intended for use in tests."
  []
  (timer-cache/clear! client-last-used-times))

(defn touch-client-if-due!
  "Stamp `last_used_at` on `client-id` unless a write for it is throttled. Never throws, and returns nothing a caller
  should read."
  [client-id]
  (when (timer-cache/record-if-due! client-last-used-times last-used-write-throttle-ms client-id)
    ;; swallowed: this runs once a response is on its way out, and when a client was last used is not worth failing
    ;; a request the token was good for
    (try
      (oauth-server.db/touch-client! client-id)
      (catch Exception e
        (log/warnf "Failed to update OAuth client last_used_at: %s" (ex-message e))))))
