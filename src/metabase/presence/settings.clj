(ns metabase.presence.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting presence-enabled
  (deferred-tru "Show a list of users currently viewing the same dashboard or question (POC).")
  :type       :boolean
  :default    true
  :visibility :public
  :export?    false)

(defsetting presence-ttl-seconds
  (deferred-tru "Seconds a user remains visible in the presence list after their last heartbeat.")
  :type       :integer
  :default    30
  :visibility :internal
  :export?    false)
