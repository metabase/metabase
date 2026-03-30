(ns metabase.metabot.api.permissions
  "`/api/metabot/permissions` routes"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.core :as mdb]
   [metabase.metabot.models.metabot-permissions :as metabot-permissions]
   [metabase.metabot.scope :as scope]
   [toucan2.core :as t2]))

(defn- permissions-for-group
  "Returns the full set of permissions for a group, filling in defaults for any missing perm types."
  [group-id stored-perms]
  (let [stored-by-type (into {} (map (juxt :perm_type identity)) stored-perms)]
    (for [[perm-type default-value] (sort-by key metabot-permissions/perm-type-defaults)]
      (or (get stored-by-type perm-type)
          {:group_id   group-id
           :perm_type  perm-type
           :perm_value default-value}))))

(defn- all-permissions
  "Returns all metabot permissions for all groups, filling in defaults for missing entries."
  []
  (let [groups     (t2/select :model/PermissionsGroup {:order-by [[:id :asc]]})
        stored     (t2/select :model/MetabotPermissions {:order-by [[:group_id :asc] [:perm_type :asc]]})
        by-group   (group-by :group_id stored)]
    {:permissions (vec (mapcat (fn [{:keys [id]}]
                                 (permissions-for-group id (get by-group id [])))
                               groups))}))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "List all metabot permissions for all groups, filling in defaults for missing entries."
  []
  (api/check-superuser)
  (all-permissions))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/"
  "Update metabot permissions for all groups. Upserts each permission entry and returns the full
   permissions list with defaults filled in."
  [_route-params
   _query-params
   {:keys [permissions]} :- [:map
                             [:permissions [:sequential [:map
                                                         [:group_id pos-int?]
                                                         [:perm_type :string]
                                                         [:perm_value :string]]]]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (doseq [{:keys [group_id perm_type perm_value]} permissions]
      (let [perm-type-kw  (keyword perm_type)
            perm-value-kw (keyword perm_value)]
        (mdb/update-or-insert! :model/MetabotPermissions
                               {:group_id  group_id
                                :perm_type perm-type-kw}
                               (constantly {:group_id   group_id
                                            :perm_type  perm-type-kw
                                            :perm_value perm-value-kw})))))
  (all-permissions))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(defn- simplify-permissions
  "Convert a keyword-keyed permissions map to simple string keys and values for JSON.
  e.g. {:permission/metabot :yes} → {\"metabot\" \"yes\"}"
  [perms]
  (into {} (map (fn [[k v]] [(name k) (name v)])) perms))

(api.macros/defendpoint :get "/user-permissions"
  "Return the current user's resolved metabot permissions, taking the most
  permissive value across all their groups."
  []
  {:permissions (simplify-permissions
                 (if api/*is-superuser?*
                   scope/all-yes-permissions
                   (scope/resolve-user-permissions api/*current-user-id*)))})

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/permissions` routes."
  (api.macros/ns-handler *ns* +auth))
