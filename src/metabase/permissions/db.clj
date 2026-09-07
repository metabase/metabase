(ns metabase.permissions.db
  "Application database queries for the permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

;;; --------------------------------------------- DataPermissions ---------------------------------------------

(defn- perm-rows-query-base
  "The FROM/JOIN/WHERE shared by every rank-rows query below: one user's groups' rows for every permission type,
  excluding rows for deactivated tables. `db-ids` of nil means every database."
  [user-id db-ids]
  ^:allow-subquery {:from [[(t2/table-name :model/PermissionsGroupMembership) :pgm]]
                    :join [[(t2/table-name :model/PermissionsGroup) :pg] [:= :pg.id :pgm.group_id]
                           [(t2/table-name :model/DataPermissions) :p] [:= :p.group_id :pg.id]]
                    :left-join [[(t2/table-name :model/Table) :mt] [:= :mt.id :p.table_id]]
                    :where [:and
                            [:= :pgm.user_id user-id]
                            (when (seq db-ids)
                              [:in :p.db_id db-ids])
                            [:or
                             [:= :p.table_id nil]
                             [:= :mt.active true]]]})

(def ^:private value-rank-case
  "A HoneySQL CASE expression mapping a data_permissions row's (perm_type, perm_value) to the value's rank in its
  permission type's ordering — 0 = most permissive. MIN/MAX aggregates of this rank are what let SQL collapse
  groups, tables and duplicate values."
  (into [:case]
        cat
        (for [[perm-type {:keys [values]}] permissions.schema/data-permissions
              [i v] (map-indexed vector values)]
          [[:and
            [:= :p.perm_type (u/qualified-name perm-type)]
            [:= :p.perm_value (u/qualified-name v)]]
           [:inline i]])))

(def ^:private db-row-rank-case
  "[[value-rank-case]] but only for database-level rows — NULL for rows that name a table, so MIN/MAX ignore them."
  [:case [:= :p.table_id nil] value-rank-case :else nil])

(def ^:private table-level-case
  "0 for a database-level row, 1 for a table-level row."
  [:case [:= :p.table_id nil] [:inline 0] :else [:inline 1]])

(defn database-permission-rank-rows
  "For each `(perm-type, db-id)` of the DataPermissions rows of the User with `user-id`'s groups (narrowed to
  `db-ids`, or every database when nil), the `[min max]` value rank pairs needed to reconstruct the `:database`,
  `:every-table`, and `:any-table` whole-database permission values."
  [user-id db-ids]
  (let [per-group (-> (perm-rows-query-base user-id db-ids)
                      (assoc :select   [:p.perm_type :p.db_id :p.group_id
                                        [[:min value-rank-case] :gmin]
                                        [[:max value-rank-case] :gmax]
                                        [[:min db-row-rank-case] :dbmin]
                                        [[:max db-row-rank-case] :dbmax]]
                             :group-by [:p.perm_type :p.db_id :p.group_id]))]
    (t2/query {:select   [:i.perm_type :i.db_id
                          [[:min :i.gmin] :any_mn]   [[:max :i.gmax] :any_mx]
                          [[:min :i.gmax] :every_mn] [[:max :i.gmax] :every_mx]
                          [[:min :i.dbmin] :db_mn]   [[:max :i.dbmax] :db_mx]]
               :from     [[per-group :i]]
               :group-by [:i.perm_type :i.db_id]})))

(defn schema-permission-rank-rows
  "For each `(perm-type, db-id, schema-name, table-level)` of the DataPermissions rows of the User with `user-id`'s
  groups (narrowed to `db-ids`, or every database when nil), the `[min max]` value rank pair."
  [user-id db-ids]
  (t2/query (assoc (perm-rows-query-base user-id db-ids)
                   :select   [:p.perm_type :p.db_id :p.schema_name
                              [table-level-case :table_level]
                              [[:min value-rank-case] :mn]
                              [[:max value-rank-case] :mx]]
                   :group-by [:p.perm_type :p.db_id :p.schema_name table-level-case])))

