(ns metabase-enterprise.internal-stats.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]))

(defenterprise embedding-settings
  "Boolean values that report on the state of different embedding configurations."
  :feature :none
  [embedded-dashboard-count embedded-question-count]
  {:enabled-embedding-static      (boolean (and (setting/get-value-of-type :boolean :enable-embedding-static)
                                                (or (> embedded-question-count 0)
                                                    (> embedded-dashboard-count 0))))
   :enabled-embedding-interactive (boolean (and (setting/get-value-of-type :boolean :enable-embedding-interactive)
                                                (not-empty (setting/get-value-of-type :string :embedding-app-origins-interactive))
                                                (or (setting/get-value-of-type :boolean :jwt-enabled)
                                                    (setting/get-value-of-type :boolean :saml-enabled)
                                                    (setting/get-value-of-type :boolean :ldap-enabled)
                                                    (setting/get-value-of-type :boolean :google-auth-enabled))))
   :enabled-embedding-sdk         (boolean  (and  (setting/get-value-of-type :boolean :enable-embedding-sdk)
                                                  (or (setting/get-value-of-type :boolean :jwt-enabled)
                                                      (setting/get-value-of-type :boolean :saml-enabled))))
   :enabled-embedding-simple      (boolean  (and  (setting/get-value-of-type :boolean :enable-embedding-simple)
                                                  (or (setting/get-value-of-type :boolean :jwt-enabled)
                                                      (setting/get-value-of-type :boolean :saml-enabled))))
   :use-tenants                   (boolean (setting/get-value-of-type :boolean :use-tenants))})
