(ns metabase.server.routes.apps
  "Serve custom app pages with embedded Metabase dashboards using modular embedding SDK."
  (:require
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.system.core :as system]
   [metabase.util.json :as json]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Hardcoded collection ID for now
(def ^:private collection-id 7)

(defn- get-dashboards-in-collection
  "Get all dashboards in a collection."
  [coll-id]
  (t2/select [:model/Dashboard :id :name :description]
             :collection_id coll-id
             :archived false
             {:order-by [[:name :asc]]}))

(defn- app-page-html
  "Generate HTML page with sidebar of dashboards and embedded dashboard viewer."
  [app-name api-key dashboards]
  (let [site-url (or (system/site-url) "")
        dashboards-json (json/encode (mapv #(select-keys % [:id :name :description]) dashboards))
        first-dashboard-id (some-> dashboards first :id)]
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

    .app-container { height: 100vh; display: flex; flex-direction: column; }

    header {
      padding: 16px 24px;
      background: #509EE3;
      color: white;
      flex-shrink: 0;
    }
    header h1 { font-size: 20px; font-weight: 600; }

    .main-content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .sidebar {
      width: 280px;
      background: #f8f9fa;
      border-right: 1px solid #e0e0e0;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 16px;
      font-weight: 600;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e0e0e0;
    }

    .dashboard-list {
      list-style: none;
    }

    .dashboard-link {
      display: block;
      padding: 12px 16px;
      text-decoration: none;
      color: inherit;
      border-bottom: 1px solid #eee;
      transition: background 0.15s;
    }

    .dashboard-link:hover {
      background: #e8f4fd;
    }

    .dashboard-link.active {
      background: #509EE3;
      color: white;
    }

    .dashboard-link-name {
      font-weight: 500;
      font-size: 14px;
    }

    .dashboard-link-desc {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dashboard-link.active .dashboard-link-desc {
      color: rgba(255,255,255,0.8);
    }

    .dashboard-container {
      flex: 1;
      overflow: auto;
      background: #fff;
    }

    metabase-dashboard {
      display: block;
      height: 100%;
      width: 100%;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #888;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class=\"app-container\">
    <header>
      <h1>" app-name "</h1>
    </header>

    <div class=\"main-content\">
      <nav class=\"sidebar\">
        <div class=\"sidebar-header\">Dashboards</div>
        <ul class=\"dashboard-list\" id=\"dashboard-list\">
        </ul>
      </nav>

      <main class=\"dashboard-container\" id=\"dashboard-container\">
        " (if first-dashboard-id
            (str "<metabase-dashboard id=\"embedded-dashboard\" dashboard-id=\"" first-dashboard-id "\" with-title=\"true\" with-downloads=\"true\"></metabase-dashboard>")
            "<div class=\"empty-state\">No dashboards found in this collection</div>")
         "
      </main>
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

  <script>
    (function() {
      const dashboards = " dashboards-json ";
      const listEl = document.getElementById('dashboard-list');
      const containerEl = document.getElementById('dashboard-container');
      let currentDashboardId = " (or first-dashboard-id "null") ";

      function getBaseUrl() {
        return window.location.pathname + window.location.search;
      }

      function renderDashboardList() {
        listEl.innerHTML = dashboards.map(d => `
          <li>
            <a href=\"${getBaseUrl()}#dashboard=${d.id}\"
               class=\"dashboard-link ${d.id === currentDashboardId ? 'active' : ''}\"
               data-id=\"${d.id}\">
              <div class=\"dashboard-link-name\">${d.name}</div>
              ${d.description ? `<div class=\"dashboard-link-desc\">${d.description}</div>` : ''}
            </a>
          </li>
        `).join('');
      }

      function selectDashboard(dashboardId, updateHash) {
        if (dashboardId === currentDashboardId) return;
        currentDashboardId = dashboardId;

        // Update URL hash
        if (updateHash) {
          history.pushState(null, '', `${getBaseUrl()}#dashboard=${dashboardId}`);
        }

        // Update active state in sidebar
        renderDashboardList();

        // Replace the dashboard component
        containerEl.innerHTML = `<metabase-dashboard id=\"embedded-dashboard\" dashboard-id=\"${dashboardId}\" with-title=\"true\" with-downloads=\"true\"></metabase-dashboard>`;
      }

      function getDashboardIdFromHash() {
        const match = window.location.hash.match(/dashboard=(\\d+)/);
        return match ? parseInt(match[1], 10) : null;
      }

      // Handle link clicks
      listEl.addEventListener('click', function(e) {
        const link = e.target.closest('.dashboard-link');
        if (link) {
          e.preventDefault();
          const id = parseInt(link.dataset.id, 10);
          selectDashboard(id, true);
        }
      });

      // Handle browser back/forward
      window.addEventListener('hashchange', function() {
        const id = getDashboardIdFromHash();
        if (id) selectDashboard(id, false);
      });

      // Check hash on load
      const hashDashboardId = getDashboardIdFromHash();
      if (hashDashboardId && hashDashboardId !== currentDashboardId) {
        currentDashboardId = hashDashboardId;
        containerEl.innerHTML = `<metabase-dashboard id=\"embedded-dashboard\" dashboard-id=\"${hashDashboardId}\" with-title=\"true\" with-downloads=\"true\"></metabase-dashboard>`;
      }

      // Initial render
      renderDashboardList();
    })();
  </script>
</body>
</html>")))

(defn app-handler
  "Handler for /apps/:name routes. Serves an HTML page with embedded dashboards from a collection.
   API key can be provided via ?api_key query param or MB_APPS_API_KEY env var.
   Collection ID can be provided via ?collection_id query param (defaults to 1)."
  [request respond _raise]
  (if-not (init-status/complete?)
    (respond {:status 503 :body "Metabase is still initializing..."})
    (let [app-name      (get-in request [:route-params :name] "App")
          api-key       (or (get-in request [:params :api_key])
                            (config/config-str :mb-apps-api-key))
          coll-id       (or (some-> (get-in request [:params :collection_id]) parse-long)
                            collection-id)
          dashboards    (get-dashboards-in-collection coll-id)]
      (respond
       (-> (response/response (app-page-html app-name api-key dashboards))
           (response/content-type "text/html; charset=utf-8"))))))
