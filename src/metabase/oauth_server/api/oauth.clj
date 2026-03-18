(ns metabase.oauth-server.api.oauth
  "OAuth/OIDC protocol endpoints. Mounted under `/oauth/`."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.nonce :as nonce]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.consent-page :as consent-page]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.system.core :as system]
   [oidc-provider.core :as oidc]
   [oidc-provider.protocol :as proto]
   [oidc-provider.registration :as reg]
   [oidc-provider.util :as oidc-util]
   [ring.util.response :as response])
  (:import
   (java.net URLEncoder)))

(set! *warn-on-reflection* true)

(def ^:private csrf-cookie-name "metabase.OAUTH_CSRF")

(defn- generate-csrf-token
  "Generate a random 32-hex-char CSRF token."
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

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
                      (str site-url "/auth/login?redirect=" (URLEncoder/encode ^String return-path "UTF-8"))
                      (str site-url "/auth/login"))]
    redirect))

;;; ------------------------------------------------ Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/jwks"
  :- [:or
      [:map [:status [:= 200]] [:body [:map [:keys [:sequential :map]]]]]
      [:map [:status [:= 404]] [:body [:map [:error [:= "not_found"]]]]]]
  "Returns the JWKS (JSON Web Key Set)."
  []
  (or (when-let [provider (oauth-server/get-provider)]
        {:status  200
         :headers {"Content-Type" "application/json"}
         :body    (oidc/jwks provider)})
      {:status 404 :body {:error "not_found"}}))

