(ns metabase-enterprise.oauth-server.api
  "EE implementations of OAuth/OIDC endpoint handlers."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.oauth-server.consent-page :as consent-page]
   [metabase-enterprise.oauth-server.core :as oauth-server]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.system.core :as system]
   [oidc-provider.core :as oidc]
   [oidc-provider.protocol :as proto]
   [oidc-provider.registration :as reg]
   [oidc-provider.util :as oidc-util])
  (:import
   (java.net URLEncoder)))

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
    (let [token (oauth-server/extract-bearer-token request)]
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

(defn- build-query-string
  "Build a URL query string from a map of parameters.
   Handles vector values by emitting multiple key=value pairs (RFC 8707 resource parameter)."
  [params]
  (->> params
       (remove (fn [[_k v]] (nil? v)))
       (mapcat (fn [[k v]]
                 (let [values (if (sequential? v) v [v])]
                   (map (fn [val] (str (name k) "=" (URLEncoder/encode (str val) "UTF-8")))
                        values))))
       (str/join "&")))

(defn- login-redirect-url
  "Build a redirect URL to the login page that will redirect back to the given path after login.
   Only allows redirecting back to OAuth paths to prevent open-redirect attacks."
  [request]
  (let [site-url    (system/site-url)
        uri         (:uri request)
        query       (:query-string request)
        return-path (when (str/starts-with? uri "/oauth/")
                      (if query (str uri "?" query) uri))
        redirect    (if return-path
                      (str site-url "/auth/login?redirect=" (URLEncoder/encode return-path "UTF-8"))
                      (str site-url "/auth/login"))]
    redirect))

(defenterprise authorize-handler
  "Handles the authorization endpoint (GET /oauth/authorize)."
  :feature :metabot-v3
  [request]
  (if-not (:metabase-user-id request)
    {:status  302
     :headers {"Location" (login-redirect-url request)}
     :body    ""}
    (when-let [provider (oauth-server/get-provider)]
      (try
        (let [parsed  (oidc/parse-authorization-request provider (:query-string request))
              client  (proto/get-client (:client-store provider) (:client_id parsed))]
          {:status  200
           :headers {"Content-Type" "text/html; charset=utf-8"}
           :body    (consent-page/render-consent-page
                     {:client-name  (or (:client-name client) "Unknown Application")
                      :scopes       (if-let [scope (:scope parsed)]
                                      (str/split scope #"\s+")
                                      [])
                      :nonce        (:nonce request)
                      :oauth-params {:client_id             (:client_id parsed)
                                     :redirect_uri          (:redirect_uri parsed)
                                     :response_type         (:response_type parsed)
                                     :scope                 (:scope parsed)
                                     :state                 (:state parsed)
                                     :nonce                 (:nonce parsed)
                                     :code_challenge        (:code_challenge parsed)
                                     :code_challenge_method (:code_challenge_method parsed)
                                     :resource              (:resource parsed)}})})
        (catch clojure.lang.ExceptionInfo e
          {:status  400
           :headers {"Content-Type" "application/json"}
           :body    {:error             "invalid_request"
                     :error_description (ex-message e)}})))))

(defenterprise authorize-decision-handler
  "Handles the authorization decision (POST /oauth/authorize/decision).
   Accepts form-encoded params from the consent page."
  :feature :metabot-v3
  [request]
  (if-not (:metabase-user-id request)
    {:status  401
     :headers {"Content-Type" "application/json"}
     :body    {:error "unauthorized"}}
    (when-let [provider (oauth-server/get-provider)]
      (let [params   (:params request)
            approved (= "true" (str (:approved params)))
            ;; Rebuild query string from the forwarded authorization params to re-validate
            auth-params  (select-keys params [:client_id :redirect_uri :response_type :scope :state :nonce
                                              :code_challenge :code_challenge_method :resource])
            query-string (build-query-string auth-params)]
        (try
          (let [parsed (oidc/parse-authorization-request provider query-string)]
            (if approved
              (let [url (oidc/authorize provider parsed (str (:metabase-user-id request)))]
                {:status  302
                 :headers {"Location" url}
                 :body    ""})
              (let [url (oidc/deny-authorization provider parsed "access_denied" "User denied the request")]
                {:status  302
                 :headers {"Location" url}
                 :body    ""})))
          (catch clojure.lang.ExceptionInfo e
            {:status  400
             :headers {"Content-Type" "application/json"}
             :body    {:error             "invalid_request"
                       :error_description (ex-message e)}}))))))

(defenterprise protected-resource-metadata-handler
  "Returns OAuth Protected Resource Metadata (RFC 9728)."
  :feature :metabot-v3
  [_request]
  (let [site-url (system/site-url)]
    {:status  200
     :headers {"Content-Type" "application/json"}
     :body    {:resource                  (str site-url "/api/mcp")
               :authorization_servers     [site-url]
               :scopes_supported          oauth-server/all-agent-scopes
               :bearer_methods_supported  ["header"]}}))

(defenterprise token-handler
  "Handles the token endpoint (POST /oauth/token)."
  :feature :metabot-v3
  [request]
  (when-let [provider (oauth-server/get-provider)]
    (let [params               (:params request)
          authorization-header (get-in request [:headers "authorization"])]
      (try
        (let [response (oidc/token-request provider params authorization-header)]
          {:status  200
           :headers {"Content-Type"  "application/json"
                     "Cache-Control" "no-store"
                     "Pragma"        "no-cache"}
           :body    response})
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            {:status  (if (= (:error data) "invalid_client") 401 400)
             :headers {"Content-Type"  "application/json"
                       "Cache-Control" "no-store"
                       "Pragma"        "no-cache"}
             :body    {:error             (or (:error data) "invalid_request")
                       :error_description (ex-message e)}}))))))
