(ns metabase.session.settings
  (:require
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting reset-token-ttl-hours
  (deferred-tru "Number of hours a password reset is considered valid.")
  :visibility :internal
  :type       :integer
  :default    48
  :audit      :getter)
