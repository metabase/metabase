(ns metabase-enterprise.oauth-server.api
  "EE implementations of OAuth/OIDC endpoint handlers."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.oauth-server.core :as oauth-server]
   [metabase.premium-features.core :refer [defenterprise]]
   [oidc-provider.core :as oidc]
   [oidc-provider.protocol :as proto]
   [oidc-provider.registration :as reg]
   [oidc-provider.util :as oidc-util]))

(defenterprise openid-discovery-handler
  "Returns the OIDC discovery document."
  :feature :metabot-v3
  [_request]
  (when-let [provider (oauth-server/get-provider)]
    {:status 200
     :headers {"Content-Type" "application/json"}
     :body (oidc/discovery-metadata provider)}))

(defenterprise jwks-handler
  "Returns the JWKS."
  :feature :metabot-v3
  [_request]
  (when-let [provider (oauth-server/get-provider)]
    {:status 200
     :headers {"Content-Type" "application/json"}
     :body (oidc/jwks provider)}))

(defn- extract-registration-body
  "Extract the registration request body as a string-keyed map.
   Metabase's wrap-json-body middleware parses JSON into keyword maps,
   but the oidc-provider library expects string keys."
  [request]
  (let [body (:body request)]
    (when (map? body)
      (walk/stringify-keys body))))

(defn- extract-bearer-token
  "Extract the bearer token from the Authorization header."
  [request]
  (when-let [auth (get-in request [:headers "authorization"])]
    (when (str/starts-with? (str/lower-case auth) "bearer ")
      (str/trim (subs auth 7)))))

(defenterprise dynamic-register-handler
  "Handles dynamic client registration (RFC 7591)."
  :feature :metabot-v3
  [request]
  (when-let [provider (oauth-server/get-provider)]
    (let [body (extract-registration-body request)]
      (if (nil? body)
        {:status  400
         :headers {"Content-Type" "application/json"}
         :body    {"error"             "invalid_client_metadata"
                   "error_description" "Invalid or missing JSON body"}}
        (try
          (let [response   (oidc/dynamic-register-client provider body)
                client-id  (get response "client_id")]
            ;; Mark as dynamically registered (the library doesn't know about registration_type)
            (proto/update-client (:client-store provider) client-id {:registration-type "dynamic"})
            {:status  201
             :headers {"Content-Type" "application/json"}
             :body    response})
          (catch clojure.lang.ExceptionInfo e
            (reg/registration-error-response
             (ex-message e)
             (:error_description (ex-data e)))))))))

(defenterprise dynamic-client-read-handler
  "Handles client configuration read (RFC 7592)."
  :feature :metabot-v3
  [request client-id]
  (when-let [provider (oauth-server/get-provider)]
    (let [token (extract-bearer-token request)]
      (if (str/blank? token)
        {:status  401
         :headers {"Content-Type" "application/json"}
         :body    {"error" "invalid_token"}}
        (let [client (proto/get-client (:client-store provider) client-id)]
          (if (and client
                   (:registration-access-token-hash client)
                   (oidc-util/verify-client-secret token (:registration-access-token-hash client)))
            {:status  200
             :headers {"Content-Type" "application/json"}
             :body    {"client_id"                  (:client-id client)
                       "redirect_uris"              (:redirect-uris client)
                       "grant_types"                (:grant-types client)
                       "response_types"             (:response-types client)
                       "token_endpoint_auth_method" (or (:token-endpoint-auth-method client) "none")
                       "scope"                      (when (seq (:scopes client))
                                                      (str/join " " (:scopes client)))}}
            {:status  401
             :headers {"Content-Type" "application/json"}
             :body    {"error" "invalid_token"}}))))))
