(ns metabase.integrations.google.interface
  (:require [metabase.models.setting.multi-setting :refer [define-multi-setting]]
            [metabase.public-settings.metastore :as metastore]
            [metabase.util.i18n :refer [deferred-tru]]))

(define-multi-setting google-auth-auto-create-accounts-domain
  (deferred-tru "When set, allow users to sign up on their own if their Google account email address is from this domain.")
  (fn [] (if (metastore/enable-sso?) :ee :oss)))
