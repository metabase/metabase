(ns metabase.permissions.api
  "/api/permissions endpoints."
  (:require
   [clojure.data :as data]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.macros :as api.macros]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.models.interface :as mi]
   [metabase.permissions.api.permission-graph :as api.permission-graph]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-revision :as perms-revision]
   [metabase.permissions.util :as perms.u]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; v50 Permissions Tutorial settings
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Bryan (7/8/24): The following 2 settings are meant to mitigate any confusion for admins over the new and improved
;; permissions format. It looks different, so we want to make sure they know what's up.
;; We don't want to show the modal or banner to admins who started using MB after v50 or who have dismissed them.
;; We should come back around and delete them from the master branch in a few months.

(defn- instance-create-time []
  (->> (t2/select-one [:model/User [:%min.date_joined :min]]) :min t/local-date-time))

(defn- v-fifty-migration-time []
  (let [v50-migration-id "v50.2024-01-04T13:52:51"]
    (->> (mdb/changelog-by-id (mdb/app-db) v50-migration-id) :dateexecuted)))

(defsetting show-updated-permission-modal
  (deferred-tru
   "Whether an introductory modal should be shown for admins when they first upgrade to the new data-permissions format.")
  :visibility :admin
  :export?    false
  :default    true
  :user-local :only
  :getter (fn [] (if (t/after? (instance-create-time) (v-fifty-migration-time))
                   false
                   (setting/get-value-of-type :boolean :show-updated-permission-modal)))
  :type       :boolean
  :audit      :never)

(defsetting show-updated-permission-banner
  (deferred-tru
   "Whether an informational header should be displayed in the permissions editor about the new data-permissions format.")
  :visibility :admin
  :export?    false
  :default    true
  :user-local :only
  :getter (fn [] (if (t/after? (instance-create-time) (v-fifty-migration-time))
                   false
                   (setting/get-value-of-type :boolean :show-updated-permission-banner)))
  :type       :boolean
  :audit      :never)

(defn- turn-off-tenants! []
  ;; TODO: when we have `:model/Tenant`, make sure none exist
  (when (t2/exists? :model/User :tenant_id [:not= nil])
    (throw (ex-info (tru "Tenants cannot be turned off, a tenant user exists") {})))
  (perms-group/delete-all-external-users!))

(defn- turn-on-tenants! []
  (perms-group/create-all-external-users!))

