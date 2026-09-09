(ns metabase.permissions.db
  "Application database queries for the permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
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

(def ^:private DatabasePermissionRank
  "Rows returned by [[database-permission-rank-rows]]."
  [:map {:closed true}
   [:perm_type [:maybe [:or :keyword :string]]]
   [:db_id     [:maybe ::lib.schema.id/database]]
   [:any_mn    [:maybe :int]]
   [:any_mx    [:maybe :int]]
   [:every_mn  [:maybe :int]]
   [:every_mx  [:maybe :int]]
   [:db_mn     [:maybe :int]]
   [:db_mx     [:maybe :int]]])

(mu/defn database-permission-rank-rows :- [:sequential DatabasePermissionRank]
  "For each `(perm-type, db-id)` of the DataPermissions rows of the User with `user-id`'s groups (narrowed to
  `db-ids`, or every database when nil), the `[min max]` value rank pairs needed to reconstruct the `:database`,
  `:every-table`, and `:any-table` whole-database permission values."
  [user-id :- [:maybe ::lib.schema.id/user]
   db-ids  :- [:maybe [:or [:set ::lib.schema.id/database] [:sequential ::lib.schema.id/database]]]]
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

(mu/defn schema-permission-rank-rows :- [:sequential :map]
  "For each `(perm-type, db-id, schema-name, table-level)` of the DataPermissions rows of the User with `user-id`'s
  groups (narrowed to `db-ids`, or every database when nil), the `[min max]` value rank pair."
  [user-id :- ::lib.schema.id/user
   db-ids  :- [:maybe [:sequential ::lib.schema.id/database]]]
  (t2/query (assoc (perm-rows-query-base user-id db-ids)
                   :select   [:p.perm_type :p.db_id :p.schema_name
                              [table-level-case :table_level]
                              [[:min value-rank-case] :mn]
                              [[:max value-rank-case] :mx]]
                   :group-by [:p.perm_type :p.db_id :p.schema_name table-level-case])))

(def ^:private TablePermissionRank
  "Rows returned by [[table-permission-rank-rows]]."
  [:map {:closed true}
   [:perm_type [:maybe [:or :keyword :string]]]
   [:db_id     [:maybe ::lib.schema.id/database]]
   [:table_id  [:maybe ::lib.schema.id/table]]
   [:mn        [:maybe :int]]
   [:mx        [:maybe :int]]])

(mu/defn table-permission-rank-rows :- [:sequential TablePermissionRank]
  "For each `(perm-type, db-id, table-id)` of the table-granular DataPermissions rows of the User with `user-id`'s
  groups, the `[min max]` value rank pair. Scoped to `table-ids` when given (ignoring `db-ids`), otherwise to
  `db-ids` (or every database when both are nil)."
  [user-id   :- [:maybe ::lib.schema.id/user]
   db-ids    :- [:maybe [:set ::lib.schema.id/database]]
   table-ids :- [:maybe [:set ms/IntGreaterThanOrEqualToZero]]]
  (t2/query (-> (perm-rows-query-base user-id (when-not (seq table-ids) db-ids))
                (assoc :select   [:p.perm_type :p.db_id :p.table_id
                                  [[:min value-rank-case] :mn]
                                  [[:max value-rank-case] :mx]]
                       :group-by [:p.perm_type :p.db_id :p.table_id])
                (update :where conj [:not= :p.table_id nil])
                (cond-> (seq table-ids) (update :where conj [:in :p.table_id table-ids])))))

(mu/defn schema-permission-rank-pair :- [:maybe [:map {:closed true} [:mn [:maybe :int]] [:mx [:maybe :int]]]]
  "The `[min max]` value rank pair summarizing the DataPermissions rows of the User with `user-id`'s groups for
  `perm-type` on the Database with `database-id`, restricted to rows naming the schema `schema-name` or no schema at
  all (database-level rows), or nil when there are no matching rows."
  [user-id     :- ::lib.schema.id/user
   perm-type   :- [:or :keyword :string]
   database-id :- ::lib.schema.id/database
   schema-name :- [:maybe :string]]
  (let [per-group (-> (perm-rows-query-base user-id [database-id])
                      (assoc :select   [:p.group_id [[:max value-rank-case] :gmax]]
                             :group-by [:p.group_id])
                      (update :where conj [:= :p.perm_type (u/qualified-name perm-type)])
                      (update :where conj [:or
                                           [:= :p.table_id nil]
                                           [:= :p.schema_name schema-name]]))]
    (first (t2/query {:select [[[:min :i.gmax] :mn] [[:max :i.gmax] :mx]]
                      :from   [[per-group :i]]}))))

(mu/defn table-permission-values-for-groups :- [:maybe [:set [:or :keyword :string]]]
  "The set of `perm-type` values `group-ids` hold for the Table with `table-id` or for its whole Database."
  [group-ids   :- [:set ms/PositiveInt]
   perm-type   :- [:or :keyword :string]
   database-id :- ::lib.schema.id/database
   table-id    :- ms/IntGreaterThanOrEqualToZero]
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

(def ^:private UserDataPermission
  "Rows returned by [[user-data-permissions]]."
  [:map {:closed true}
   [:perm-type [:or :keyword :string]]
   [:group-id  ms/PositiveInt]
   [:value     [:maybe [:or :keyword :string]]]
   [:db-id     [:maybe ::lib.schema.id/database]]
   [:table-id  [:maybe ::lib.schema.id/table]]])

(mu/defn user-data-permissions :- [:sequential UserDataPermission]
  "The permission type, group, value, database, and table of every DataPermissions row of the groups the User with
  `user-id` belongs to, optionally narrowed to `database-id` and/or `perm-type`."
  [user-id     :- ::lib.schema.id/user
   database-id :- [:maybe ::lib.schema.id/database]
   perm-type   :- [:maybe [:or :keyword :string]]]
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

(mu/defn data-permissions-for-groups-and-databases :- [:sequential ::permissions.schema/data-permissions]
  "The DataPermissions of `group-ids` on the Databases with `database-ids`."
  [group-ids    :- [:sequential ms/PositiveInt]
   database-ids :- [:or [:set ::lib.schema.id/database] [:sequential ::lib.schema.id/database]]]
  (t2/select :model/DataPermissions :group_id [:in group-ids] :db_id [:in database-ids]))

(mu/defn database-level-permission :- [:maybe ::permissions.schema/data-permissions]
  "The database-level `perm-type` DataPermissions row of the group with `group-id` on the Database with
  `database-id`, or nil."
  [perm-type   :- [:or :keyword :string]
   group-id    :- ms/PositiveInt
   database-id :- ::lib.schema.id/database]
  (t2/select-one :model/DataPermissions
                 {:where [:and
                          [:= :perm_type perm-type]
                          [:= :group_id  group-id]
                          [:= :db_id     database-id]
                          [:= :table_id  nil]]}))

(mu/defn database-level-permissions :- [:sequential ::permissions.schema/data-permissions]
  "The database-level DataPermissions rows of `perm-types` for `group-ids` on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   group-ids   :- [:sequential ms/PositiveInt]
   perm-types  :- [:sequential [:or :keyword :string]]]
  (t2/select :model/DataPermissions
             {:where [:and [:= :db_id database-id] [:= :table_id nil]
                      [:in :group_id group-ids] [:in :perm_type perm-types]]}))

(def ^:private DistinctTableLevelPermissionValue
  "Rows returned by [[distinct-table-level-permission-values]]."
  (mut/select-keys ::permissions.schema/data-permissions
                   [:group_id :perm_type :schema_name :perm_value]))

(mu/defn distinct-table-level-permission-values :- [:sequential DistinctTableLevelPermissionValue]
  "The distinct group, permission type, schema, and value combinations of the table-level DataPermissions rows of
  `perm-types` for `group-ids` on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   group-ids   :- [:sequential ms/PositiveInt]
   perm-types  :- [:sequential [:or :keyword :string]]]
  (t2/select :model/DataPermissions
             {:select-distinct [:group_id :perm_type :schema_name :perm_value]
              :where           [:and [:= :db_id database-id] [:not= :table_id nil]
                                [:in :group_id group-ids] [:in :perm_type perm-types]]}))

(def ^:private DistinctDatabasePermissionValuesForGroup
  "Rows returned by [[distinct-database-permission-values-for-group]]."
  (mut/select-keys ::permissions.schema/data-permissions [:db_id :perm_type :perm_value]))

(mu/defn distinct-database-permission-values-for-group :- [:sequential DistinctDatabasePermissionValuesForGroup]
  "The distinct database, permission type, and value combinations of the DataPermissions rows of the group with
  `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/select :model/DataPermissions
             {:select-distinct [:db_id :perm_type :perm_value]
              :where           [:= :group_id group-id]}))

(mu/defn other-table-permission-values :- [:sequential [:map {:closed true} [:perm_value [:maybe [:or :keyword :string]]]]]
  "The distinct `perm-type` values of the group with `group-id` on tables of the Database with `database-id` other
  than `table-ids`."
  [group-id    :- ms/PositiveInt
   database-id :- ::lib.schema.id/database
   perm-type   :- [:or :keyword :string]
   table-ids   :- [:set ms/IntGreaterThanOrEqualToZero]]
  (t2/query {:select-distinct [:perm_value]
             :from            [(t2/table-name :model/DataPermissions)]
             :where           [:and
                               [:= :group_id group-id]
                               [:= :db_id database-id]
                               [:= :perm_type perm-type]
                               [:not= :table_id nil]
                               [:not [:in :table_id table-ids]]]}))

(def ^:private TablePermissionId
  "Rows returned by [[table-permission-ids]]."
  (mut/select-keys ::permissions.schema/data-permissions [:id]))

(mu/defn table-permission-ids :- [:sequential TablePermissionId]
  "The IDs of the `perm-type` DataPermissions rows of the group with `group-id` on the Tables with `table-ids`."
  [perm-type :- [:or :keyword :string]
   group-id  :- ms/PositiveInt
   table-ids :- [:set ms/IntGreaterThanOrEqualToZero]]
  (t2/select [:model/DataPermissions :id]
             {:where [:and
                      [:= :perm_type perm-type]
                      [:= :group_id group-id]
                      [:in :table_id table-ids]]}))

(def ^:private NonAuditPermissionValuesForGroup
  "Rows returned by [[non-audit-permission-values-for-groups]]."
  [:map {:closed true}
   [:group_id ms/PositiveInt]
   [:perm_type [:maybe [:or :keyword :string]]]
   [:perm_value [:maybe [:or :keyword :string]]]])

(mu/defn non-audit-permission-values-for-groups :- [:sequential NonAuditPermissionValuesForGroup]
  "The distinct group, permission type, and value combinations of the DataPermissions rows of `group-ids` for
  `perm-types`, excluding rows on the audit Database."
  [group-ids  :- [:sequential ms/PositiveInt]
   perm-types :- [:sequential [:or :keyword :string]]]
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

(mu/defn insert-data-permissions! :- :int
  "Insert the DataPermissions `rows`."
  [rows :- [:sequential (mut/select-keys ::permissions.schema/data-permissions.update [:perm_type :group_id :perm_value :db_id :table_id :schema_name])]]
  (t2/insert! :model/DataPermissions rows))

(mu/defn delete-data-permissions! :- :int
  "Delete the DataPermissions with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/DataPermissions :id [:in ids]))

;;; ----------------------------------------------- Permissions -----------------------------------------------

(mu/defn group-ids-with-permission-objects :- [:maybe [:set ms/PositiveInt]]
  "The set of group IDs holding a Permissions row for one of `objects`."
  [objects :- [:sequential :string]]
  (t2/select-fn-set :group_id :model/Permissions {:where [:in :object objects]}))

(defn- related-permission-objects-where
  [group-id path also-under-paths]
  [:and
   [:= :group_id group-id]
   (into [:or [:like path (h2x/concat :object (h2x/literal "%"))]]
         (map (fn [path-form] [:like :object (str path-form "%")]))
         also-under-paths)])

(mu/defn related-permission-objects :- [:maybe [:set :string]]
  "The Permissions objects held by the group with `group-id` that are ancestors or descendants of `path` (also
  checking each of `also-under-paths`, e.g. a v2-equivalent path)."
  [group-id          :- ms/PositiveInt
   path              :- :string
   also-under-paths  :- [:sequential :string]]
  (t2/select-fn-set :object :model/Permissions
                    {:where (related-permission-objects-where group-id path also-under-paths)}))

(mu/defn delete-related-permissions! :- :int
  "Delete the Permissions rows held by the group with `group-id` that are ancestors or descendants of `path` (also
  checking each of `also-under-paths`, e.g. a v2-equivalent path)."
  [group-id          :- ms/PositiveInt
   path              :- :string
   also-under-paths  :- [:sequential :string]]
  (t2/delete! :model/Permissions
              {:where (related-permission-objects-where group-id path also-under-paths)}))

(mu/defn insert-permissions! :- :int
  "Insert the Permissions `rows`."
  [rows :- [:sequential (mut/select-keys ::permissions.schema/permissions.update [:group_id :object])]]
  (t2/insert! :model/Permissions rows))

(mu/defn permission-objects-for-user :- [:sequential :string]
  "The Permissions objects granted, via group membership, to the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (map :object (mdb/query {:select [:p.object]
                           :from   [[:permissions_group_membership :pgm]]
                           :join   [[:permissions_group :pg] [:= :pgm.group_id :pg.id]
                                    [:permissions :p]        [:= :p.group_id :pg.id]]
                           :where  [:= :pgm.user_id user-id]})))

;;; --------------------------------------------- PermissionsGroup ---------------------------------------------

(def ^:private MagicGroup
  "Rows returned by [[magic-group]]."
  (mut/select-keys ::permissions.schema/permissions-group [:id :name :magic_group_type]))

(mu/defn magic-group :- [:maybe MagicGroup]
  "The ID, name, and type of the magic PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type :- :string]
  (t2/select-one [:model/PermissionsGroup :id :name :magic_group_type] :magic_group_type magic-group-type))

(mu/defn group-by-magic-type :- [:maybe ::permissions.schema/permissions-group]
  "The PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type :- :string]
  (t2/select-one :model/PermissionsGroup :magic_group_type magic-group-type))

(mu/defn group-id-by-magic-type :- [:maybe ms/PositiveInt]
  "The ID of the PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type :- :string]
  (t2/select-one-pk :model/PermissionsGroup :magic_group_type magic-group-type))

(mu/defn group-exists-with-lower-name? :- :boolean
  "Whether a PermissionsGroup whose lower-cased name is `lower-name` exists."
  [lower-name :- :string]
  (t2/exists? :model/PermissionsGroup :%lower.name lower-name))

(mu/defn groups-except-magic-type :- [:sequential ::permissions.schema/permissions-group]
  "The PermissionsGroups other than the magic group of `magic-group-type`."
  [magic-group-type :- :string]
  (t2/select :model/PermissionsGroup :magic_group_type [:not= magic-group-type]))

(mu/defn non-magic-groups :- [:sequential ::permissions.schema/permissions-group]
  "The PermissionsGroups that are not magic groups."
  []
  (t2/select :model/PermissionsGroup {:where [:= :magic_group_type nil]}))

(mu/defn tenant-group? :- [:maybe :boolean]
  "Whether the PermissionsGroup with `group-id` is a tenant group."
  [group-id :- ms/PositiveInt]
  (t2/select-one-fn :is_tenant_group :model/PermissionsGroup :id group-id))

(mu/defn tenant-group-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of every tenant PermissionsGroup."
  []
  (t2/select-pks-set :model/PermissionsGroup :is_tenant_group true))

(mu/defn group-tenant-flags :- [:map-of ms/PositiveInt [:maybe :boolean]]
  "A map of group ID to `:is_tenant_group` for `group-ids`."
  [group-ids :- [:set ms/PositiveInt]]
  (t2/select-pk->fn :is_tenant_group [:model/PermissionsGroup :id :is_tenant_group] :id [:in group-ids]))

(mu/defn group-names-like :- [:maybe [:set :string]]
  "The set of PermissionsGroup names matching the SQL `pattern`."
  [pattern :- :string]
  (t2/select-fn-set :name :model/PermissionsGroup :name [:like pattern]))

(def ^:private GroupMember
  "Rows returned by [[group-members]]."
  (mut/merge (mut/select-keys ::users.schema/user.full [:id :first_name :last_name :email :is_superuser :type :common_name])
             [:map
              [:user_id          ::lib.schema.id/user]
              [:group_id         ms/PositiveInt]
              [:membership_id    ms/PositiveInt]
              [:is_group_manager {:optional true} [:maybe :boolean]]]))

(mu/defn group-members :- [:sequential GroupMember]
  "The active Users in the PermissionsGroups with `group-ids`, with the optional extra `group-manager-column`."
  [group-ids            :- [:sequential ms/PositiveInt]
   group-manager-column :- [:maybe vector?]]
  (t2/select :model/User {:select    (cond-> [:u.id
                                              [:u.id :user_id]
                                              :u.first_name
                                              :u.last_name
                                              :u.email
                                              :u.is_superuser
                                              :u.type
                                              :pgm.group_id
                                              [:pgm.id :membership_id]]
                                       group-manager-column (conj group-manager-column))
                          :from      [[:core_user :u]]
                          :left-join [[:permissions_group_membership :pgm] [:= :u.id :pgm.user_id]]
                          :where     [:and
                                      [:= :u.is_active true]
                                      [:in :pgm.group_id group-ids]]
                          :order-by  [[[:lower :u.first_name] :asc]
                                      [[:lower :u.last_name] :asc]]}))

(mu/defn insert-group! :- ::permissions.schema/permissions-group
  "Insert `group` and return the new instance."
  [group :- (mut/select-keys ::permissions.schema/permissions-group.update [:name :magic_group_type :is_tenant_group])]
  (t2/insert-returning-instance! :model/PermissionsGroup group))

(mu/defn update-group! :- :int
  "Apply `changes` to the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt
   changes  :- (mut/select-keys ::permissions.schema/permissions-group.update [:name :magic_group_type :is_tenant_group])]
  (t2/update! :model/PermissionsGroup group-id changes))

(mu/defn group-member-counts :- [:map-of ms/PositiveInt ms/IntGreaterThanOrEqualToZero]
  "A map of PermissionsGroup ID to number of active members in the group. Groups with no active members have no
  entry."
  []
  (let [results (mdb/query {:select    [[:pgm.group_id :group_id] [[:count :pgm.id] :members]]
                            :from      [[:permissions_group_membership :pgm]]
                            :left-join [[:core_user :user] [:= :pgm.user_id :user.id]]
                            :where     [:= :user.is_active true]
                            :group-by  [:pgm.group_id]})]
    (zipmap
     (map :group_id results)
     (map :members results))))

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

(mu/defn insert-group-memberships-from-mapping! :- :int
  "Insert a PermissionsGroupMembership (with `is_group_manager`) for each `[user-id group-id]` pair in
  `user-id-group-id->is-group-manager?`, matching Users to Groups on tenant status; returns the number of rows
  inserted."
  [user-id-group-id->is-group-manager? :- [:map-of [:tuple ms/PositiveInt ms/PositiveInt] :boolean]]
  (t2/query-one (insert-group-memberships-from-mapping-query user-id-group-id->is-group-manager?)))

(mu/defn group-membership-count :- ms/IntGreaterThanOrEqualToZero
  "The number of memberships of the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/count :model/PermissionsGroupMembership :group_id group-id))

(mu/defn other-active-member-count :- ms/IntGreaterThanOrEqualToZero
  "The number of active Users other than `user-id` in the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt
   user-id  :- ::lib.schema.id/user]
  (t2/count :model/PermissionsGroupMembership
            {:join  [[:core_user :user] [:= :user.id :user_id]]
             :where [:and
                     [:= :group_id group-id]
                     [:= :user.is_active true]
                     [:not= :user.id user-id]]}))

(mu/defn memberships-for-user :- [:sequential ::permissions.schema/permissions-group-membership]
  "The PermissionsGroupMemberships of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/PermissionsGroupMembership :user_id user-id))

(mu/defn memberships-for-user-in-groups :- [:sequential ::permissions.schema/permissions-group-membership]
  "The PermissionsGroupMemberships of the User with `user-id` in the groups with `group-ids`."
  [user-id   :- ::lib.schema.id/user
   group-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids]))

(mu/defn memberships-for-group :- [:sequential ::permissions.schema/permissions-group-membership]
  "The PermissionsGroupMemberships of the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/select :model/PermissionsGroupMembership :group_id group-id))

(mu/defn delete-memberships-for-user! :- :int
  "Delete the PermissionsGroupMemberships of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/PermissionsGroupMembership :user_id user-id))

(mu/defn delete-memberships-for-user-in-groups! :- :int
  "Delete the PermissionsGroupMemberships of the User with `user-id` in the groups with `group-ids`."
  [user-id   :- ::lib.schema.id/user
   group-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids]))

(mu/defn delete-memberships-for-group! :- :int
  "Delete the PermissionsGroupMemberships of the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/delete! :model/PermissionsGroupMembership :group_id group-id))

;;; ------------------------------------------------ Revisions ------------------------------------------------

(mu/defn latest-permissions-revision-id :- [:maybe ms/PositiveInt]
  "The highest ID of any PermissionsRevision, or nil."
  []
  (:id (t2/select-one [:model/PermissionsRevision [:%max.id :id]])))

(mu/defn latest-collection-permission-graph-revision-id :- [:maybe ms/PositiveInt]
  "The highest ID of any CollectionPermissionGraphRevision, or nil."
  []
  (:id (t2/select-one [:model/CollectionPermissionGraphRevision [:%max.id :id]])))

(mu/defn latest-application-permissions-revision-id :- [:maybe ms/PositiveInt]
  "The highest ID of any ApplicationPermissionsRevision, or nil."
  []
  (:id (t2/select-one [:model/ApplicationPermissionsRevision [:%max.id :id]])))

(mu/defn insert-collection-permission-graph-revision! :- :int
  "Insert `revision` into CollectionPermissionGraphRevision."
  [revision :- [:map {:closed true}
                [:id      {:optional true} ms/PositiveInt]
                [:before  {:optional true} [:maybe :map]]
                [:after   {:optional true} [:maybe :map]]
                [:user_id {:optional true} [:maybe ::lib.schema.id/user]]
                [:remark  {:optional true} [:maybe :string]]]]
  (t2/insert! :model/CollectionPermissionGraphRevision revision))

(mu/defn insert-collection-permission-graph-revision-returning-instance! :- ::permissions.schema/collection-permission-graph-revision
  "Insert `revision` into CollectionPermissionGraphRevision and return the new instance."
  [revision :- [:map {:closed true}
                [:id      {:optional true} ms/PositiveInt]
                [:before  {:optional true} [:maybe :map]]
                [:after   {:optional true} [:maybe :map]]
                [:user_id {:optional true} [:maybe ::lib.schema.id/user]]
                [:remark  {:optional true} [:maybe :string]]]]
  (first (t2/insert-returning-instances! :model/CollectionPermissionGraphRevision revision)))

(mu/defn insert-permissions-revision-returning-instance! :- ::permissions.schema/permissions-revision
  "Insert `revision` into PermissionsRevision and return the new instance."
  [revision :- [:map {:closed true}
                [:id      {:optional true} ms/PositiveInt]
                [:before  {:optional true} [:maybe :map]]
                [:after   {:optional true} [:maybe :map]]
                [:user_id {:optional true} [:maybe ::lib.schema.id/user]]
                [:remark  {:optional true} [:maybe :string]]]]
  (first (t2/insert-returning-instances! :model/PermissionsRevision revision)))

(mu/defn insert-application-permissions-revision-returning-instance! :- ::permissions.schema/application-permissions-revision
  "Insert `revision` into ApplicationPermissionsRevision and return the new instance."
  [revision :- [:map {:closed true}
                [:id      {:optional true} ms/PositiveInt]
                [:before  {:optional true} [:maybe :map]]
                [:after   {:optional true} [:maybe :map]]
                [:user_id {:optional true} [:maybe ::lib.schema.id/user]]
                [:remark  {:optional true} [:maybe :string]]]]
  (first (t2/insert-returning-instances! :model/ApplicationPermissionsRevision revision)))

(mu/defn update-collection-graph-revision! :- :int
  "Apply `changes` to the CollectionPermissionGraphRevision with `revision-id`."
  [revision-id :- ms/PositiveInt
   changes     :- (mut/select-keys ::permissions.schema/collection-permission-graph-revision.update [:before :after])]
  (t2/update! :model/CollectionPermissionGraphRevision revision-id changes))

;;; ----------------------------------------------- Collections -----------------------------------------------

(mu/defn collection :- [:maybe ::collections.schema/collection]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn personal-or-descendant-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]
  "The IDs among `collection-ids` that are personal Collections, or descendants of one."
  [collection-ids :- [:set ::lib.schema.id/collection]]
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

(mu/defn collection-ids-in-other-namespace :- [:maybe [:set ::lib.schema.id/collection]]
  "The IDs among `collection-ids` that do not belong to `namespace` (nil meaning the default namespace)."
  [collection-ids :- [:set ::lib.schema.id/collection]
   namespace      :- [:maybe [:or :keyword :string]]]
  (t2/select-pks-set :model/Collection
                     {:where [:and [:in :id collection-ids]
                              (cond->> [[:not= :namespace (some-> namespace name)]]
                                (nil? namespace)  (into [:and [:not= :namespace "analytics"]])
                                (some? namespace) (into [:or [:= :namespace nil]]))]}))

(mu/defn library-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]
  "The IDs of the library Collections."
  []
  (t2/select-pks-set :model/Collection :type [:in ["library" "library-data" "library-metrics"]]))

(mu/defn namespace-clause :- vector?
  "Honey SQL clause to filter `namespace-keyword` by `namespace-val`, also matching the audit-app and tenant
  namespaces when applicable."
  [namespace-keyword             :- :keyword
   namespace-val                 :- [:maybe [:or :keyword :string]]
   & [include-tenant-namespaces?] :- [:* [:maybe :boolean]]]
  [:or
   [:= namespace-keyword namespace-val]
   (when (and (nil? namespace-val)
              (premium-features/enable-audit-app?))
     [:= namespace-keyword "analytics"])
   (when (and include-tenant-namespaces? (nil? namespace-val) (setting/get :use-tenants))
     [:= namespace-keyword "shared-tenant-collection"])
   (when (and include-tenant-namespaces? (nil? namespace-val) (setting/get :use-tenants))
     [:= namespace-keyword "tenant-specific"])])

(mu/defn collection-graph-rows
  "Reducible group/collection/writable/readable rows of the collection permissions graph for `collection-namespace`,
  restricted to `ids-without-root` (or every Collection when empty) and `group-ids` (or every group when empty).
  `include-root?` controls whether the root-collection rows are included; `admin-group-id` is the id of the
  Administrators group, which implicitly has write access to every Collection."
  [collection-namespace :- [:maybe [:or :keyword :string]]
   include-root?        :- :boolean
   root-object           :- :string
   ids-without-root      :- [:maybe [:or [:set ms/PositiveInt] [:sequential ms/PositiveInt]]]
   group-ids             :- [:maybe [:or [:set ms/PositiveInt] [:sequential ms/PositiveInt]]]
   admin-group-id        :- [:maybe ms/PositiveInt]]
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

(mu/defn user-superuser? :- [:maybe :boolean]
  "Whether the User with `user-id` is a superuser."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(mu/defn user-data-analyst? :- [:maybe :boolean]
  "Whether the User with `user-id` is a data analyst."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_data_analyst :model/User :id user-id))

(mu/defn user-tenant-ids :- [:map-of ::lib.schema.id/user [:maybe ms/PositiveInt]]
  "A map of User ID to `:tenant_id` for `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn :tenant_id [:model/User :id :tenant_id] :id [:in user-ids]))

