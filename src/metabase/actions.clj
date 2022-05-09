(ns metabase.actions
  "Code related to the new writeback Actions."
  (:require [metabase.models.setting :as setting]
            [metabase.util.i18n :as i18n]))

(setting/defsetting experimental-enable-actions
  (i18n/deferred-tru "Whether to enable using the new experimental Actions features globally. (Actions must also be enabled for each Database.)")
  :default false
  :type :boolean
  :visibility :public)
