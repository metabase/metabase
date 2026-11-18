(ns metabase-enterprise.metabot.api.permissions
  "`/api/ee/ai-controls/permissions` routes for managing metabot permissions per group."
  (:require
   [metabase-enterprise.metabot.db :as metabot.db]
   [metabase-enterprise.metabot.models.metabot-permissions :as metabot-perms]
   [metabase-enterprise.metabot.schema :as metabot-ee.schema]
   [metabase-enterprise.metabot.settings :as metabot-settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(def ^:private permissions-response-schema
  [:map
   [:permissions [:sequential [:map
                               [:group_id   pos-int?]
                               [:perm_type  ::metabot-ee.schema/metabot-permissions.perm-type]
                               [:perm_value ::metabot-ee.schema/metabot-permissions.perm-value]]]]
   [:advanced :boolean]])

(defn- permissions-response
  "Returns the full permissions graph plus the current `metabot-advanced-permissions` flag."
  []
  (assoc (metabot-perms/all-permissions)
         :advanced (boolean (metabot-settings/metabot-advanced-permissions))))

(api.macros/defendpoint :get "/" :- permissions-response-schema
  "List all metabot permissions for all groups, filling in defaults for missing entries."
  []
  (api/check-superuser)
  (permissions-response))

(api.macros/defendpoint :put "/" :- permissions-response-schema
  "Update metabot permissions for all groups. Upserts each permission entry and returns the full
   permissions list with defaults filled in."
  [_route-params
   _query-params
   {:keys [permissions]} :- [:map {:closed true}
                             [:permissions [:sequential [:merge
                                                         ::metabot-ee.schema/metabot-permissions.update
                                                         [:map {:closed true}
                                                          [:group_id pos-int?]
                                                          [:perm_type  ::metabot-ee.schema/metabot-permissions.perm-type]
                                                          [:perm_value ::metabot-ee.schema/metabot-permissions.perm-value]]]]]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (doseq [{:keys [group_id perm_type perm_value]} permissions]
      (let [perm-type-kw  (keyword perm_type)
            perm-value-kw (keyword perm_value)]
        (if (metabot.db/permission-exists? group_id perm-type-kw)
          (metabot.db/update-permission-value! group_id perm-type-kw perm-value-kw)
          (metabot.db/insert-permission! {:group_id   group_id
                                          :perm_type  perm-type-kw
                                          :perm_value perm-value-kw})))))
  (permissions-response))

(defn- switch-mode!
  "Switch permission modes and delete rows hidden by the destination mode in a single transaction.

  The setting is written last. If the transaction fails, the settings cache is reloaded because the setting write
  updates it in place; otherwise, this node could continue using the rolled-back mode."
  [advanced?]
  (try
    (t2/with-transaction [_conn]
      (metabot.db/delete-hidden-group-permissions! advanced?)
      (metabot-settings/metabot-advanced-permissions! advanced?))
    (catch Throwable e
      (setting/restore-cache!)
      (throw e))))

(defn- check-mode-switchable!
  "Throw a 400 when [[metabot-settings/metabot-advanced-permissions]] is forced by an environment variable.
  Writing the setting would then have no effect, while the associated row deletions would leave the instance in a
  state that neither mode describes."
  []
  (api/check-400 (not (setting/env-var-value :metabot-advanced-permissions))
                 (tru "The permission mode is set by the MB_METABOT_ADVANCED_PERMISSIONS environment variable.")))

(api.macros/defendpoint :post "/advanced" :- permissions-response-schema
  "Switch to group-level permissions. Removes the permissions of All Users and All tenant users, so nobody has
   access until they are in a group that grants it."
  []
  (api/check-superuser)
  (check-mode-switchable!)
  (switch-mode! true)
  (permissions-response))

(api.macros/defendpoint :delete "/advanced" :- permissions-response-schema
  "Switch back to simple permissions. Removes the permissions of every group other than Administrators, All Users
   and All tenant users."
  []
  (api/check-superuser)
  (check-mode-switchable!)
  (switch-mode! false)
  (permissions-response))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-controls/permissions` routes."
  (api.macros/ns-handler *ns* +auth))
