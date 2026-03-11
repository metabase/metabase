(ns metabase.sso.oidc.schema
  "Malli schemas for OIDC configuration and token claims."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; Configuration Schemas

(mr/def ::client-id
  [:string {:min 1
            :error/message "Client ID is required and must not be empty"}])

(mr/def ::client-secret
  [:string {:min 1
            :error/message "Client secret is required and must not be empty"}])

(mr/def ::uri
  [:and
   ms/NonBlankString
   [:fn {:error/message "Must be a valid URI"}
    (fn [s]
      (try
        (java.net.URI. s)
        true
        (catch Exception _
          false)))]])

(mr/def ::issuer-uri
  ::uri)

(mr/def ::redirect-uri
  ::uri)

(mr/def ::authorization-endpoint
  [:maybe ::uri])

(mr/def ::token-endpoint
  [:maybe ::uri])

(mr/def ::userinfo-endpoint
  [:maybe ::uri])

(mr/def ::jwks-uri
  [:maybe ::uri])

(mr/def ::scopes
  [:vector {:min 1
            :default ["openid" "email" "profile"]
            :error/message "At least one scope is required"}
   ms/NonBlankString])

(mr/def ::oidc-configuration
  [:map {:closed true}
   [:client-id ::client-id]
   [:client-secret ::client-secret]
   [:issuer-uri ::issuer-uri]
   [:redirect-uri ::redirect-uri]
   [:authorization-endpoint {:optional true} ::authorization-endpoint]
   [:token-endpoint {:optional true} ::token-endpoint]
   [:userinfo-endpoint {:optional true} ::userinfo-endpoint]
   [:jwks-uri {:optional true} ::jwks-uri]
   [:scopes {:optional true
             :default ["openid" "email" "profile"]} ::scopes]])

;;; ID Token Claim Schemas

(mr/def ::sub
  [:string {:min 1
            :error/message "Subject identifier (sub) is required"}])

(mr/def ::iss
  [:string {:min 1
            :error/message "Issuer (iss) is required"}])

(mr/def ::aud
  [:or
   [:string {:min 1}]
   [:vector {:min 1} [:string {:min 1}]]])

(mr/def ::exp
  [:int {:min 0
         :error/message "Expiry time (exp) must be a positive integer"}])

(mr/def ::iat
  [:int {:min 0
         :error/message "Issued at time (iat) must be a positive integer"}])

(mr/def ::email
  [:maybe ms/Email])

(mr/def ::given-name
  [:maybe ms/NonBlankString])

(mr/def ::family-name
  [:maybe ms/NonBlankString])

(mr/def ::name
  [:maybe ms/NonBlankString])

(mr/def ::id-token-claims
  [:map
   [:sub ::sub]
   [:iss ::iss]
   [:aud ::aud]
   [:exp ::exp]
   [:iat ::iat]
   [:email {:optional true} ::email]
   [:given_name {:optional true} ::given-name]
   [:family_name {:optional true} ::family-name]
   [:name {:optional true} ::name]])

(defn discovery-based?
  "Returns true if the configuration relies on discovery (only required fields present),
   false if endpoints are manually specified."
  [config]
  (not (or (:authorization-endpoint config)
           (:token-endpoint config)
           (:userinfo-endpoint config)
           (:jwks-uri config))))
