(ns metabase.channel.template.i18n-strings
  "Hack to get i18n strings registered.
  These strings are used in handlebars templates in an unconventional way that our i18n enumeration process can't pick up.
  So we need to register them manually here."
  (:require
   [metabase.util.i18n :as i18n :refer [trs]]))

(comment
  ;; used in User joined email template subject
  (trs "You''re invited to join {0}''s {1}" "First" "Second")
  (trs "Alert: {0} has reached its goal" "First")
  (trs "Alert: {0} has gone below its goal" "First")
  (trs "Alert: {0} has results" "First"))
