(ns metabase-enterprise.mcp.api.permissions
  "`/api/ee/ai-controls/mcp-permissions` routes for managing which MCP tools each permissions group may use. Every
  route is superuser-only. Setting a group's policy and entering group-level mode need the `:ai-controls` feature;
  reading the policy and switching back to All Users do not, since the rows stay enforced without the feature."
  (:require
   [metabase-enterprise.mcp.db :as mcp.db]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.mcp.v2.api :as mcp.v2.api]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
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

(def ^:private policy-lock
  "Serializes every write to the MCP tool policy across the cluster, so a PUT validated against one mode can't land
  after a switch to the other, and two PUTs can't both insert a group's first row."
  ::mcp-policy-lock)

(def ^:private no-access-permission
  "What a group with no row gets."
  {:mcp_enabled false :tool_access {}})

(def ^:private seeded-permission
  "What a group gets when a mode switch seeds it: MCP on, every tool at its author's default."
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
  (let [by-group (u/index-by :group_id (filter mi/can-read? (mcp.db/all-group-permissions)))
        renamed  (mcp.v2.api/renamed-tool-names)]
    {:advanced    (mcp.db/advanced-mode?)
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

(defn- check-writable
  "Throw a 403 unless the current user may write the row of each group in `permissions`, or create one for a group
  that has none."
  [permissions]
  (let [by-group (u/index-by :group_id (mcp.db/all-group-permissions))]
    (doseq [{:keys [group_id] :as permission} permissions]
      (if-let [row (by-group group_id)]
        (api/write-check row)
        (api/create-check :model/McpGroupPermission permission)))))

(defn- check-visible-groups
  "Throw a 400 naming the first `group_id` in `permissions` that is not a group the current mode shows, since such a
  row would take effect unseen on the next mode switch."
  [permissions]
  (let [visible (mcp.db/visible-group-ids (mcp.db/advanced-mode?))]
    (doseq [{:keys [group_id]} permissions]
      (api/check-400 (contains? visible group_id)
                     (tru "Unknown group, or one the current permission mode hides: {0}" (str group_id))))))

(api.macros/defendpoint :put "/" :- permissions-response-schema
  "Set the MCP tool policy of the given groups, in one transaction, and return the policy of every group."
  [_route-params
   _query-params
   {:keys [permissions]} :- [:map {:closed true}
                             [:permissions [:sequential group-permission-schema]]]]
  (api/check-superuser)
  (premium-features/assert-has-feature :ai-controls (tru "AI Controls"))
  (cluster-lock/with-cluster-lock policy-lock
    (check-writable permissions)
    (check-visible-groups permissions)
    (t2/with-transaction [_conn]
      (doseq [{:keys [group_id] :as permission} permissions]
        (mcp.db/upsert-group-permission! group_id (select-keys permission [:mcp_enabled :tool_access])))))
  (permissions-response))

(defn- switch-mode!
  "Switch permission modes in one transaction: delete the rows of the groups the destination mode hides and seed the
  groups it enables on entry that have no row yet."
  [advanced?]
  (cluster-lock/with-cluster-lock policy-lock
    (run! api/write-check (mcp.db/hidden-group-permissions advanced?))
    (api/create-check :model/McpGroupPermission seeded-permission)
    (t2/with-transaction [_conn]
      (mcp.db/delete-hidden-group-permissions! advanced?)
      (doseq [group-id (mcp.db/seeded-group-ids advanced?)]
        (mcp.db/insert-group-permission-unless-exists! group-id seeded-permission)))))

(api.macros/defendpoint :post "/advanced" :- permissions-response-schema
  "Switch to group-level MCP tool access. Removes the rows of All Users and All tenant users, so access comes only
   from the rows of the other groups, and enables Data Analysts with every tool at its default when it has no row."
  []
  (api/check-superuser)
  (premium-features/assert-has-feature :ai-controls (tru "AI Controls"))
  (switch-mode! true)
  (permissions-response))

(api.macros/defendpoint :delete "/advanced" :- permissions-response-schema
  "Switch back to All Users only. Removes the rows of every group other than Administrators, All Users and All
   tenant users, and enables All Users and All tenant users with every tool at its default, the state the migration
   leaves."
  []
  (api/check-superuser)
  (switch-mode! false)
  (permissions-response))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-controls/mcp-permissions` routes."
  (api.macros/ns-handler *ns* +auth))
