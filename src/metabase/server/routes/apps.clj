(ns metabase.server.routes.apps
  "Serve custom app pages with embedded Metabase dashboards using modular embedding SDK."
  (:require
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-app-by-name
  "Find an App by its name (case-insensitive)."
  [app-name]
  (t2/select-one :model/App :%lower.name (u/lower-case-en app-name)))

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
</head>
<body>
  <table id=\"app-table\">
    <tr>
      <td id=\"header\" colspan=\"2\">" app-name "</td>
    </tr>
    <tr id=\"main-row\">
      <td id=\"sidebar\">
        <div id=\"sidebar-content\">
          <div id=\"sidebar-header\">Dashboards</div>
          <ul id=\"dashboard-list\"></ul>
        </div>
      </td>
      <td id=\"dashboard-container\">
        " (if first-dashboard-id
            (str "<metabase-dashboard id=\"embedded-dashboard\" dashboard-id=\"" first-dashboard-id "\" with-title=\"true\" with-downloads=\"true\"></metabase-dashboard>")
            "<div class=\"empty-state\">No dashboards found in this collection</div>")
         "
      </td>
    </tr>
  </table>

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

      // Force table reflow after SDK loads (fixes width and vertical alignment)
      setTimeout(function() {
        const table = document.getElementById('app-table');
        const sidebar = document.getElementById('sidebar');
        if (table) {
          table.style.width = '99.9%';
          requestAnimationFrame(function() {
            table.style.width = '100%';
          });
        }
        if (sidebar) {
          sidebar.style.verticalAlign = 'top';
        }
      }, 100);
    })();
  </script>
</body>
</html>")))

(defn app-handler
  "Handler for /apps/:name routes. Serves an HTML page with embedded dashboards from a collection.
   Looks up the App by name and uses its collection_id to find dashboards.
   API key can be provided via ?api_key query param or MB_APPS_API_KEY env var."
  [request respond _raise]
  (if-not (init-status/complete?)
    (respond {:status 503 :body "Metabase is still initializing..."})
    (let [app-name (get-in request [:route-params :name] "App")
          app      (get-app-by-name app-name)]
      (if-not app
        (respond {:status 404 :body (str "App not found: " app-name)})
        (let [api-key    (or (get-in request [:params :api_key])
                             (config/config-str :mb-apps-api-key))
              coll-id    (:collection_id app)
              dashboards (get-dashboards-in-collection coll-id)]
          (respond
           (-> (response/response (app-page-html (:name app) api-key dashboards))
               (response/content-type "text/html; charset=utf-8"))))))))
