(ns metabase-enterprise.oauth-server.core
  (:require
   [metabase-enterprise.oauth-server.settings :as oauth-settings]
   [metabase-enterprise.oauth-server.store :as store]
   [metabase.premium-features.core :as premium-features]
   [metabase.system.core :as system]
   [oidc-provider.core :as oidc]
   [oidc-provider.token :as oidc-token])
  (:import
   (com.nimbusds.jose.jwk RSAKey)))

(set! *warn-on-reflection* true)

(defonce ^:private provider (atom nil))

(defn- serialize-key
  "Serialize an RSAKey to a JSON string for storage."
  [^RSAKey k]
  (.toJSONString k))

(defn- deserialize-key
  "Deserialize a JSON string back to an RSAKey."
  ^RSAKey [^String s]
  (RSAKey/parse s))

(defn- get-or-generate-signing-key!
  "Returns the RSA signing key. Reads from settings if persisted, otherwise generates
   a new key and persists it."
  []
  (if-let [stored (oauth-settings/oauth-server-signing-key)]
    (deserialize-key stored)
    (let [k (oidc-token/generate-rsa-key)]
      (oauth-settings/oauth-server-signing-key! (serialize-key k))
      k)))

(defn- build-provider-config
  "Build the configuration map for the OIDC provider from Metabase settings."
  [signing-key]
  (let [base-url (system/site-url)]
    {:issuer                         base-url
     :authorization-endpoint         (str base-url "/oauth/authorize")
     :token-endpoint                 (str base-url "/oauth/token")
     :jwks-uri                       (str base-url "/oauth/jwks")
     :registration-endpoint          (str base-url "/oauth/register")
     :signing-key                    signing-key
     :access-token-ttl-seconds       (oauth-settings/oauth-server-access-token-ttl)
     :id-token-ttl-seconds           (oauth-settings/oauth-server-id-token-ttl)
     :authorization-code-ttl-seconds (oauth-settings/oauth-server-authorization-code-ttl)
     :client-store                   (store/create-client-store)
     :code-store                     (store/create-authorization-code-store)
     :token-store                    (store/create-token-store)
     :claims-provider                (store/create-claims-provider)}))

(defn create-provider!
  "Create and store the OIDC provider instance. Returns nil if the :metabot-v3 feature
   flag is not enabled."
  []
  (when (premium-features/enable-metabot-v3?)
    (let [signing-key (get-or-generate-signing-key!)
          config      (build-provider-config signing-key)
          p           (oidc/create-provider config)]
      (reset! provider p)
      p)))

(defn get-provider
  "Returns the current provider instance, creating it lazily if needed.
   Returns nil if the :metabot-v3 feature flag is not enabled."
  []
  (or @provider
      (create-provider!)))

(defn reset-provider!
  "Reset the provider atom to nil. Useful for testing."
  []
  (reset! provider nil))
