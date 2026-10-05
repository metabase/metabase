(ns metabase-enterprise.internal-stats.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]))

(defenterprise embedding-settings
  "Boolean values that report on the state of different embedding configurations."
  :feature :none
  [embedded-dashboard-count embedded-question-count]
  ;; Modular embedding, the SDK and guest embeds are one setting since 0.65.0. `setting/get`, not
  ;; `get-value-of-type`: only the former runs the `:getter`, which is where the fallback to the settings it
  ;; replaces lives. The field names are kept so existing reports keep resolving.
  {:enabled-embedding-static      (boolean (and (setting/get :enable-embedding-modular)
                                                (or (> embedded-question-count 0)
                                                    (> embedded-dashboard-count 0))))
   :enabled-embedding-interactive (boolean (and (setting/get-value-of-type :boolean :enable-embedding-interactive)
                                                (not-empty (setting/get-value-of-type :string :embedding-app-origins-interactive))
                                                (or (setting/get-value-of-type :boolean :jwt-enabled)
                                                    (setting/get-value-of-type :boolean :saml-enabled)
                                                    (setting/get-value-of-type :boolean :ldap-enabled)
                                                    (setting/get-value-of-type :boolean :google-auth-enabled))))
   :enabled-embedding-sdk         (boolean  (and  (setting/get :enable-embedding-modular)
                                                  (or (setting/get-value-of-type :boolean :jwt-enabled)
                                                      (setting/get-value-of-type :boolean :saml-enabled))))
   :enabled-embedding-simple      (boolean  (and  (setting/get :enable-embedding-modular)
                                                  (or (setting/get-value-of-type :boolean :jwt-enabled)
                                                      (setting/get-value-of-type :boolean :saml-enabled))))
   :use-tenants                   (boolean (setting/get-value-of-type :boolean :use-tenants))})
