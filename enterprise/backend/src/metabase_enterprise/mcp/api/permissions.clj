(ns metabase-enterprise.mcp.api.permissions
  "`/api/ee/ai-controls/mcp-permissions` routes for managing which MCP tools each permissions group may use."
  (:require
   [metabase-enterprise.mcp.db :as mcp.db]
   [metabase-enterprise.mcp.settings :as mcp.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.mcp.v2.api :as mcp.v2.api]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private group-permission-schema
  [:map {:closed true}
   [:group_id    ms/PositiveInt]
   [:mcp_enabled :boolean]
   [:tool_access ::mcp.perms/tool-access]])

(def ^:private permissions-response-schema
  [:map {:closed true}
   [:advanced    :boolean]
   [:tools       [:sequential [:map {:closed true}
                               [:name           :string]
                               [:scope          :string]
                               [:description    :string]
                               [:default_access [:enum "allowed" "denied"]]]]]
   [:permissions [:sequential group-permission-schema]]])

(def ^:private no-access-permission
  "What a group with no row gets."
  {:mcp_enabled false :tool_access {}})

(def ^:private seeded-permission
  "What the migration gives the magic groups: MCP on, every tool at its author's default."
  {:mcp_enabled true :tool_access {}})

(defn- under-current-names
  "`tool-access` with each entry stored under a former tool name (`renamed`, former to current) presented under the
  current name; the current name's own entry wins."
  [renamed tool-access]
  (let [former (select-keys tool-access (keys renamed))]
    (merge (update-keys former renamed)
           (apply dissoc tool-access (keys former)))))

(defn- permissions-response
  "The policy of every group, defaults filled in for groups without a row, with the tool catalog and the mode."
  []
  (let [by-group (u/index-by :group_id (mcp.db/all-group-permissions))
        renamed  (mcp.v2.api/renamed-tool-names)]
    {:advanced    (boolean (mcp.settings/mcp-advanced-permissions))
     :tools       (mcp.v2.api/tool-catalog)
     :permissions (mapv (fn [group-id]
                          (-> (get by-group group-id no-access-permission)
                              (select-keys [:mcp_enabled :tool_access])
                              (update :tool_access #(under-current-names renamed %))
                              (assoc :group_id group-id)))
                        (mcp.db/all-group-ids))}))

(api.macros/defendpoint :get "/" :- permissions-response-schema
  "List the MCP tool policy of every group, with the tools it can name and the current permission mode."
  []
  (api/check-superuser)
  (permissions-response))

(defn- check-known-tools!
  "Throw a 400 naming the first tool in `permissions` that is neither a registered tool, a former name of one, nor
  already stored for its group."
  [permissions]
  (let [known    (into (set (keys (mcp.v2.api/renamed-tool-names))) (map :name) (mcp.v2.api/tool-catalog))
        by-group (u/index-by :group_id (mcp.db/all-group-permissions))]
    (doseq [{:keys [group_id tool_access]} permissions
            :let                           [stored (set (keys (:tool_access (by-group group_id))))]
            tool-name                      (keys tool_access)]
      (api/check-400 (or (known tool-name) (stored tool-name)) (tru "Unknown MCP tool: {0}" tool-name)))))

(defn- check-known-groups!
  "Throw a 400 naming the first `group_id` in `permissions` that is not a permissions group."
  [permissions]
  (let [known (set (mcp.db/all-group-ids))]
    (doseq [{:keys [group_id]} permissions]
      (api/check-400 (contains? known group_id) (tru "Unknown group: {0}" (str group_id))))))

(api.macros/defendpoint :put "/" :- permissions-response-schema
  "Set the MCP tool policy of the given groups, in one transaction, and return the policy of every group."
  [_route-params
   _query-params
   {:keys [permissions]} :- [:map {:closed true}
                             [:permissions [:sequential group-permission-schema]]]]
  (api/check-superuser)
  (check-known-tools! permissions)
  (check-known-groups! permissions)
  (t2/with-transaction [_conn]
    (doseq [{:keys [group_id] :as permission} permissions]
      (mcp.db/upsert-group-permission! group_id (select-keys permission [:mcp_enabled :tool_access]))))
  (permissions-response))

(defn- switch-mode!
  "Switch permission modes and delete the rows hidden by the destination mode in a single transaction. Leaving
  group-level mode also puts the seeded groups back in their seeded state."
  [advanced?]
  (try
    (t2/with-transaction [_conn]
      (mcp.db/delete-hidden-group-permissions! advanced?)
      (when-not advanced?
        (doseq [group-id (mcp.db/seeded-group-ids)]
          (mcp.db/upsert-group-permission! group-id seeded-permission)))
      (setting/set! :mcp-advanced-permissions advanced? :bypass-read-only? true))
    (catch Throwable e
      ;; the setting write updated the cache in place, so a rolled-back transaction leaves it describing the
      ;; other mode
      (setting/restore-cache!)
      (throw e))))

(defn- check-mode-switchable!
  "Throw a 400 when [[mcp.settings/mcp-advanced-permissions]] is set by the `MB_MCP_ADVANCED_PERMISSIONS`
  environment variable."
  []
  (api/check-400 (not (setting/env-var-value :mcp-advanced-permissions))
                 (tru "The permission mode is set by the MB_MCP_ADVANCED_PERMISSIONS environment variable.")))

(api.macros/defendpoint :post "/advanced" :- permissions-response-schema
  "Switch to group-level MCP tool access. Removes the rows of All Users and All tenant users, so access comes only
   from the rows of the other groups."
  []
  (api/check-superuser)
  (check-mode-switchable!)
  (switch-mode! true)
  (permissions-response))

(api.macros/defendpoint :delete "/advanced" :- permissions-response-schema
  "Switch back to All Users only. Removes the rows of every group other than Administrators, All Users and All
   tenant users, and restores All Users, Data Analysts and All tenant users to MCP on with every tool at its
   default, the state the migration leaves."
  []
  (api/check-superuser)
  (check-mode-switchable!)
  (switch-mode! false)
  (permissions-response))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-controls/mcp-permissions` routes."
  (api.macros/ns-handler *ns* +auth))
