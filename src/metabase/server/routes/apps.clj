(ns metabase.server.routes.apps
  "Serve custom app pages with embedded Metabase dashboards using modular embedding SDK."
  (:require
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.system.core :as system]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

;; Hardcoded dashboard ID for now
(def ^:private dashboard-id 1)

(defn- app-page-html
  "Generate HTML page with embedded dashboard using modular embedding SDK.
   Supports API key authentication for local development via query param or env var."
  [app-name api-key]
  (let [site-url (or (system/site-url) "")]
    (str "<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>" app-name " - Metabase App</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { height: 100vh; display: flex; flex-direction: column; }
    header { padding: 16px 24px; background: #509EE3; color: white; }
    header h1 { font-size: 20px; font-weight: 600; }
    .dashboard-container { flex: 1; width: 100%; overflow: auto; }
    metabase-dashboard { display: block; height: 100%; width: 100%; }
  </style>
</head>
<body>
  <div class=\"container\">
    <header>
      <h1>" app-name "</h1>
    </header>
    <div class=\"dashboard-container\">
      <metabase-dashboard dashboard-id=\"" dashboard-id "\" with-title=\"true\" with-downloads=\"true\"></metabase-dashboard>
    </div>
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
         (when api-key
           (str ",\n      apiKey: \"" api-key "\""))
         "
    });
  </script>
</body>
</html>")))

(defn app-handler
  "Handler for /apps/:name routes. Serves an HTML page with embedded dashboard using modular embedding.
   API key can be provided via ?api_key query param or MB_APPS_API_KEY env var."
  [request respond _raise]
  (if-not (init-status/complete?)
    (respond {:status 503 :body "Metabase is still initializing..."})
    (let [app-name (get-in request [:route-params :name] "App")
          api-key  (or (get-in request [:params :api_key])
                       (config/config-str :mb-apps-api-key))]
      (respond
       (-> (response/response (app-page-html app-name api-key))
           (response/content-type "text/html; charset=utf-8"))))))
