(ns metabase.product-feedback.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting follow-up-email-sent
  ;; No need to i18n this as it's not user facing
  "Have we sent a follow up email to the instance admin?"
  :type       :boolean
  :default    false
  :visibility :internal
  :audit      :never)
