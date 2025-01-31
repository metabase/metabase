(ns metabase.api.premium-features
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]))

(api.macros/defendpoint :get "/token/status"
  "Fetch info about the current Premium-Features premium features token including whether it is `valid`, a `trial` token, its
  `features`, when it is `valid-thru`, and the `status` of the account."
  []
  (api/check-404 (premium-features/token-status)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/premium-features` routes."
  (api.macros/ns-handler *ns* api/+check-superuser))
