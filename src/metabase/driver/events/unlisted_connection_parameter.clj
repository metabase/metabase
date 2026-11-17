(ns metabase.driver.events.unlisted-connection-parameter
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/unlisted-connection-parameter ::event)

(def ^:private warn!
  "Log the warning for an unlisted `parameter` of `driver` once for each pair: every connection pool a database creates
  reports its parameters again. The cache is bounded, so past that many pairs the least recently seen may warn again."
  (memoize/lru
   (fn [driver parameter]
     (log/warnf (str "Connection parameter %s for driver %s is in neither its allowed nor its disallowed connection"
                     " parameters. It is allowed for now, but may be refused in a future version.")
                (pr-str parameter) driver))
   :lru/threshold 1000))

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [driver parameter]}]
  (warn! driver parameter))
