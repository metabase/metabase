(ns metabase.premium-features.api
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.llm.settings :as llm.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.token-check :as token-check]
   [metabase.util.log :as log]
   [ring.util.response :as response])
  (:import
   (java.net URLEncoder)))

(set! *warn-on-reflection* true)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/token/status"
  "Fetch info about the current Premium-Features premium features token including whether it is `valid`, a `trial` token, its
  `features`, when it is `valid-thru`, and the `status` of the account."
  []
  (api/check-404 (premium-features/token-status)))

(defn- invalidate-llm-proxy-token-cache!
  "Invalidation of the AI service's cached token status for the current instance token."
  []
  (when-let [service-base-url (llm.settings/ai-service-base-url)]
    (when-let [^String token (premium-features/premium-embedding-token)]
      (try
        (let [encoded-token (URLEncoder/encode ^String token "UTF-8")
              url (str (str/replace service-base-url #"/+$" "") "/v1/invalidate-token-cache/" encoded-token)
              response (http/post url {:throw-exceptions false})]
          (when-not (<= 200 (:status response) 299)
            (log/warnf "LLM proxy token cache invalidation failed with status %s" (:status response))))
        (catch Exception e
          (log/warn e "Failed to invalidate LLM proxy token cache"))))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/token/refresh"
  "Clear all token caches and re-check the premium features token against the MetaStore.
  Returns the fresh token status. Useful for the frontend after a purchase so that new features
  are recognized without waiting for the cache TTL."
  []
  (token-check/clear-cache!)
  (invalidate-llm-proxy-token-cache!)
  (-> (api/check-404 (premium-features/token-status))
      response/response
      (assoc-in [:mb/cookies :cookie/premium-features-cache-timestamp] true)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/premium-features` routes."
  (api.macros/ns-handler *ns* api/+check-superuser))
