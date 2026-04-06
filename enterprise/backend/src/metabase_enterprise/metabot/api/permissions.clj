(ns metabase-enterprise.metabot.api.permissions
  "`/api/ee/ai-controls/permissions` routes for managing metabot permissions per group."
  (:require
   [metabase-enterprise.metabot.models.metabot-permissions :as metabot-perms]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.scope :as scope]
   [toucan2.core :as t2]))

(def ^:private perm-type-enum
  "Malli enum of valid perm_type keywords."
  (into [:enum] scope/perm-types))

(def ^:private perm-value-enum
  "Malli enum of valid perm_value keywords."
  (into [:enum] (distinct (mapcat (comp :values val) scope/metabot-permissions))))

(def ^:private permissions-response-schema
  [:map [:permissions [:sequential [:map
                                    [:group_id  pos-int?]
                                    [:perm_type perm-type-enum]
                                    [:perm_value perm-value-enum]]]]])

(api.macros/defendpoint :get "/" :- permissions-response-schema
  "List all metabot permissions for all groups, filling in defaults for missing entries."
  []
  (api/check-superuser)
  (metabot-perms/all-permissions))

(def ^:private valid-perm-types
  "Set of valid perm_type strings for the PUT request body."
  (into #{} (map (comp str symbol)) scope/perm-types))

(def ^:private valid-perm-values-by-type
  "Map of perm_type string → set of valid perm_value strings for that type."
  (into {} (map (fn [[perm-type {:keys [values]}]]
                  [(-> perm-type symbol str) (into #{} (map name) values)]))
        scope/metabot-permissions))

(defn- valid-perm-value?
  "Returns true if `perm_value` is valid for the given `perm_type`."
  [{:keys [perm_type perm_value]}]
  (contains? (get valid-perm-values-by-type perm_type) perm_value))

(def ^:private all-valid-perm-values
  "Flat set of all valid perm_value strings (for schema-level validation)."
  (into #{} (mapcat val) valid-perm-values-by-type))

(api.macros/defendpoint :put "/" :- permissions-response-schema
  "Update metabot permissions for all groups. Upserts each permission entry and returns the full
   permissions list with defaults filled in."
  [_route-params
   _query-params
   {:keys [permissions]} :- [:map
                             [:permissions [:sequential [:map
                                                         [:group_id pos-int?]
                                                         [:perm_type  (into [:enum] valid-perm-types)]
                                                         [:perm_value (into [:enum] all-valid-perm-values)]]]]]]
  (api/check-superuser)
  (doseq [perm permissions]
    (when-not (valid-perm-value? perm)
      (throw (ex-info (format "Invalid perm_value %s for perm_type %s" (:perm_value perm) (:perm_type perm))
                      {:status-code 400}))))
  (t2/with-transaction [_conn]
    (doseq [{:keys [group_id perm_type perm_value]} permissions]
      (let [perm-type-kw  (keyword perm_type)
            perm-value-kw (keyword perm_value)]
        (if (t2/exists? :model/MetabotPermissions :group_id group_id :perm_type perm-type-kw)
          (t2/update! :model/MetabotPermissions {:group_id group_id :perm_type perm-type-kw} {:perm_value perm-value-kw})
          (t2/insert! :model/MetabotPermissions {:group_id   group_id
                                                 :perm_type  perm-type-kw
                                                 :perm_value perm-value-kw})))))
  (metabot-perms/all-permissions))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-controls/permissions` routes."
  (api.macros/ns-handler *ns* +auth))
