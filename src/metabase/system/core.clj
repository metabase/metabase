(ns metabase.system.core
  (:require
   [metabase.system.settings]
   [potemkin :as p]))

(comment metabase.system.settings/keep-me)

(p/import-vars
 [metabase.system.settings
  admin-email
  admin-email!
  available-fonts
  available-locales
  available-timezones
  site-locale
  site-locale!
  site-url
  site-url!
  site-uuid
  startup-time-millis
  startup-time-millis!])
