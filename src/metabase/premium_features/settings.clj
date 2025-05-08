(ns metabase.premium-features.settings
  "TODO -- We should move the settings from [[metabase.premium-features.token-check]] into this namespace."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]))

(defsetting site-uuid-for-premium-features-token-checks
  "In the interest of respecting everyone's privacy and keeping things as anonymous as possible we have a *different*
  site-wide UUID that we use for the EE/premium features token feature check API calls. It works in fundamentally the
  same way as [[site-uuid]] but should only be used by the token check logic
  in [[metabase.premium-features.core/fetch-token-status]]. (`site-uuid` is used for anonymous
  analytics aka stats and if we sent it along with the premium features token check API request it would no longer be
  anonymous.)"
  :encryption :when-encryption-key-set
  :visibility :internal
  :base       setting/uuid-nonce-base
  :doc        false)
