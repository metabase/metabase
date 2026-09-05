(ns metabase-enterprise.mfa.settings
  "Settings for native multi-factor authentication.

  `mfa-enforcement` is deliberately NOT `:feature`-gated on read: `defsetting`'s `:feature` option
  returns the default value when the feature is absent, which on license lapse would read as
  `:off` and silently fail open. Instead the feature check lives on the write path — and only for
  turning the setting ON (any value other than `:off`), so an admin on a lapsed license can always
  set enforcement back to `:off`."
  (:require
   [java-time.api :as t]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.time :as u.time]))

(set! *warn-on-reflection* true)

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

(defn mfa-enabled?
  "True when MFA is available to users at all (enforcement is not :off)."
  []
  (not= (mfa-enforcement) :off))

(defsetting mfa-requirement-deadline
  (deferred-tru "Time after which mfa-enforcement will take effect for all users")
  :visibility :public
  :type       :timestamp
  :default    nil
  :export?    false
  :audit      :getter
  :setter     (fn [new-value]
                (when new-value
                  (premium-features/assert-has-feature :multi-factor-auth (tru "Multi-factor authentication")))
                (setting/set-value-of-type! :timestamp :mfa-requirement-deadline new-value)))

(defn mfa-required?
  "True when MFA is required for all users (enforcement is :required)."
  ([now]
   (and (= (mfa-enforcement) :required)
        (let [deadline (mfa-requirement-deadline)]
          (or (nil? deadline)
              (t/after?
               (u.time/coerce-to-timestamp now)
               (u.time/coerce-to-timestamp deadline))))))
  ([]
   (mfa-required? (t/offset-date-time))))
