(ns metabase.oauth-server.core
  (:require
   [clojure.string :as str]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.oauth-server.store :as store]
   [metabase.system.core :as system]
   [metabase.util :as u]
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

(defn all-agent-scopes
  "All supported OAuth scopes: standard OIDC scopes plus tool-derived scopes.
   Uses requiring-resolve to avoid a cyclic dependency with metabase.mcp.tools."
  []
  (vec ((requiring-resolve 'metabase.mcp.tools/all-tool-scopes))))

(defn- build-provider-config
  "Build the configuration map for the OIDC provider from Metabase settings."
  [signing-key]
  (let [base-url (system/site-url)]
    {:issuer                         base-url
     :authorization-endpoint         (str base-url "/oauth/authorize")
     :token-endpoint                 (str base-url "/oauth/token")
     :jwks-uri                       (str base-url "/oauth/jwks")
     :registration-endpoint          (str base-url "/oauth/register")
     :revocation-endpoint            (str base-url "/oauth/revoke")
     :signing-key                    signing-key
     :access-token-ttl-seconds       (oauth-settings/oauth-server-access-token-ttl)
     :id-token-ttl-seconds           (oauth-settings/oauth-server-id-token-ttl)
     :authorization-code-ttl-seconds (oauth-settings/oauth-server-authorization-code-ttl)
     :client-store                   (store/create-client-store)
     :code-store                     (store/create-authorization-code-store)
     :token-store                    (store/create-token-store)
     :scopes-supported               (all-agent-scopes)
     :claims-provider                (store/create-claims-provider)}))

(defn create-provider!
  "Create and store the OIDC provider instance."
  []
  (let [signing-key (get-or-generate-signing-key!)
        config      (build-provider-config signing-key)
        p           (oidc/create-provider config)]
    (reset! provider p)
    p))

(defn get-provider
  "Returns the current provider instance, creating it lazily if needed."
  []
  (or @provider
      (locking provider
        (or @provider
            (create-provider!)))))

(defn reset-provider!
  "Reset the provider atom to nil. Useful for testing."
  []
  (reset! provider nil))

(defn extract-bearer-token
  "Extract the bearer token from the Authorization header of a Ring request."
  [request]
  (when-let [auth (get-in request [:headers "authorization"])]
    (when (str/starts-with? (u/lower-case-en auth) "bearer ")
      (str/trim (subs auth 7)))))
