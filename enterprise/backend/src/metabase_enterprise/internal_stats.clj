(ns metabase-enterprise.internal-stats
  (:require
   [metabase.models.setting :as setting]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise embedding-settings
  "Boolean values that report on the state of different embedding configurations."
  :feature :none
  [embedded-dashboard-count embedded-question-count]
  {:enabled-embedding-static      (boolean (and (setting/get-raw-value :enable-embedding-static)
                                                (or (> embedded-question-count 0)
                                                    (> embedded-dashboard-count 0))))
   :enabled-embedding-interactive (boolean (and (setting/get-raw-value :enable-embedding-interactive)
                                                (setting/get-raw-value :embedding-app-origins-interactive)
                                                (or (setting/get-raw-value :jwt-enabled)
                                                    (setting/get-raw-value :saml-enabled)
                                                    (setting/get-raw-value :ldap-enabled)
                                                    (setting/get-raw-value :google-auth-enabled))))
   :enabled-embedding-sdk         (boolean  (and  (setting/get-raw-value :enable-embedding-sdk)
                                                  (setting/get-raw-value :jwt-enabled)))})