(defn table-permission-rank-rows
  "For each `(perm-type, db-id, table-id)` of the table-granular DataPermissions rows of the User with `user-id`'s
  groups, the `[min max]` value rank pair. Scoped to `table-ids` when given (ignoring `db-ids`), otherwise to
  `db-ids` (or every database when both are nil)."
  [user-id db-ids table-ids]
  (t2/query (-> (perm-rows-query-base user-id (when-not (seq table-ids) db-ids))
                (assoc :select   [:p.perm_type :p.db_id :p.table_id
                                  [[:min value-rank-case] :mn]
                                  [[:max value-rank-case] :mx]]
                       :group-by [:p.perm_type :p.db_id :p.table_id])
                (update :where conj [:not= :p.table_id nil])
                (cond-> (seq table-ids) (update :where conj [:in :p.table_id table-ids])))))

(defn schema-permission-rank-pair
  "The `[min max]` value rank pair summarizing the DataPermissions rows of the User with `user-id`'s groups for
  `perm-type` on the Database with `database-id`, restricted to rows naming the schema `schema-name` or no schema at
  all (database-level rows), or nil when there are no matching rows."
  [user-id perm-type database-id schema-name]
  (let [per-group (-> (perm-rows-query-base user-id [database-id])
                      (assoc :select   [:p.group_id [[:max value-rank-case] :gmax]]
                             :group-by [:p.group_id])
                      (update :where conj [:= :p.perm_type (u/qualified-name perm-type)])
                      (update :where conj [:or
                                           [:= :p.table_id nil]
                                           [:= :p.schema_name schema-name]]))]
    (first (t2/query {:select [[[:min :i.gmax] :mn] [[:max :i.gmax] :mx]]
                      :from   [[per-group :i]]}))))

(defn table-permission-values-for-groups
  "The set of `perm-type` values `group-ids` hold for the Table with `table-id` or for its whole Database."
  [group-ids perm-type database-id table-id]
  (t2/select-fn-set :value :model/DataPermissions
                    {:select [[:p.perm_value :value]]
                     :from   [[:data_permissions :p]]
                     :where  [:and
                              [:in :p.group_id group-ids]
                              [:= :p.perm_type perm-type]
                              [:= :p.db_id database-id]
                              [:or
                               [:= :table_id table-id]
                               [:= :table_id nil]]]}))

(defn user-data-permissions
  "The permission type, group, value, database, and table of every DataPermissions row of the groups the User with
  `user-id` belongs to, optionally narrowed to `database-id` and/or `perm-type`."
  [user-id database-id perm-type]
  (t2/select :model/DataPermissions
             {:select [[:p.perm_type :perm-type]
                       [:p.group_id :group-id]
                       [:p.perm_value :value]
                       [:p.db_id :db-id]
                       [:p.table_id :table-id]]
              :from   [[:permissions_group_membership :pgm]]
              :join   [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                       [:data_permissions :p]   [:= :p.group_id :pg.id]]
              :where  [:and
                       [:= :pgm.user_id user-id]
                       (when database-id [:= :db_id database-id])
                       (when perm-type [:= :perm_type (u/qualified-name perm-type)])]}))

(defn data-permissions-for-groups-and-databases
  "The DataPermissions of `group-ids` on the Databases with `database-ids`."
  [group-ids database-ids]
  (t2/select :model/DataPermissions :group_id [:in group-ids] :db_id [:in database-ids]))

(defn database-level-permission
  "The database-level `perm-type` DataPermissions row of the group with `group-id` on the Database with
  `database-id`, or nil."
  [perm-type group-id database-id]
  (t2/select-one :model/DataPermissions
                 {:where [:and
                          [:= :perm_type perm-type]
                          [:= :group_id  group-id]
                          [:= :db_id     database-id]
                          [:= :table_id  nil]]}))

(defn database-level-permissions
  "The database-level DataPermissions rows of `perm-types` for `group-ids` on the Database with `database-id`."
  [database-id group-ids perm-types]
  (t2/select :model/DataPermissions
             {:where [:and [:= :db_id database-id] [:= :table_id nil]
                      [:in :group_id group-ids] [:in :perm_type perm-types]]}))

