(ns metabase-enterprise.oauth-server.api
  "EE implementations of OAuth/OIDC endpoint handlers."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [hiccup2.core :as h]
   [metabase-enterprise.oauth-server.core :as oauth-server]
   [metabase.appearance.settings :as appearance.settings]
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
  "Build a redirect URL to the login page that will redirect back to the given path after login."
  [request]
  (let [site-url    (system/site-url)
        uri         (:uri request)
        query       (:query-string request)
        return-path (if query (str uri "?" query) uri)
        redirect    (str site-url "/auth/login?redirect=" (URLEncoder/encode return-path "UTF-8"))]
    redirect))

(defn- absolute-url
  "Resolve a potentially relative path to an absolute URL using site-url."
  [path]
  (if (or (str/starts-with? path "http://")
          (str/starts-with? path "https://"))
    path
    (str (system/site-url) "/" path)))

(defn- font-face-css
  "Generate @font-face CSS rules for the given font, loading woff2 files from Metabase's
   bundled font directory. Returns an empty string for custom (non-bundled) fonts since
   they are loaded via application-font-files."
  [font-name]
  (let [dir-name  (str/replace font-name " " "_")
        file-stem (str/replace font-name " " "")]
    (if (= font-name "Lato")
      (str "@font-face { font-family: 'Lato'; font-weight: 400; font-style: normal; font-display: swap;"
           " src: url('/app/fonts/Lato/lato-v16-latin-regular.woff2') format('woff2'); }\n"
           "@font-face { font-family: 'Lato'; font-weight: 700; font-style: normal; font-display: swap;"
           " src: url('/app/fonts/Lato/lato-v16-latin-700.woff2') format('woff2'); }\n")
      (str "@font-face { font-family: '" font-name "'; font-weight: 400; font-style: normal; font-display: swap;"
           " src: url('/app/fonts/" dir-name "/" file-stem "-Regular.woff2') format('woff2'); }\n"
           "@font-face { font-family: '" font-name "'; font-weight: 700; font-style: normal; font-display: swap;"
           " src: url('/app/fonts/" dir-name "/" file-stem "-Bold.woff2') format('woff2'); }\n"))))

(defn- appearance-settings
  "Return a map of appearance settings for the consent page."
  []
  (let [colors (appearance.settings/application-colors)]
    {:font-family  (appearance.settings/application-font)
     :logo-url     (absolute-url (appearance.settings/application-logo-url))
     :brand-color  (get colors "brand" "#509ee3")}))

(defn- render-consent-page
  "Render a server-side HTML consent page for the OAuth authorization flow."
  [{:keys [client-name scopes oauth-params nonce]}]
  (let [{:keys [font-family logo-url brand-color]} (appearance-settings)]
    (str
     "<!DOCTYPE html>"
     (h/html
      [:html {:lang "en"}
       [:head
        [:meta {:charset "UTF-8"}]
        [:meta {:name "viewport" :content "width=device-width, initial-scale=1.0"}]
        [:title "Authorize " client-name]
        [:style {:nonce nonce} (h/raw
                                (str
                                 (font-face-css font-family)
                                 "* { box-sizing: border-box; margin: 0; padding: 0; }
                   html { height: 100%; }
                   body { font-family: '" font-family "', 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                          display: flex; justify-content: center; align-items: center;
                          min-height: 100%; background: #f9fbfc; color: #4c5773; }
                   .consent { background: #fff; border-radius: 8px;
                              box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05);
                              padding: 2.5rem; max-width: 440px; width: 100%; margin: 1rem; }
                   .logo { display: flex; justify-content: center; margin-bottom: 1.5rem; }
                   h1 { font-size: 1.25rem; font-weight: 700; color: #2e353b; text-align: center; margin-bottom: 0.5rem; }
                   .subtitle { text-align: center; font-size: 0.875rem; line-height: 1.5; color: #696e7b; margin-bottom: 1.5rem; }
                   .scope-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
                                   color: #949aab; margin-bottom: 0.5rem; }
                   .scopes { list-style: none; background: #f9fbfc; border-radius: 6px; border: 1px solid #eeecec;
                              padding: 0; margin-bottom: 1.5rem; }
                   .scopes li { padding: 0.625rem 0.875rem; font-size: 0.875rem; color: #4c5773;
                                 border-bottom: 1px solid #eeecec; }
                   .scopes li:last-child { border-bottom: none; }
                   .actions { display: flex; gap: 0.75rem; }
                   button { flex: 1; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 700;
                            font-family: inherit; cursor: pointer;
                            transition: background-color 0.15s ease, border-color 0.15s ease, filter 0.15s ease; }
                   .allow { background: " brand-color "; color: #fff; border: 1px solid " brand-color "; }
                   .allow:hover { filter: brightness(0.9); }
                   .deny  { background: #fff; color: #4c5773; border: 1px solid #ddd; }
                   .deny:hover  { background: #f9fbfc; border-color: #ccc; }"))]]
       [:body
        [:div.consent
         [:div.logo [:img {:src logo-url :alt "Logo" :height "32"}]]
         [:h1 "Authorize " client-name]
         [:p.subtitle "This application is requesting permission to access your Metabase account."]
         (when (seq scopes)
           [:div
            [:p.scope-label "Permissions requested"]
            [:ul.scopes
             (for [scope scopes]
               [:li scope])]])
         [:form {:method "POST" :action "/oauth/authorize/decision"}
          (for [[k v] oauth-params
                :when (some? v)
                v (if (sequential? v) v [v])]
            [:input {:type "hidden" :name (name k) :value v}])
          [:div.actions
           [:button.deny {:type "submit" :name "approved" :value "false"} "Deny"]
           [:button.allow {:type "submit" :name "approved" :value "true"} "Allow"]]]]]]))))

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
           :body    (render-consent-page
                     {:client-name  (or (:client-name client) "Unknown Application")
                      :scopes       (or (:scopes client) [])
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
  #p request
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

(def ^:private all-agent-scopes
  "All supported OAuth scopes for the MCP/agent API."
  ["agent:table:read"
   "agent:metric:read"
   "agent:search"
   "agent:query:construct"
   "agent:query:execute"
   "agent:workspace:read"
   "agent:workspace:write"
   "agent:workspace:execute"])

(defenterprise protected-resource-metadata-handler
  "Returns OAuth Protected Resource Metadata (RFC 9728)."
  :feature :metabot-v3
  [_request]
  (let [site-url (system/site-url)]
    {:status  200
     :headers {"Content-Type" "application/json"}
     :body    {:resource                  (str site-url "/api/mcp")
               :authorization_servers     [site-url]
               :scopes_supported          all-agent-scopes
               :bearer_methods_supported  ["header"]}}))

(defenterprise token-handler
  "Handles the token endpoint (POST /oauth/token)."
  :feature :metabot-v3
  [request]
  #p request
  (when-let [provider (oauth-server/get-provider)]
    (let [params               (:params request)
          authorization-header (get-in request [:headers "authorization"])]
      (try
        (let [response #p (oidc/token-request provider params authorization-header)]
          {:status  200
           :headers {"Content-Type"  "application/json"
                     "Cache-Control" "no-store"
                     "Pragma"        "no-cache"}
           :body    response})
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data #p e)]
            #p {:status  (if (= (:error data) "invalid_client") 401 400)
                :headers {"Content-Type"  "application/json"
                          "Cache-Control" "no-store"
                          "Pragma"        "no-cache"}
                :body    {:error             (or (:error data) "invalid_request")
                          :error_description (ex-message e)}}))))))
