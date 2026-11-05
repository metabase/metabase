(ns metabase.mfa.settings
  "OSS settings for native multi-factor authentication.

  `mfa-enforcement` is deliberately NOT `:feature`-gated on read: `defsetting`'s `:feature` option
  returns the default value when the feature is absent, which on license lapse would read as
  `:off` and silently fail open. Instead the feature check lives on the write path — and only for
  turning the setting ON (any value other than `:off`), so an admin on a lapsed license can always
  set enforcement back to `:off`."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(def ^:private valid-enforcement-values #{:off :optional :required})

(defsetting mfa-enforcement
  (deferred-tru "Controls whether two-factor authentication is available to users. :off disables it entirely; :optional allows users to enroll voluntarily, :required mandates users enroll.")
  :visibility :public
  :type       :keyword
  :default    :off
  :export?    false
  :audit      :raw-value
  :setter     (fn [new-value]
                (let [new-value (keyword new-value)]
                  (when-not (contains? valid-enforcement-values new-value)
                    (throw (ex-info (tru "Invalid value for mfa-enforcement: {0}. Allowed values are :off, :optional, and :required."
                                         new-value)
                                    {:status-code 400})))
                  (when (not= new-value :off)
                    (premium-features/assert-has-feature :multi-factor-auth (tru "Multi-factor authentication")))
                  (setting/set-value-of-type! :keyword :mfa-enforcement new-value))))