(defn distinct-table-level-permission-values
  "The distinct group, permission type, schema, and value combinations of the table-level DataPermissions rows of
  `perm-types` for `group-ids` on the Database with `database-id`."
  [database-id group-ids perm-types]
  (t2/select :model/DataPermissions
             {:select-distinct [:group_id :perm_type :schema_name :perm_value]
              :where           [:and [:= :db_id database-id] [:not= :table_id nil]
                                [:in :group_id group-ids] [:in :perm_type perm-types]]}))

(defn distinct-database-permission-values-for-group
  "The distinct database, permission type, and value combinations of the DataPermissions rows of the group with
  `group-id`."
  [group-id]
  (t2/select :model/DataPermissions
             {:select-distinct [:db_id :perm_type :perm_value]
              :where           [:= :group_id group-id]}))

(defn other-table-permission-values
  "The distinct `perm-type` values of the group with `group-id` on tables of the Database with `database-id` other
  than `table-ids`."
  [group-id database-id perm-type table-ids]
  (t2/query {:select-distinct [:perm_value]
             :from            [(t2/table-name :model/DataPermissions)]
             :where           [:and
                               [:= :group_id group-id]
                               [:= :db_id database-id]
                               [:= :perm_type perm-type]
                               [:not= :table_id nil]
                               [:not [:in :table_id table-ids]]]}))

(defn table-permission-ids
  "The IDs of the `perm-type` DataPermissions rows of the group with `group-id` on the Tables with `table-ids`."
  [perm-type group-id table-ids]
  (t2/select [:model/DataPermissions :id]
             {:where [:and
                      [:= :perm_type perm-type]
                      [:= :group_id group-id]
                      [:in :table_id table-ids]]}))

(defn non-audit-permission-values-for-groups
  "The distinct group, permission type, and value combinations of the DataPermissions rows of `group-ids` for
  `perm-types`, excluding rows on the audit Database."
  [group-ids perm-types]
  (t2/query {:select-distinct [:group_id :perm_type :perm_value]
             :from            [[(t2/table-name :model/DataPermissions)]]
             :where           [:and
                               [:in :group_id group-ids]
                               [:in :perm_type perm-types]
                               [:not [:exists ^:allow-subquery {:select [1]
                                                                :from   [[(t2/table-name :model/Database) :audit_db]]
                                                                :where  [:and
                                                                         [:= :audit_db.is_audit true]
                                                                         [:= :audit_db.id :data_permissions.db_id]]}]]]}))

(defn insert-data-permissions!
  "Insert the DataPermissions `rows`."
  [rows]
  (t2/insert! :model/DataPermissions rows))

(defn delete-data-permissions!
  "Delete the DataPermissions with `ids`."
  [ids]
  (t2/delete! :model/DataPermissions :id [:in ids]))

;;; ----------------------------------------------- Permissions -----------------------------------------------

(defn group-ids-with-permission-objects
  "The set of group IDs holding a Permissions row for one of `objects`."
  [objects]
  (t2/select-fn-set :group_id :model/Permissions {:where [:in :object objects]}))

(defn- related-permission-objects-where
  [group-id path also-under-paths]
  [:and
   [:= :group_id group-id]
   (into [:or [:like path (h2x/concat :object (h2x/literal "%"))]]
         (map (fn [path-form] [:like :object (str path-form "%")]))
         also-under-paths)])

(defn related-permission-objects
  "The Permissions objects held by the group with `group-id` that are ancestors or descendants of `path` (also
  checking each of `also-under-paths`, e.g. a v2-equivalent path)."
  [group-id path also-under-paths]
  (t2/select-fn-set :object :model/Permissions
                    {:where (related-permission-objects-where group-id path also-under-paths)}))

(defn delete-related-permissions!
  "Delete the Permissions rows held by the group with `group-id` that are ancestors or descendants of `path` (also
  checking each of `also-under-paths`, e.g. a v2-equivalent path)."
  [group-id path also-under-paths]
  (t2/delete! :model/Permissions
              {:where (related-permission-objects-where group-id path also-under-paths)}))

(defn insert-permissions!
  "Insert the Permissions `rows`."
  [rows]
  (t2/insert! :model/Permissions rows))

;;; --------------------------------------------- PermissionsGroup ---------------------------------------------

(defn magic-group
  "The ID, name, and type of the magic PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type]
  (t2/select-one [:model/PermissionsGroup :id :name :magic_group_type] :magic_group_type magic-group-type))

