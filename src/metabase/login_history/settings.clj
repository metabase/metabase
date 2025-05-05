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
