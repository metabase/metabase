(ns metabase.server.routes.apps
  "Serve custom app pages with embedded Metabase collection browser using modular embedding SDK."
  (:require
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.system.core :as system]
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
  [app-name api-key auth-method theme collection-id]
  (let [site-url (or (system/site-url) "")]
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
    }
    .app-content { flex: 1; overflow: hidden; }
  </style>
</head>
<body>
  <div id=\"app-container\">
    <app-wrapper>
      <div class=\"app-header\">" app-name "</div>
      <div class=\"app-content\">
        <metabase-browser initial-collection=\"" collection-id "\"></metabase-browser>
      </div>
    </app-wrapper>
  </div>

  <script defer src=\"" site-url "/app/embed.js\"></script>
  <script>
    function defineMetabaseConfig(config) {
      window.metabaseConfig = config;
    }
  </script>
  <script>
    defineMetabaseConfig({
      instanceUrl: \"" site-url "\""
         (if api-key
           (str ",\n      apiKey: \"" api-key "\"")
           (str ",\n      preferredAuthMethod: \"" (name auth-method) "\""))
         (when theme
           (str ",\n      theme: " theme))
         "
    });
  </script>
</body>
</html>")))

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
              auth-method (:auth_method app)
              theme       (:theme app)
              coll-id     (:collection_id app)]
          (respond
           (-> (response/response (app-page-html (:name app) api-key auth-method theme coll-id))
               (response/content-type "text/html; charset=utf-8")
               (response/header "Content-Security-Policy"
                                "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src *; frame-src *; img-src * data: blob:;"))))))))