(defn group-by-magic-type
  "The PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type]
  (t2/select-one :model/PermissionsGroup :magic_group_type magic-group-type))

(defn group-id-by-magic-type
  "The ID of the PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type]
  (t2/select-one-pk :model/PermissionsGroup :magic_group_type magic-group-type))

(defn group-exists-with-lower-name?
  "Whether a PermissionsGroup whose lower-cased name is `lower-name` exists."
  [lower-name]
  (t2/exists? :model/PermissionsGroup :%lower.name lower-name))

(defn groups-except-magic-type
  "The PermissionsGroups other than the magic group of `magic-group-type`."
  [magic-group-type]
  (t2/select :model/PermissionsGroup :magic_group_type [:not= magic-group-type]))

(defn non-magic-groups
  "The PermissionsGroups that are not magic groups."
  []
  (t2/select :model/PermissionsGroup {:where [:= :magic_group_type nil]}))

(defn tenant-group?
  "Whether the PermissionsGroup with `group-id` is a tenant group."
  [group-id]
  (t2/select-one-fn :is_tenant_group :model/PermissionsGroup :id group-id))

(defn tenant-group-ids
  "The IDs of every tenant PermissionsGroup."
  []
  (t2/select-pks-set :model/PermissionsGroup :is_tenant_group true))

(defn group-tenant-flags
  "A map of group ID to `:is_tenant_group` for `group-ids`."
  [group-ids]
  (t2/select-pk->fn :is_tenant_group [:model/PermissionsGroup :id :is_tenant_group] :id [:in group-ids]))

(defn group-names-like
  "The set of PermissionsGroup names matching the SQL `pattern`."
  [pattern]
  (t2/select-fn-set :name :model/PermissionsGroup :name [:like pattern]))

(defn group-members
  "The active Users in the PermissionsGroups with `group-ids`, with the optional extra `group-manager-column`."
  [group-ids group-manager-column]
  (t2/select :model/User {:select    [:u.id
                                      [:u.id :user_id]
                                      :u.first_name
                                      :u.last_name
                                      :u.email
                                      :u.is_superuser
                                      :u.type
                                      :pgm.group_id
                                      [:pgm.id :membership_id]
                                      group-manager-column]
                          :from      [[:core_user :u]]
                          :left-join [[:permissions_group_membership :pgm] [:= :u.id :pgm.user_id]]
                          :where     [:and
                                      [:= :u.is_active true]
                                      [:in :pgm.group_id group-ids]]
                          :order-by  [[[:lower :u.first_name] :asc]
                                      [[:lower :u.last_name] :asc]]}))

(defn insert-group!
  "Insert `group` and return the new instance."
  [group]
  (t2/insert-returning-instance! :model/PermissionsGroup group))

(defn update-group!
  "Apply `changes` to the PermissionsGroup with `group-id`."
  [group-id changes]
  (t2/update! :model/PermissionsGroup group-id changes))

;;; ---------------------------------------- PermissionsGroupMembership ----------------------------------------

(defn- insert-group-memberships-from-mapping-query
  [user-id-group-id->is-group-manager?]
  {:insert-into [[:permissions_group_membership [:group_id :user_id :is_group_manager]]
                 ^:allow-subquery
                 {:select [:g.id :u.id [(into [:case]
                                              (mapcat (fn [[[user-id group-id] is-group-manager?]]
                                                        [[[:and
                                                           [:= :u.id user-id]
                                                           [:= :g.id group-id]]]
                                                         is-group-manager?])
                                                      user-id-group-id->is-group-manager?))]]
                  :from [[:permissions_group :g]]
                  :join [[:core_user :u] (into [:or]
                                               (for [[[user-id group-id] _] user-id-group-id->is-group-manager?]
                                                 [:and
                                                  [:= :u.id user-id]
                                                  [:= :g.id group-id]
                                                  [:=
                                                   :g.is_tenant_group
                                                   [:not= :u.tenant_id nil]]]))]}]})