(defsetting use-tenants
  (deferred-tru
   "Turn on the Tenants feature, allowing users to be assigned to a particular Tenant.")
  :type :boolean
  :visibility :admin
  :export? false
  :default false
  :feature :tenants
  :can-read-from-env? false
  :setter (fn [new-value]
            (when-not new-value
              (turn-off-tenants!))
            (when new-value
              (turn-on-tenants!))
            (setting/set-value-of-type! :boolean :use-tenants new-value)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PERMISSIONS GRAPH ENDPOINTS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/graph"
  "Fetch a graph of all Permissions."
  []
  (api/check-superuser)
  (data-perms.graph/api-graph))

(api.macros/defendpoint :get "/graph/db/:db-id"
  "Fetch a graph of all Permissions for db-id `db-id`."
  [{:keys [db-id]} :- [:map
                       [:db-id ms/PositiveInt]]]
  (api/check-superuser)
  (data-perms.graph/api-graph {:db-id db-id}))

(api.macros/defendpoint :get "/graph/group/:group-id"
  "Fetch a graph of all Permissions for group-id `group-id`."
  [{:keys [group-id]} :- [:map
                          [:group-id ms/PositiveInt]]]
  (api/check-superuser)
  (data-perms.graph/api-graph {:group-id group-id}))

(defenterprise upsert-sandboxes!
  "OSS implementation of `upsert-sandboxes!`. Errors since this is an enterprise feature."
  metabase-enterprise.sandbox.models.group-table-access-policy
  [_sandboxes]
  (throw (premium-features/ee-feature-error (tru "Sandboxes"))))

(defenterprise insert-impersonations!
  "OSS implementation of `insert-impersonations!`. Errors since this is an enterprise feature."
  metabase-enterprise.impersonation.model
  [_impersonations]
  (throw (premium-features/ee-feature-error (tru "Connection impersonation"))))

(api.macros/defendpoint :put "/graph"
  "Do a batch update of Permissions by passing in a modified graph. This should return the same graph, in the same
  format, that you got from `GET /api/permissions/graph`, with any changes made in the wherever necessary. This
  modified graph must correspond to the `PermissionsGraph` schema. If successful, this endpoint returns the updated
  permissions graph; use this as a base for any further modifications.

  Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party
  modifies it before you can submit you revisions, the endpoint will instead make no changes and return a
  409 (Conflict) response. In this case, you should fetch the updated graph and make desired changes to that.

  The optional `sandboxes` key contains a list of sandboxes that should be created or modified in conjunction with
  this permissions graph update. Since data sandboxing is an Enterprise Edition-only feature, a 402 (Payment Required)
  response will be returned if this key is present and the server is not running the Enterprise Edition, and/or the
  `:sandboxes` feature flag is not present.

  If the skip-graph query param is truthy, then the graph will not be returned."
  [_route-params
   {:keys [skip-graph force]} :- [:map
                                  [:skip-graph {:default false} [:maybe ms/BooleanValue]]
                                  [:force      {:default false} [:maybe ms/BooleanValue]]]
   body :- :map]
  (api/check-superuser)
  (let [new-graph (mc/decode api.permission-graph/StrictApiPermissionsGraph
                             body
                             (mtx/transformer
                              mtx/string-transformer
                              (mtx/transformer {:name :perm-graph})))]
    (when-not (mr/validate api.permission-graph/DataPermissionsGraph new-graph)
      (let [explained (mu/explain api.permission-graph/DataPermissionsGraph new-graph)]
        (throw (ex-info (tru "Cannot parse permissions graph because it is invalid: {0}" (pr-str explained))
                        {:status-code 400}))))
    (t2/with-transaction [_conn]
      (let [group-ids (-> new-graph :groups keys)
            old-graph (data-perms.graph/api-graph {:group-ids group-ids})
            [old new] (data/diff (:groups old-graph)
                                 (:groups new-graph))
            old       (or old {})
            new       (or new {})]
        (perms.u/log-permissions-changes old new)
        (when-not force (perms.u/check-revision-numbers old-graph new-graph))
        (data-perms.graph/update-data-perms-graph! {:groups new})
        (perms.u/save-perms-revision! :model/PermissionsRevision (:revision old-graph) old new)
        (let [sandbox-updates        (:sandboxes new-graph)
              sandboxes              (when sandbox-updates
                                       (upsert-sandboxes! sandbox-updates))
              impersonation-updates  (:impersonations new-graph)
              impersonations         (when impersonation-updates
                                       (insert-impersonations! impersonation-updates))
              group-ids (-> new-graph :groups keys)]
          (merge {:revision (perms-revision/latest-id)}
                 (when-not skip-graph {:groups (:groups (data-perms.graph/api-graph {:group-ids group-ids}))})
                 (when sandboxes {:sandboxes sandboxes})
                 (when impersonations {:impersonations impersonations})))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PERMISSIONS GROUP ENDPOINTS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- group-id->num-members
  "Return a map of `PermissionsGroup` ID -> number of members in the group. (This doesn't include entries for empty
  groups.)"
  []
  (let [results (mdb.query/query
                 {:select    [[:pgm.group_id :group_id] [[:count :pgm.id] :members]]
                  :from      [[:permissions_group_membership :pgm]]
                  :left-join [[:core_user :user] [:= :pgm.user_id :user.id]]
                  :where     [:= :user.is_active true]
                  :group-by  [:pgm.group_id]})]
    (zipmap
     (map :group_id results)
     (map :members results))))

(defn- ordered-groups
  "Return a sequence of ordered `PermissionsGroups`."
  [limit offset query]
  (t2/select :model/PermissionsGroup
             (cond-> {:order-by [:%lower.name]}
               (some? limit)  (sql.helpers/limit  limit)
               (some? offset) (sql.helpers/offset offset)
               (some? query)  (sql.helpers/where query))))

(mi/define-batched-hydration-method add-member-counts
  :member_count
  "Efficiently add `:member_count` to PermissionGroups."
  [groups]
  (let [group-id->num-members (group-id->num-members)]
    (for [group groups]
      (assoc group :member_count (get group-id->num-members (u/the-id group) 0)))))

(api.macros/defendpoint :get "/group"
  "Fetch all `PermissionsGroups`, including a count of the number of `:members` in that group.
  This API requires superuser or group manager of more than one group.
  Group manager is only available if `advanced-permissions` is enabled and returns only groups that user
  is manager of."
  []
  (try
    (validation/check-group-manager)
    (catch clojure.lang.ExceptionInfo _e
      (validation/check-has-application-permission :setting)))
  (let [query (when (and (not api/*is-superuser?*)
                         (premium-features/enable-advanced-permissions?)
                         api/*is-group-manager?*)
                [:in :id {:select [:group_id]
                          :from   [:permissions_group_membership]
                          :where  [:and
                                   [:= :user_id api/*current-user-id*]
                                   [:= :is_group_manager true]]}])]
    (-> (ordered-groups (request/limit) (request/offset) query)
        (t2/hydrate :member_count))))

(api.macros/defendpoint :get "/group/:id"
  "Fetch the details for a certain permissions group."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (validation/check-group-manager id)
  (api/check-404
   (-> (t2/select-one :model/PermissionsGroup :id id)
       (t2/hydrate :members))))

(api.macros/defendpoint :post "/group"
  "Create a new `PermissionsGroup`."
  [_route-params
   _query-params
   {:keys [name]} :- [:map
                      [:name ms/NonBlankString]]]
  (api/check-superuser)
  (first (t2/insert-returning-instances! :model/PermissionsGroup
                                         :name name)))

(api.macros/defendpoint :put "/group/:group-id"
  "Update the name of a `PermissionsGroup`."
  [{:keys [group-id]} :- [:map
                          [:group-id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map
                      [:name ms/NonBlankString]]]
  (validation/check-manager-of-group group-id)
  (api/check-404 (t2/exists? :model/PermissionsGroup :id group-id))
  (t2/update! :model/PermissionsGroup group-id
              {:name name})
  ;; return the updated group
  (t2/select-one :model/PermissionsGroup :id group-id))

(api.macros/defendpoint :delete "/group/:group-id"
  "Delete a specific `PermissionsGroup`."
  [{:keys [group-id]} :- [:map
                          [:group-id ms/PositiveInt]]]
  (validation/check-manager-of-group group-id)
  (t2/delete! :model/PermissionsGroup :id group-id)
  api/generic-204-no-content)

;;; ------------------------------------------- Group Membership Endpoints -------------------------------------------

(api.macros/defendpoint :get "/membership"
  "Fetch a map describing the group memberships of various users.
   This map's format is:

    {<user-id> [{:membership_id    <id>
                 :group_id         <id>
                 :is_group_manager boolean}]}"
  []
  (validation/check-group-manager)
  (group-by :user_id (t2/select [:model/PermissionsGroupMembership [:id :membership_id] :group_id :user_id :is_group_manager]
                                (cond-> {}
                                  (and (not api/*is-superuser?*)
                                       api/*is-group-manager?*)
                                  (sql.helpers/where
                                   [:in :group_id {:select [:group_id]
                                                   :from   [:permissions_group_membership]
                                                   :where  [:and
                                                            [:= :user_id api/*current-user-id*]
                                                            [:= :is_group_manager true]]}])))))

(api.macros/defendpoint :post "/membership"
  "Add a `User` to a `PermissionsGroup`. Returns updated list of members belonging to the group."
  [_route-params
   _query-params
   {:keys [group_id user_id is_group_manager]} :- [:map
                                                   [:group_id         ms/PositiveInt]
                                                   [:user_id          ms/PositiveInt]
                                                   [:is_group_manager {:default false} [:maybe :boolean]]]]
  (let [is_group_manager (boolean is_group_manager)]
    (validation/check-manager-of-group group_id)
    (when is_group_manager
      ;; enable `is_group_manager` require advanced-permissions enabled
      (validation/check-advanced-permissions-enabled :group-manager)
      (api/check
       (t2/exists? :model/User :id user_id :is_superuser false)
       [400 (tru "Admin cant be a group manager.")]))
    (perms/add-user-to-group! user_id group_id is_group_manager)
    ;; TODO - it's a bit silly to return the entire list of members for the group, just return the newly created one and
    ;; let the frontend add it as appropriate
    (:members (t2/hydrate (t2/instance :model/PermissionsGroup {:id group_id})
                          :members))))

(api.macros/defendpoint :put "/membership/:id"
  "Update a Permission Group membership. Returns the updated record."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [is_group_manager]} :- [:map
                                  [:is_group_manager :boolean]]]
  ;; currently this API is only used to update the `is_group_manager` flag and it requires advanced-permissions
  (validation/check-advanced-permissions-enabled :group-manager)
  ;; Make sure only Super user or Group Managers can call this
  (validation/check-group-manager)
  (let [old (t2/select-one :model/PermissionsGroupMembership :id id)]
    (api/check-404 old)
    (validation/check-manager-of-group (:group_id old))
    (api/check
     (t2/exists? :model/User :id (:user_id old) :is_superuser false)
     [400 (tru "Admin cant be a group manager.")])
    (t2/update! :model/PermissionsGroupMembership (:id old)
                {:is_group_manager is_group_manager})
    (t2/select-one :model/PermissionsGroupMembership :id (:id old))))

(api.macros/defendpoint :put "/membership/:group-id/clear"
  "Remove all members from a `PermissionsGroup`. Returns a 400 (Bad Request) if the group ID is for the admin group."
  [{:keys [group-id]} :- [:map
                          [:group-id ms/PositiveInt]]]
  (validation/check-manager-of-group group-id)
  (api/check-404 (t2/exists? :model/PermissionsGroup :id group-id))
  (api/check-400 (not= group-id (u/the-id (perms-group/admin))))
  (t2/delete! :model/PermissionsGroupMembership :group_id group-id)
  api/generic-204-no-content)

(api.macros/defendpoint :delete "/membership/:id"
  "Remove a User from a PermissionsGroup (delete their membership)."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [membership (t2/select-one :model/PermissionsGroupMembership :id id)]
    (api/check-404 membership)
    (validation/check-manager-of-group (:group_id membership))
    (t2/delete! :model/PermissionsGroupMembership :id id)
    api/generic-204-no-content))
