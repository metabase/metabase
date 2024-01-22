(ns metabase.api.premium-features
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.public-settings.premium-features :as premium-features]))

(api/defendpoint GET "/token/status"
  "Fetch info about the current Premium-Features premium features token including whether it is `valid`, a `trial` token, its
  `features`, when it is `valid-thru`, and the `status` of the account."
  []
  (premium-features/fetch-token-status (api/check-404 (premium-features/premium-embedding-token)))
  {:valid true, :status "Token is valid.", :trial true, :valid-thru "2030-01-01T12:00:00Z", :features ["snippet-collections" "sso" "sso-jwt" "sso-saml" "dashboard-subscription-filters" "advanced-config" "whitelabel" "sandboxes" "disable-password-login" "content-verification" "session-timeout-config" "sso-ldap" "content-management" "sso-google" "audit-app" "no-upsell" "question-error-logs" "email-restrict-recipients" "advanced-permissions" "cache-granular-controls" "embedding" "official-collections" "serialization" "config-text-file" "email-allow-list"], :store-users []})

(api/define-routes api/+check-superuser)
