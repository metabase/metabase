(ns metabase-enterprise.mfa.settings
  "Settings for native multi-factor authentication.

  `mfa-enforcement` is deliberately NOT `:feature`-gated on read: `defsetting`'s `:feature` option
  returns the default value when the feature is absent, which on license lapse would read as
  `:off` and silently fail open. Instead the feature check lives on the write path — and only for
  turning the setting ON (any value other than `:off`), so an admin on a lapsed license can always
  set enforcement back to `:off`."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(set! *warn-on-reflection* true)

(def ^:private valid-enforcement-values #{:off :optional})

(defsetting mfa-enforcement
  (deferred-tru "Controls whether two-factor authentication is available to users. :off disables it entirely; :optional allows users to enroll voluntarily.")
  :visibility :public
  :type       :keyword
  :default    :off
  :export?    false
  :audit      :raw-value
  :setter     (fn [new-value]
                (let [new-value (keyword new-value)]
                  (when-not (contains? valid-enforcement-values new-value)
                    (throw (ex-info (tru "Invalid value for mfa-enforcement: {0}. Allowed values are :off and :optional. (:required is reserved for a future release.)"
                                         new-value)
                                    {:status-code 400})))
                  (when (not= new-value :off)
                    (premium-features/assert-has-feature :multi-factor-auth (tru "Multi-factor authentication")))
                  (setting/set-value-of-type! :keyword :mfa-enforcement new-value))))

(defn mfa-enabled?
  "True when MFA is available to users at all (enforcement is not :off)."
  []
  (not= (mfa-enforcement) :off))
