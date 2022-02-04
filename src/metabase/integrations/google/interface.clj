(ns metabase.integrations.google.interface
  (:require [metabase.models.setting.multi-setting :refer [define-multi-setting]]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util.i18n :refer [deferred-tru]]))

(define-multi-setting google-auth-auto-create-accounts-domain
  (deferred-tru "When set, allow users to sign up on their own if their Google account email address is from this domain.")
  (fn [] (if (premium-features/enable-sso?) :ee :oss)))