(defn insert-group-memberships-from-mapping!
  "Insert a PermissionsGroupMembership (with `is_group_manager`) for each `[user-id group-id]` pair in
  `user-id-group-id->is-group-manager?`, matching Users to Groups on tenant status; returns the number of rows
  inserted."
  [user-id-group-id->is-group-manager?]
  (t2/query-one (insert-group-memberships-from-mapping-query user-id-group-id->is-group-manager?)))

(defn group-membership-count
  "The number of memberships of the PermissionsGroup with `group-id`."
  [group-id]
  (t2/count :model/PermissionsGroupMembership :group_id group-id))

(defn other-active-member-count
  "The number of active Users other than `user-id` in the PermissionsGroup with `group-id`."
  [group-id user-id]
  (t2/count :model/PermissionsGroupMembership
            {:join  [[:core_user :user] [:= :user.id :user_id]]
             :where [:and
                     [:= :group_id group-id]
                     [:= :user.is_active true]
                     [:not= :user.id user-id]]}))

(defn memberships-for-user
  "The PermissionsGroupMemberships of the User with `user-id`."
  [user-id]
  (t2/select :model/PermissionsGroupMembership :user_id user-id))

(defn memberships-for-user-in-groups
  "The PermissionsGroupMemberships of the User with `user-id` in the groups with `group-ids`."
  [user-id group-ids]
  (t2/select :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids]))

(defn memberships-for-group
  "The PermissionsGroupMemberships of the PermissionsGroup with `group-id`."
  [group-id]
  (t2/select :model/PermissionsGroupMembership :group_id group-id))

(defn delete-memberships-for-user!
  "Delete the PermissionsGroupMemberships of the User with `user-id`."
  [user-id]
  (t2/delete! :model/PermissionsGroupMembership :user_id user-id))

(defn delete-memberships-for-user-in-groups!
  "Delete the PermissionsGroupMemberships of the User with `user-id` in the groups with `group-ids`."
  [user-id group-ids]
  (t2/delete! :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids]))

(defn delete-memberships-for-group!
  "Delete the PermissionsGroupMemberships of the PermissionsGroup with `group-id`."
  [group-id]
  (t2/delete! :model/PermissionsGroupMembership :group_id group-id))

;;; ------------------------------------------------ Revisions ------------------------------------------------

(defn latest-permissions-revision-id
  "The highest ID of any PermissionsRevision, or nil."
  []
  (:id (t2/select-one [:model/PermissionsRevision [:%max.id :id]])))

(defn latest-collection-permission-graph-revision-id
  "The highest ID of any CollectionPermissionGraphRevision, or nil."
  []
  (:id (t2/select-one [:model/CollectionPermissionGraphRevision [:%max.id :id]])))

(defn latest-application-permissions-revision-id
  "The highest ID of any ApplicationPermissionsRevision, or nil."
  []
  (:id (t2/select-one [:model/ApplicationPermissionsRevision [:%max.id :id]])))

(defn insert-collection-permission-graph-revision!
  "Insert `revision` into CollectionPermissionGraphRevision."
  [revision]
  (t2/insert! :model/CollectionPermissionGraphRevision revision))

(defn insert-collection-permission-graph-revision-returning-instance!
  "Insert `revision` into CollectionPermissionGraphRevision and return the new instance."
  [revision]
  (first (t2/insert-returning-instances! :model/CollectionPermissionGraphRevision revision)))

(defn insert-permissions-revision-returning-instance!
  "Insert `revision` into PermissionsRevision and return the new instance."
  [revision]
  (first (t2/insert-returning-instances! :model/PermissionsRevision revision)))

(defn insert-application-permissions-revision-returning-instance!
  "Insert `revision` into ApplicationPermissionsRevision and return the new instance."
  [revision]
  (first (t2/insert-returning-instances! :model/ApplicationPermissionsRevision revision)))

(defn update-collection-graph-revision!
  "Apply `changes` to the CollectionPermissionGraphRevision with `revision-id`."
  [revision-id changes]
  (t2/update! :model/CollectionPermissionGraphRevision revision-id changes))

