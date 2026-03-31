(ns metabase-enterprise.metabot.api.permissions
  "`/api/ee/ai-controls/permissions` routes for managing metabot permissions per group."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.core :as mdb]
   [metabase.metabot.models.metabot-permissions :as metabot-permissions]
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

(def ^:private permissions-response-schema
  [:map [:permissions [:sequential [:map
                                    [:group_id  pos-int?]
                                    [:perm_type :keyword]
                                    [:perm_value :keyword]]]]])

(api.macros/defendpoint :get "/" :- permissions-response-schema
  "List all metabot permissions for all groups, filling in defaults for missing entries."
  []
  (api/check-superuser)
  (all-permissions))

(def ^:private valid-perm-types
  "Set of valid perm_type strings for the PUT request body."
  (into #{} (map (comp str symbol)) metabot-permissions/perm-types))

(def ^:private valid-perm-values
  "Set of all valid perm_value strings across all permission types."
  (into #{} (comp (mapcat (comp :values val)) (map name)) metabot-permissions/metabot-permissions))

(api.macros/defendpoint :put "/" :- permissions-response-schema
  "Update metabot permissions for all groups. Upserts each permission entry and returns the full
   permissions list with defaults filled in."
  [_route-params
   _query-params
   {:keys [permissions]} :- [:map
                             [:permissions [:sequential [:map
                                                         [:group_id pos-int?]
                                                         [:perm_type  (into [:enum] valid-perm-types)]
                                                         [:perm_value (into [:enum] valid-perm-values)]]]]]]
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-controls/permissions` routes."
  (api.macros/ns-handler *ns* +auth))
