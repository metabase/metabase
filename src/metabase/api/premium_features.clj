(ns metabase.api.premium-features
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features]))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/token/status"
  "Fetch info about the current Premium-Features premium features token including whether it is `valid`, a `trial` token, its
  `features`, when it is `valid-thru`, and the `status` of the account."
  []
  (api/check-404 (premium-features/token-status)))

(api/define-routes api/+check-superuser)
