(ns metabase.premium-features.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.token-check :as token-check]
   [ring.util.response :as response]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/token/status"
  "Fetch info about the current Premium-Features premium features token including whether it is `valid`, a `trial` token, its
  `features`, when it is `valid-thru`, and the `status` of the account."
  []
  (api/check-404 (premium-features/token-status)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/token/refresh"
  "Clear all token caches and re-check the premium features token against the MetaStore.
  Returns the fresh token status. Useful for the frontend after a purchase so that new features
  are recognized without waiting for the cache TTL."
  []
  (token-check/clear-cache!)
  (-> (api/check-404 (premium-features/token-status))
      response/response
      (assoc-in [:mb/cookies :cookie/premium-features-cache-timestamp] true)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/premium-features` routes."
  (api.macros/ns-handler *ns* api/+check-superuser))
