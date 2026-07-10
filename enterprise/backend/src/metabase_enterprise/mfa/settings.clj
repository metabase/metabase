(ns metabase-enterprise.mfa.settings
  "Settings for native multi-factor authentication.

  `mfa-enabled` is deliberately NOT `:feature`-gated on read: `defsetting`'s `:feature` option
  returns the default value when the feature is absent, which on license lapse would read as
  `false` and silently fail open. Instead the feature check lives on the write path — and only for
  turning the setting ON, so an admin on a lapsed license can always turn MFA off."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(set! *warn-on-reflection* true)

(defsetting mfa-enabled
  (deferred-tru "Allow users to secure their account with two-factor authentication (an authenticator app).")
  :visibility :public
  :type       :boolean
  :default    false
  :export?    false
  :audit      :raw-value
  :setter     (fn [new-value]
                (let [new-value (boolean new-value)]
                  (when new-value
                    (premium-features/assert-has-feature :multi-factor-auth (tru "Multi-factor authentication")))
                  (setting/set-value-of-type! :boolean :mfa-enabled new-value))))