;;; ----------------------------------------------- Collections -----------------------------------------------

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn personal-or-descendant-collection-ids
  "The IDs among `collection-ids` that are personal Collections, or descendants of one."
  [collection-ids]
  (t2/select-pks-set :model/Collection
                     {:where [:and
                              [:in :id collection-ids]
                              [:or [:not= :personal_owner_id nil]
                               [:exists ^:allow-subquery
                                {:select [1]
                                 :from   [[:collection :pc]]
                                 :where  [:and
                                          [:not= :pc.personal_owner_id nil]
                                          [:like :collection.location
                                           [:concat "/" :pc.id "/%"]]]}]]]}))

(defn collection-ids-in-other-namespace
  "The IDs among `collection-ids` that do not belong to `namespace` (nil meaning the default namespace)."
  [collection-ids namespace]
  (t2/select-pks-set :model/Collection
                     {:where [:and [:in :id collection-ids]
                              (cond->> [[:not= :namespace (some-> namespace name)]]
                                (nil? namespace)  (into [:and [:not= :namespace "analytics"]])
                                (some? namespace) (into [:or [:= :namespace nil]]))]}))

(defn library-collection-ids
  "The IDs of the library Collections."
  []
  (t2/select-pks-set :model/Collection :type [:in ["library" "library-data" "library-metrics"]]))

(defn namespace-clause
  "Honey SQL clause to filter `namespace-keyword` by `namespace-val`, also matching the audit-app and tenant
  namespaces when applicable."
  [namespace-keyword namespace-val & [include-tenant-namespaces?]]
  [:or
   [:= namespace-keyword namespace-val]
   (when (and (nil? namespace-val)
              (premium-features/enable-audit-app?))
     [:= namespace-keyword "analytics"])
   (when (and include-tenant-namespaces? (nil? namespace-val) (setting/get :use-tenants))
     [:= namespace-keyword "shared-tenant-collection"])
   (when (and include-tenant-namespaces? (nil? namespace-val) (setting/get :use-tenants))
     [:= namespace-keyword "tenant-specific"])])

(defn collection-graph-rows
  "Reducible group/collection/writable/readable rows of the collection permissions graph for `collection-namespace`,
  restricted to `ids-without-root` (or every Collection when empty) and `group-ids` (or every group when empty).
  `include-root?` controls whether the root-collection rows are included; `admin-group-id` is the id of the
  Administrators group, which implicitly has write access to every Collection."
  [collection-namespace include-root? root-object ids-without-root group-ids admin-group-id]
  (t2/reducible-query
   {:with [[:eligible_collections
            ^:allow-subquery
            {:select [:id]
             :from   [:collection]
             :where  [:and
                      [:or [:= :type nil] [:not= :type "trash"]]
                      (namespace-clause :namespace (u/qualified-name collection-namespace))
                      [:not :archived]
                      [:= :personal_owner_id nil]
                      (when (seq ids-without-root)
                        [:in :id ids-without-root])
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from   [[:collection :pc]]
                              :where  [:and
                                       [:not= :pc.personal_owner_id nil]
                                       [:like :collection.location
                                        [:concat "/" :pc.id "/%"]]]}]]]}]
           [:relevant_permissions
            ^:allow-subquery
            {:select [:group_id :collection_id :perm_value]
             :from   [:permissions]
             :where  (into [:and
                            [:= :perm_type "perms/collection-access"]
                            [:not= :collection_id nil]]
                           (when (seq group-ids)
                             [[:in :group_id group-ids]]))}]]
    :union-all
    [;; Query 1: Root collection permissions, exclude this query if collection-ids are supplied
     ;; and :root is not present in that collection
     ^:allow-subquery
     {:select   [[:pg.id :group_id]
                 [nil :collection_id]
                 [[:max [:case [:= :p.object root-object]
                         [:inline 1]
                         :else [:inline 0]]] :writable]
                 [[:max [:case [:= :p.object (str root-object "read/")]
                         [:inline 1]
                         :else [:inline 0]]] :readable]]
      :from     [[:permissions_group :pg]]
      :join     [[:permissions :p] [:and
                                    [:= :p.group_id :pg.id]
                                    [:or [:= :p.object root-object]
                                     [:= :p.object (str root-object "read/")]]]]
      :where    (into [:and [:inline include-root?]]
                      (when (seq group-ids)
                        [[:in :pg.id group-ids]]))
      :group-by [:pg.id]}
     ;; Query 2: Regular collection permissions
     ^:allow-subquery
     {:select   [[:pg.id :group_id]
                 [:c.id :collection_id]
                 [[:max [:case [:= :p.perm_value "read-and-write"]
                         [:inline 1]
                         :else [:inline 0]]] :writable]
                 [[:max [:case [:or [:= :p.perm_value "read-and-write"]
                                [:= :p.perm_value "read"]]
                         [:inline 1]
                         :else [:inline 0]]] :readable]]
      :from     [[:permissions_group :pg]]
      :join     [[:relevant_permissions :p] [:= :p.group_id :pg.id]
                 [:eligible_collections :c] [:= :p.collection_id :c.id]]
      :where    [:not= :c.id nil]
      :group-by [:pg.id :c.id]}
     ;; Query 3: The Administrators group has write access to all collections
     ;; but does not have any explicit permissions.
     ^:allow-subquery
     {:select [[admin-group-id :group_id]
               [:c.id :collection_id]
               [[:inline 1] :writable]
               [[:inline 1] :readable]]
      :from   [[:eligible_collections :c]]}]}))

