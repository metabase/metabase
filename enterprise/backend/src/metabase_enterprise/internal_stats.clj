(ns metabase-enterprise.internal-stats
  (:require
   [metabase.models.setting :as setting]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise embedding-settings
  "Boolean values that report on the state of different embedding configurations."
  :feature :none
  [embedded-dashboard-count embedded-question-count]
  {:enabled-embedding-static      (boolean (and (setting/get :enable-embedding-sdk)
                                                (or (> embedded-question-count 0)
                                                    (> embedded-dashboard-count 0))))
   :enabled-embedding-interactive (boolean (and (setting/get :enable-embedding-interactive)
                                                (setting/get :embedding-app-origins-interactive)
                                                (or (setting/get :jwt-enabled)
                                                    (setting/get :saml-enabled)
                                                    (setting/get :ldap-enabled)
                                                    (setting/get :google-auth-enabled))))
   :enabled-embedding-sdk         (boolean  (and  (setting/get :enable-embedding-sdk)
                                                  (setting/get :jwt-enabled)))})
