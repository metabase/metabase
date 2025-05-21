(ns metabase.driver.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ssh-heartbeat-interval-sec
  (deferred-tru "Controls how often the heartbeats are sent when an SSH tunnel is established (in seconds).")
  :visibility :public
  :type       :integer
  :default    180
  :audit      :getter)