;;; ------------------------------------------------- Users -------------------------------------------------

(defn user-superuser?
  "Whether the User with `user-id` is a superuser."
  [user-id]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(defn user-data-analyst?
  "Whether the User with `user-id` is a data analyst."
  [user-id]
  (t2/select-one-fn :is_data_analyst :model/User :id user-id))

(defn user-tenant-ids
  "A map of User ID to `:tenant_id` for `user-ids`."
  [user-ids]
  (t2/select-pk->fn :tenant_id [:model/User :id :tenant_id] :id [:in user-ids]))

(defn earliest-user-join-date
  "The earliest `date_joined` of any User, or nil."
  []
  (:min (t2/select-one [:model/User [:%min.date_joined :min]])))

(defn update-user!
  "Apply `changes` to the User with `user-id`."
  [user-id changes]
  (t2/update! :model/User user-id changes))

(defn update-users!
  "Apply `changes` to the Users with `user-ids`."
  [user-ids changes]
  (t2/update! :model/User :id [:in user-ids] changes))

(defn clear-data-analyst-flags!
  "Unset `is_data_analyst` on every User that has it set."
  []
  (t2/update! :model/User {:is_data_analyst true} {:is_data_analyst false}))

(defn deactivate-active-tenant-users!
  "Deactivate every active tenant User, marking them as deactivated with their tenant."
  []
  (t2/update! :model/User :tenant_id [:not= nil] :is_active true {:is_active false :deactivated_with_tenant true}))

(defn deactivate-all-tenants!
  "Mark every tenant row inactive."
  []
  (t2/query {:update :tenant
             :set    {:is_active false}}))

;;; --------------------------------------------- Databases and Tables ---------------------------------------------

(defn non-destination-database-ids
  "The IDs of the Databases that are not routing destinations."
  []
  (t2/select-pks-vec :model/Database :router_database_id nil))

(defn destination-database?
  "Whether the Database with `database-id` is a routing destination."
  [database-id]
  (t2/exists? :model/Database :id database-id :router_database_id [:not= nil]))

(defn table-location
  "The ID, Database ID, and schema of the Table with `table-id`."
  [table-id]
  (t2/select-one [:model/Table :id :db_id :schema] :id table-id))

(defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id]
  (t2/select-one-fn :db_id :model/Table table-id))

(defn table-database-ids
  "The ID and Database ID of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids]))

(defn active-table-locations-for-database
  "The ID, Database ID, and schema of the active Tables of the Database with `database-id`."
  [database-id]
  (t2/select [:model/Table :id :db_id :schema] :db_id database-id :active true))

(defn table-ids-and-schemas-excluding
  "The ID and schema of the Tables of the Database with `database-id` other than `excluded-table-ids`."
  [database-id excluded-table-ids]
  (t2/select [:model/Table :id :schema]
             {:where [:and
                      [:= :db_id database-id]
                      [:not [:in :id excluded-table-ids]]]}))

(defn field-visibility-info
  "The ID, visibility type, and Table ID of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :visibility_type :table_id] :id [:in field-ids]))

(defn instance-by-id
  "The instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one model :id id))
