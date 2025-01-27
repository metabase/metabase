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

(api/define-routes api/+check-superuser)
