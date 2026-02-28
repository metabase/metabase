(ns metabase-enterprise.product-analytics.token
  "Session cache JWT for Product Analytics.
   Signs and verifies short-lived tokens so repeat hits can skip server-side
   session resolution."
  (:require
   [buddy.sign.jwt :as jwt]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.random :as random]))

(set! *warn-on-reflection* true)

(def ^:private secret-length-bytes
  "32 bytes = 256-bit key for HS256."
  32)

(defsetting product-analytics-session-secret
  (deferred-tru "Secret key used to sign Product Analytics session cache JWTs.")
  :visibility  :internal
  :export?     false
  :encryption  :when-encryption-key-set
  :type        :string)

(defn ensure-secret!
  "Return the configured secret, generating and persisting one if absent."
  []
  (or (product-analytics-session-secret)
      (let [new-secret (random/secure-hex secret-length-bytes)]
        (log/info "Product Analytics: auto-generating session JWT secret")
        (product-analytics-session-secret! new-secret)
        new-secret)))

(defn create-session-token
  "Create a signed JWT containing the given session-id, visit-id, and website-id claims.
   Returns a JWS compact string."
  [session-id visit-id website-id]
  (jwt/sign {:session-id session-id
             :visit-id   visit-id
             :website-id website-id}
            (ensure-secret!)
            {:alg :hs256}))

(defn verify-session-token
  "Verify and decode a session cache JWT. Returns the claims map on success, or
   `nil` if the token is invalid, expired (>24h), or tampered with."
  [token]
  (when (seq token)
    (try
      (jwt/unsign token (ensure-secret!) {:alg :hs256 :max-age 86400})
      (catch Exception _
        nil))))
