(ns metabase-enterprise.mfa.settings
  "EE-only settings for native multi-factor authentication.

  `mfa-enforcement` is deliberately NOT `:feature`-gated on read: `defsetting`'s `:feature` option
  returns the default value when the feature is absent, which on license lapse would read as
  `:off` and silently fail open. Instead the feature check lives on the write path — and only for
  turning the setting ON (any value other than `:off`), so an admin on a lapsed license can always
  set enforcement back to `:off`."
  (:require
   [java-time.api :as t]
   [metabase.mfa.settings :as mfa.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.time :as u.time]))

(set! *warn-on-reflection* true)

(defn mfa-enabled?
  "True when MFA is available to users at all (enforcement is not :off)."
  []
  (not= (mfa.settings/mfa-enforcement) :off))

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
   (and (= (mfa.settings/mfa-enforcement) :required)
        (let [deadline (mfa-requirement-deadline)]
          (or (nil? deadline)
              (t/after?
               (u.time/coerce-to-timestamp now)
               (u.time/coerce-to-timestamp deadline))))))
  ([]
   (mfa-required? (t/offset-date-time))))
