(ns metabase.product-feedback.settings
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :refer [defsetting]]))

(def ^String product-feedback-url
  "Product feedback url. When not prod, reads `MB_PRODUCT_FEEDBACK_URL` from the environment to prevent development
  feedback from hitting the endpoint."
  (if config/is-prod?
    "https://prod-feedback.metabase.com/api/v1/crm/product-feedback"
    (config/config-str :mb-product-feedback-url)))

(defsetting follow-up-email-sent
  ;; No need to i18n this as it's not user facing
  "Have we sent a follow up email to the instance admin?"
  :type       :boolean
  :default    false
  :visibility :internal
  :audit      :never)
