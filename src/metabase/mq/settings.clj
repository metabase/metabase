(ns metabase.mq.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting queue-max-retries
  "Maximum number of times a failed queue message will be retried before being dropped."
  :type       :integer
  :default    5
  :visibility :internal
  :encryption :no
  :export?    false)

(defsetting queue-backend
  (str "Which queue backend to use. Valid values: `quartz`, `memory`. When unset, defaults to `quartz`, "
       "or to `memory` when the task scheduler is disabled (`MB_DISABLE_SCHEDULER`).")
  :type       :string
  :visibility :internal
  :encryption :no
  :export?    false)

(defsetting queue-no-listener-max-age-ms
  (str "How long (in milliseconds) a Quartz queue message with no listener anywhere in the cluster "
       "is kept before the reaper drops it. With node-affinity, such a message is never acquired and "
       "just waits in the store; this bounds that wait so a message for a queue no node handles (e.g. "
       "a new queue whose node was rolled back) does not linger forever. Generous by default (1 day) "
       "so a node can restart or be re-upgraded and still deliver it.")
  :type       :integer
  :default    (* 24 60 60 1000)
  :visibility :internal
  :encryption :no
  :export?    false)
