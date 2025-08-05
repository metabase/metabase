(ns metabase-enterprise.transforms.settings
  (:require
   [metabase.events.core :as events]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(derive :event/gloabal-transform-schedule-update :metabase/event)

(setting/defsetting transform-schedule
  (deferred-tru "The schedule for automatic execution of scheduled transforms")
  :type       :string
  :visibility :settings-manager
  :default    "0 0 0 * * ? *"
  #_#_:feature    :transform
  :doc        false
  :export?    true
  :encryption :no
  :on-change  (fn [old new]
                (events/publish-event! :event/gloabal-transform-schedule-update {:old-schedule old
                                                                                 :new-schedule new}))
  :audit      :getter)