(mu/defn earliest-user-join-date :- [:maybe ms/TemporalInstant]
  "The earliest `date_joined` of any User, or nil."
  []
  (:min (t2/select-one [:model/User [:%min.date_joined :min]])))

(mu/defn update-user! :- :int
  "Apply `changes` to the User with `user-id`."
  [user-id :- ::lib.schema.id/user
   changes :- (mut/select-keys ::users.schema/user.update [:is_superuser :is_data_analyst])]
  (t2/update! :model/User user-id changes))

(mu/defn update-users! :- :int
  "Apply `changes` to the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]
   changes  :- (mut/select-keys ::users.schema/user.update [:is_superuser :is_data_analyst])]
  (t2/update! :model/User :id [:in user-ids] changes))

(mu/defn clear-data-analyst-flags! :- :int
  "Unset `is_data_analyst` on every User that has it set."
  []
  (t2/update! :model/User {:is_data_analyst true} {:is_data_analyst false}))

(mu/defn deactivate-active-tenant-users! :- :int
  "Deactivate every active tenant User, marking them as deactivated with their tenant."
  []
  (t2/update! :model/User :tenant_id [:not= nil] :is_active true {:is_active false :deactivated_with_tenant true}))

(mu/defn deactivate-all-tenants! :- [:sequential :int]
  "Mark every tenant row inactive."
  []
  (t2/query {:update :tenant
             :set    {:is_active false}}))

