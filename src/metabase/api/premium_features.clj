(ns metabase.api.premium-features
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.public-settings.premium-features :as premium-features]))

(api/defendpoint GET "/token/status"
  "Fetch info about the current Premium-Features premium features token including whether it is `valid`, a `trial` token, its
  `features`, when it is `valid-thru`, and the `status` of the account."
  []
  (premium-features/fetch-token-status (api/check-404 (premium-features/premium-embedding-token))))

(api/define-routes api/+check-superuser)
