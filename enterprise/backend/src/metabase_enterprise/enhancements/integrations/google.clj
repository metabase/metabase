(ns metabase-enterprise.enhancements.integrations.google
  (:require
   [metabase.settings.core :as setting :refer [define-multi-setting-impl]]))

(define-multi-setting-impl google-auth-auto-create-accounts-domain :ee
  :getter (fn [] (setting/get-value-of-type :string :google-auth-auto-create-accounts-domain))
  :setter (fn [domain] (setting/set-value-of-type! :string :google-auth-auto-create-accounts-domain domain)))
