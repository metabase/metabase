(ns metabase.login-history.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting send-email-on-first-login-from-new-device
  ;; no need to i18n -- this isn't user-facing
  "Should we send users a notification email the first time they log in from a new device? (Default: true). This is
  currently only configurable via environment variable so users who gain access to an admin's credentials cannot
  disable this Setting and access their account without them knowing."
  :type       :boolean
  :visibility :internal
  :setter     :none
  :default    true
  :doc "This variable also controls the geocoding service that Metabase uses to know the location of your logged in users.
        Setting this variable to false also disables this reverse geocoding functionality.")

(defsetting new-device-email-rate-limit-cap
  "Maximum number of new-device login emails to send per user per day. Circuit breaker that
   protects the instance's shared SMTP budget (alerts, subscriptions, password resets) from
   being drained by cookie-churn patterns — typically a single user in an incognito loop or
   behind a broken embed integration that keeps minting new device_ids. Env-only so an
   attacker with admin creds cannot disable it."
  :type       :integer
  :visibility :internal
  :setter     :none
  :export?    false
  :default    10)