;;; --------------------------------------------- Databases and Tables ---------------------------------------------

(mu/defn non-destination-database-ids :- [:maybe [:sequential ::lib.schema.id/database]]
  "The IDs of the Databases that are not routing destinations."
  []
  (t2/select-pks-vec :model/Database :router_database_id nil))

(mu/defn destination-database? :- :boolean
  "Whether the Database with `database-id` is a routing destination."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id :router_database_id [:not= nil]))

(def ^:private TableLocation
  "Rows returned by [[table-location]]."
  (mut/select-keys ::warehouse-schema.schema/table.row [:id :db_id :schema]))

(mu/defn table-location :- [:maybe TableLocation]
  "The ID, Database ID, and schema of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :id :db_id :schema] :id table-id))

(mu/defn table-database-id :- [:maybe ::lib.schema.id/database]
  "The Database ID of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table table-id))

(def ^:private TableDatabaseId
  "Rows returned by [[table-database-ids]]."
  (mut/select-keys ::warehouse-schema.schema/table.row [:id :db_id]))

(mu/defn table-database-ids :- [:sequential TableDatabaseId]
  "The ID and Database ID of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids]))

(def ^:private ActiveTableLocationsForDatabase
  "Rows returned by [[active-table-locations-for-database]]."
  (mut/select-keys ::warehouse-schema.schema/table.row [:id :db_id :schema]))

(mu/defn active-table-locations-for-database :- [:sequential ActiveTableLocationsForDatabase]
  "The ID, Database ID, and schema of the active Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Table :id :db_id :schema] :db_id database-id :active true))

(def ^:private TableIdsAndSchemasExcluding
  "Rows returned by [[table-ids-and-schemas-excluding]]."
  (mut/select-keys ::warehouse-schema.schema/table.row [:id :schema]))

(mu/defn table-ids-and-schemas-excluding :- [:sequential TableIdsAndSchemasExcluding]
  "The ID and schema of the Tables of the Database with `database-id` other than `excluded-table-ids`."
  [database-id        :- ::lib.schema.id/database
   excluded-table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Table :id :schema]
             {:where [:and
                      [:= :db_id database-id]
                      [:not [:in :id excluded-table-ids]]]}))

(def ^:private FieldVisibilityInfo
  "Rows returned by [[field-visibility-info]]."
  (mut/select-keys ::warehouse-schema.schema/field [:id :visibility_type :table_id]))

(mu/defn field-visibility-info :- [:sequential FieldVisibilityInfo]
  "The ID, visibility type, and Table ID of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select [:model/Field :id :visibility_type :table_id] :id [:in field-ids]))

(mu/defn instance-by-id :- [:maybe :map]
  "The instance of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))
