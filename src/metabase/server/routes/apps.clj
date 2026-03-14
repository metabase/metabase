(ns metabase.server.routes.apps
  "Serve custom app pages with embedded Metabase collection browser using modular embedding SDK."
  (:require
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.util :as u]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-app-by-name
  "Find an App by its name (case-insensitive)."
  [app-name]
  (t2/select-one :model/App :%lower.name (u/lower-case-en app-name)))

(defn- app-page-html
  "Generate HTML page with embedded collection browser."
  [app-name api-key auth-method theme logo collection-id use-current-session]
  (str "<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>" app-name " - Metabase App</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #app-container { height: 100vh; width: 100%; display: flex; flex-direction: column; }
    #app-container > * { flex: 1; height: 100%; }
    app-wrapper { display: flex; flex-direction: column; }
    .app-header {
      padding: 16px 24px;
      font-size: 20px;
      font-weight: 600;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .app-header img {
      height: 32px;
      width: auto;
    }
    .app-header-title { flex: 1; }
    .app-user {
      font-size: 14px;
      font-weight: 400;
      opacity: 0.7;
    }
    .app-content { flex: 1; overflow: hidden; }
  </style>
</head>
<body>
  <div id=\"app-container\">
    <app-wrapper>
      <div class=\"app-header\">"
       (when logo
         (str "<img src=\"" logo "\" alt=\"\" />"))
       "<span class=\"app-header-title\">" app-name "</span>
        <span class=\"app-user\"></span>
      </div>
      <div class=\"app-content\">
        <metabase-browser initial-collection=\"" collection-id "\"></metabase-browser>
      </div>
    </app-wrapper>
  </div>

  <script>
    var INSTANCE_URL = window.location.origin;
    var script = document.createElement('script');
    script.src = INSTANCE_URL + '/app/embed.js';
    script.defer = true;
    document.head.appendChild(script);
  </script>
  <script>
    function defineMetabaseConfig(config) {
      window.metabaseConfig = config;
    }
  </script>
  <script>
    defineMetabaseConfig({
      instanceUrl: window.location.origin"
       (cond
         api-key             (str ",\n      apiKey: \"" api-key "\"")
         use-current-session nil
         :else               (str ",\n      preferredAuthMethod: \"" (name auth-method) "\""))
       (when theme
         (str ",\n      theme: " theme))
       (when use-current-session
         ",\n      \"useExistingUserSession\": true")
       "
    });
  </script>
</body>
</html>"))

(defn app-handler
  "Handler for /apps/:name routes. Serves an HTML page with embedded collection browser.
   Looks up the App by name and uses its collection_id.
   API key can be provided via ?api_key query param or MB_APPS_API_KEY env var."
  [request respond _raise]
  (if-not (init-status/complete?)
    (respond {:status 503 :body "Metabase is still initializing..."})
    (let [app-name (get-in request [:route-params :name] "App")
          app      (get-app-by-name app-name)]
      (if-not app
        (respond {:status 404 :body (str "App not found: " app-name)})
        (let [api-key     (or (get-in request [:params :api_key])
                              (config/config-str :mb-apps-api-key))
              auth-method         (:auth_method app)
              theme               (:theme app)
              logo                (:logo app)
              coll-id             (:collection_id app)
              use-current-session (= "true" (get-in request [:params :useCurrentSession]))]
          (respond
           (-> (response/response (app-page-html (:name app) api-key auth-method theme logo coll-id use-current-session))
               (response/content-type "text/html; charset=utf-8")
               (response/header "Content-Security-Policy"
                                "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src *; frame-src *; img-src * data: blob:;"))))))))
