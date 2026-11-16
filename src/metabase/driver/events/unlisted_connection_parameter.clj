(ns metabase.driver.events.unlisted-connection-parameter
  (:require
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/unlisted-connection-parameter ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [driver parameter]}]
  (log/warnf (str "Connection parameter %s for driver %s is in neither its allowed nor its disallowed connection"
                  " parameters. It is allowed for now, but may be refused in a future version.")
             (pr-str parameter) driver))