(api.macros/defendpoint :post "/register"
  :- [:map [:status [:enum 201 400 403 404]] [:body :any]]
  "Handles dynamic client registration (RFC 7591)."
  [_route-params _query-params body :- :any]
  (if-not (oauth-settings/oauth-server-dynamic-registration-enabled)
    {:status  403
     :headers {"Content-Type" "application/json"}
     :body    {"error" "registration_not_supported"}}
    (or (when-let [provider (oauth-server/get-provider)]
          (if (nil? body)
            {:status  400
             :headers {"Content-Type" "application/json"}
             :body    {"error"             "invalid_client_metadata"
                       "error_description" "Invalid or missing JSON body"}}
            (try
              ;; Default to "native" (not the RFC default "web") so that dynamically
              ;; registered clients (CLI tools, desktop apps) can use HTTP loopback redirects.
              ;; Default scopes to all provider-supported scopes when not specified.
              (let [body       (cond-> body
                                 (not (contains? body :application_type))
                                 (assoc :application_type "native")
                                 (not (contains? body :scope))
                                 (assoc :scope (str/join " " (oauth-server/all-agent-scopes))))
                    response   (oidc/dynamic-register-client provider body)
                    client-id  (:client_id response)]
                ;; Mark as dynamically registered (the library doesn't know about registration_type)
                (proto/update-client (:client-store provider) client-id {:registration-type "dynamic"})
                {:status  201
                 :headers {"Content-Type" "application/json"}
                 :body    response})
              (catch clojure.lang.ExceptionInfo e
                (reg/registration-error-response
                 (ex-message e)
                 (:error_description (ex-data e)))))))
        {:status 404 :body {:error "not_found"}})))

(api.macros/defendpoint :get "/register/:client-id"
  :- [:map [:status [:enum 200 401 404]] [:body :map]]
  "Handles client configuration read (RFC 7592)."
  [{:keys [client-id]}
   _query-params _body
   request]
  (or (when-let [provider (oauth-server/get-provider)]
        (let [token (oauth-server/extract-bearer-token request)]
          (if (str/blank? token)
            {:status  401
             :headers {"Content-Type" "application/json"}
             :body    {"error" "invalid_token"}}
            (let [{:keys [status body]} (oidc/dynamic-read-client provider client-id token)]
              {:status  status
               :headers {"Content-Type" "application/json"}
               :body    body}))))
      {:status 404 :body {:error "not_found"}}))

(api.macros/defendpoint :get "/authorize"
  :- [:map [:status [:enum 200 302 400 404]] [:body [:or :string :map]]]
  "Handles the authorization endpoint (GET /oauth/authorize)."
  [_route-params query-params _body
   request]
  (if-not (:metabase-user-id request)
    {:status  302
     :headers {"Location" (login-redirect-url request)}
     :body    ""}
    (or (when-let [provider (oauth-server/get-provider)]
          (try
            (let [parsed     (oidc/parse-authorization-request provider query-params)
                  client     (proto/get-client (:client-store provider) (:client_id parsed))
                  csrf-token (generate-csrf-token)]
              (-> {:status  200
                   :headers {"Content-Type" "text/html; charset=utf-8"}
                   :body    (consent-page/render-consent-page
                             {:client-name  (or (:client-name client) "Unknown Application")
                              :nonce        (:nonce request)
                              :csrf-token   csrf-token
                              :oauth-params {:client_id             (:client_id parsed)
                                             :redirect_uri          (:redirect_uri parsed)
                                             :response_type         (:response_type parsed)
                                             :scope                 (:scope parsed)
                                             :state                 (:state parsed)
                                             :nonce                 (:nonce parsed)
                                             :code_challenge        (:code_challenge parsed)
                                             :code_challenge_method (:code_challenge_method parsed)
                                             :resource              (:resource parsed)}})}
                  (response/set-cookie csrf-cookie-name csrf-token
                                       {:http-only true
                                        :same-site :strict
                                        :path      "/oauth/authorize"
                                        :max-age   600})))
            (catch clojure.lang.ExceptionInfo e
              {:status  400
               :headers {"Content-Type" "application/json"}
               :body    {:error             "invalid_request"
                         :error_description (ex-message e)}})))
        {:status 404 :body {:error "not_found"}})))

(api.macros/defendpoint :post "/authorize/decision"
  :- [:map [:status [:enum 302 400 401 403 404]] [:body [:or :string :map]]]
  "Handles the authorization decision (POST /oauth/authorize/decision)."
  [_route-params _query-params body
   request]
  (if-not (:metabase-user-id request)
    {:status  401
     :headers {"Content-Type" "application/json"}
     :body    {:error "unauthorized"}}
    (or (when-let [provider (oauth-server/get-provider)]
          (let [cookie-token   (get-in request [:cookies csrf-cookie-name :value])
                form-token     (str (:csrf_token body))]
            (if (or (str/blank? cookie-token)
                    (str/blank? form-token)
                    (not (oidc-util/constant-time-eq? cookie-token form-token)))
              {:status  403
               :headers {"Content-Type" "application/json"}
               :body    {:error "csrf_validation_failed"}}
              (let [approved     (= "true" (str (:approved body)))
                    auth-params  (select-keys body [:client_id :redirect_uri :response_type :scope :state :nonce
                                                    :code_challenge :code_challenge_method :resource])]
                (try
                  (let [parsed (oidc/parse-authorization-request provider auth-params)]
                    (if approved
                      (let [url (oidc/authorize provider parsed (str (:metabase-user-id request)))]
                        (-> {:status  302
                             :headers {"Location" url}
                             :body    ""}
                            (response/set-cookie csrf-cookie-name "" {:http-only true
                                                                      :same-site :strict
                                                                      :path      "/oauth/authorize"
                                                                      :max-age   0})))
                      (let [url (oidc/deny-authorization provider parsed "access_denied" "User denied the request")]
                        (-> {:status  302
                             :headers {"Location" url}
                             :body    ""}
                            (response/set-cookie csrf-cookie-name "" {:http-only true
                                                                      :same-site :strict
                                                                      :path      "/oauth/authorize"
                                                                      :max-age   0})))))
                  (catch clojure.lang.ExceptionInfo e
                    {:status  400
                     :headers {"Content-Type" "application/json"}
                     :body    {:error             "invalid_request"
                               :error_description (ex-message e)}}))))))
        {:status 404 :body {:error "not_found"}})))

(api.macros/defendpoint :post "/token"
  :- [:map [:status [:enum 200 400 401 404]] [:body :map]]
  "Handles the token endpoint (POST /oauth/token)."
  [_route-params _query-params body
   request]
  (or (when-let [provider (oauth-server/get-provider)]
        (let [authorization-header (get-in request [:headers "authorization"])]
          (try
            (let [response (oidc/token-request provider body authorization-header)]
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
                           :error_description (ex-message e)}})))))
      {:status 404 :body {:error "not_found"}}))

(api.macros/defendpoint :post "/revoke"
  :- [:map [:status [:enum 200 404]]]
  "Handles the token revocation endpoint (POST /oauth/revoke) per RFC 7009."
  [_route-params _query-params _body
   request]
  (or (when-let [provider (oauth-server/get-provider)]
        ((oidc/revocation-handler provider) request))
      {:status 404 :body {:error "not_found"}}))
