(ns metabase.integrations.google
  (:require [metabase.models.setting.multi-setting :refer [define-multi-setting-impl]]))

; (define-multi-setting-impl google-auth-auto-create-accounts-domain :ee)
; (define-multi-setting-impl google-auth-auto-create-accounts-domain :ee
;   :setter (fn [domain]
;               (when (str/includes? domain ",")
;                 ;; Multiple comma-separated domains is EE-only feature
;                 (throw (ex-info (tru "Invalid domain") {:status-code 400})))
;               (setting/set-string! :google-auth-auto-create-accounts-domain domain)))
