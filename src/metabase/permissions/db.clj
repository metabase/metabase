(ns metabase.permissions.db
  "Application database queries for the permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentVector)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------- DataPermissions ---------------------------------------------

(mr/def ::scope
  "Which `perm-type` rows count, never those of inactive Tables: within `:db-id`, outside `:exclude-db-ids`, and of the
  Database itself plus the Tables in one `:schema-name`, nil and the empty string being one schema."
  [:map {:closed true}
   [:db-id          {:optional true} ::lib.schema.id/database]
   [:exclude-db-ids {:optional true} [:maybe [:sequential ::lib.schema.id/database]]]
   [:schema-name    {:optional true} [:maybe :string]]])

(defn- scope-clauses
  "The WHERE clauses for the `perm-type` rows in `scope` of `p` left-joined to its table `mt`, see [[::scope]]."
  [perm-type {:keys [db-id exclude-db-ids] :as scope}]
  [[:= :p.perm_type (u/qualified-name perm-type)]
   [:or [:= :p.table_id nil] [:= :mt.active true]]
   (when db-id
     [:= :p.db_id db-id])
   (when (seq exclude-db-ids)
     [:not-in :p.db_id exclude-db-ids])
   (when (contains? scope :schema-name)
     [:or
      [:= :p.table_id nil]
      (if (str/blank? (:schema-name scope))
        [:or [:= :p.schema_name nil] [:= :p.schema_name ""]]
        [:= :p.schema_name (:schema-name scope)])])])

(defn- user-group-ids-query
  "The ids of the groups of the User with `user-id`."
  [user-id]
  ^:allow-subquery {:select [:group_id]
                    :from   [(t2/table-name :model/PermissionsGroupMembership)]
                    :where  [:= :user_id user-id]})

(defn- user-rows-query
  "The `perm-type` rows in `scope` of the User with `user-id`'s groups."
  [user-id perm-type scope]
  ^:allow-subquery {:from      [[(t2/table-name :model/DataPermissions) :p]]
                    :left-join [[(t2/table-name :model/Table) :mt] [:= :mt.id :p.table_id]]
                    :where     (into [:and [:in :p.group_id (user-group-ids-query user-id)]]
                                     (scope-clauses perm-type scope))})

(mu/defn user-has-perm-value?
  "Whether a `perm-type` row in `scope` of the User with `user-id`'s groups has exactly `perm-value`."
  [user-id    :- [:maybe ::lib.schema.id/user]
   perm-type  :- ::permissions.schema/data-permission-type
   perm-value :- ::permissions.schema/data-permission-value
   scope      :- ::scope]
  (some? (t2/query-one (-> (user-rows-query user-id perm-type scope)
                           (assoc :select [[[:inline 1] :one]]
                                  :limit  [:inline 1])
                           (update :where conj [:= :p.perm_value (u/qualified-name perm-value)])))))

(mu/defn database-best-value-indexes :- [:sequential [:map [:db_id :int] [:i [:maybe :int]]]]
  "The index in `values` of the first value that a `perm-type` row of the User with `user-id`'s groups holds on each of
  the Databases with `db-ids`, probed in the order of `values`."
  [user-id   :- [:maybe ::lib.schema.id/user]
   perm-type :- ::permissions.schema/data-permission-type
   values    :- [:sequential ::permissions.schema/data-permission-value]
   db-ids    :- [:sequential ::lib.schema.id/database]]
  (let [holds (fn [v]
                [:exists (-> (user-rows-query user-id perm-type {})
                             (assoc :select [[[:inline 1] :one]])
                             (update :where conj [:= :p.db_id :d.id] [:= :p.perm_value (u/qualified-name v)]))])]
    (t2/query {:select [[:d.id :db_id]
                        [(into [:case] cat (for [[i v] (map-indexed vector values)] [(holds v) [:inline i]])) :i]]
               :from   [[(t2/table-name :model/Database) :d]]
               :where  [:in :d.id db-ids]})))

(defn- worst-rank-case
  "A CASE giving the rank of the most restrictive `perm-type` value of the group `pgm` on the rows of `p` that match
  `clauses`, probing values from the least permissive."
  [perm-type clauses]
  (let [has-value (fn [v]
                    [:exists ^:allow-subquery
                     {:select    [1]
                      :from      [[(t2/table-name :model/DataPermissions) :p]]
                      :left-join [[(t2/table-name :model/Table) :mt] [:= :mt.id :p.table_id]]
                      :where     (into [:and
                                        [:= :p.group_id :pgm.group_id]
                                        [:= :p.perm_value (u/qualified-name v)]]
                                       clauses)}])]
    (into [:case]
          cat
          (reverse (for [[i v] (map-indexed vector (-> permissions.schema/data-permissions perm-type :values))]
                     [(has-value v) [:inline i]])))))

(mu/defn most-restrictive-rank-pair :- [:map [:mn [:maybe :int]] [:mx [:maybe :int]]]
  "The lowest and highest, across the User with `user-id`'s groups, of each group's most restrictive value rank among
  its `perm-type` rows in `scope`."
  [user-id   :- [:maybe ::lib.schema.id/user]
   perm-type :- ::permissions.schema/data-permission-type
   scope     :- ::scope]
  (t2/query-one {:select [[[:min :i.worst] :mn] [[:max :i.worst] :mx]]
                 :from   [[^:allow-subquery
                           {:select [[(worst-rank-case perm-type (scope-clauses perm-type scope)) :worst]]
                            :from   [[(t2/table-name :model/PermissionsGroupMembership) :pgm]]
                            :where  [:= :pgm.user_id user-id]}
                           :i]]}))

(mu/defn database-most-restrictive-rank-pairs :- [:sequential [:map [:db_id :int] [:mn [:maybe :int]] [:mx [:maybe :int]]]]
  "[[most-restrictive-rank-pair]] of the scope of each of the Databases with `db-ids`, probed for all of them at once."
  [user-id   :- [:maybe ::lib.schema.id/user]
   perm-type :- ::permissions.schema/data-permission-type
   db-ids    :- [:sequential ::lib.schema.id/database]]
  (t2/query {:select   [:i.db_id [[:min :i.worst] :mn] [[:max :i.worst] :mx]]
             :from     [[^:allow-subquery
                         {:select [[:d.id :db_id] [(worst-rank-case perm-type (conj (scope-clauses perm-type {}) [:= :p.db_id :d.id])) :worst]]
                          :from   [[(t2/table-name :model/PermissionsGroupMembership) :pgm]]
                          :join   [[(t2/table-name :model/Database) :d] [:in :d.id db-ids]]
                          :where  [:= :pgm.user_id user-id]}
                         :i]]
             :group-by [:i.db_id]}))

(defn- database-level-values-query
  "The distinct Database and value of the database-level `perm-type` rows of the groups `group-ids-clause` selects on
  the Databases with `db-ids`."
  [group-ids-clause perm-type db-ids]
  {:select-distinct [:p.db_id :p.perm_value]
   :from            [[(t2/table-name :model/DataPermissions) :p]]
   :where           [:and
                     [:= :p.perm_type (u/qualified-name perm-type)]
                     [:in :p.db_id db-ids]
                     [:= :p.table_id nil]
                     [:in :p.group_id group-ids-clause]]})

(mu/defn user-database-level-values :- [:sequential [:map [:db_id :int] [:perm_value :string]]]
  "The distinct Database and value of the database-level `perm-type` rows of the User with `user-id`'s groups on the
  Databases with `db-ids`."
  [user-id   :- [:maybe ::lib.schema.id/user]
   perm-type :- ::permissions.schema/data-permission-type
   db-ids    :- [:sequential ::lib.schema.id/database]]
  (t2/query (database-level-values-query (user-group-ids-query user-id) perm-type db-ids)))

(mu/defn groups-database-level-values :- [:sequential [:map [:db_id :int] [:perm_value :string]]]
  "The distinct Database and value of the database-level `perm-type` rows of the groups with `group-ids` on the
  Databases with `db-ids`."
  [group-ids :- [:set ms/PositiveInt]
   perm-type :- ::permissions.schema/data-permission-type
   db-ids    :- [:sequential ::lib.schema.id/database]]
  (t2/query (database-level-values-query group-ids perm-type db-ids)))

(mu/defn user-table-level-values :- [:sequential [:map [:table_id :int] [:db_id :int] [:perm_value :string]]]
  "The distinct Table, Database and value of the `perm-type` rows of the User with `user-id`'s groups on the active
  Tables among `table-ids`."
  [user-id   :- [:maybe ::lib.schema.id/user]
   perm-type :- ::permissions.schema/data-permission-type
   table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/query {:select-distinct [:p.table_id :mt.db_id :p.perm_value]
             :from            [[(t2/table-name :model/DataPermissions) :p]]
             :join            [[(t2/table-name :model/Table) :mt] [:and [:= :mt.id :p.table_id] [:= :mt.active true]]]
             :where           [:and
                               [:= :p.perm_type (u/qualified-name perm-type)]
                               [:in :p.table_id table-ids]
                               [:in :p.group_id (user-group-ids-query user-id)]]}))

(mu/defn groups-table-level-values :- [:sequential [:map [:table_id :int] [:db_id :int] [:perm_value :string]]]
  "The distinct Table, Database and value of the `perm-type` rows of the groups with `group-ids` on the Tables among
  `table-ids`, active or not."
  [group-ids :- [:set ms/PositiveInt]
   perm-type :- ::permissions.schema/data-permission-type
   table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/query {:select-distinct [:p.table_id :p.db_id :p.perm_value]
             :from            [[(t2/table-name :model/DataPermissions) :p]]
             :where           [:and
                               [:= :p.perm_type (u/qualified-name perm-type)]
                               [:in :p.table_id table-ids]
                               [:in :p.group_id group-ids]]}))

(mu/defn user-data-permissions
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

(mu/defn data-permissions-for-groups-and-databases
  "The DataPermissions of `group-ids` on the Databases with `database-ids`."
  [group-ids    :- [:sequential ms/PositiveInt]
   database-ids :- [:or [:set ::lib.schema.id/database] [:sequential ::lib.schema.id/database]]]
  (t2/select :model/DataPermissions :group_id [:in group-ids] :db_id [:in database-ids]))

(mu/defn database-level-permission
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

(mu/defn database-level-permissions
  "The database-level DataPermissions rows of `perm-types` for `group-ids` on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   group-ids   :- [:sequential ms/PositiveInt]
   perm-types  :- [:sequential [:or :keyword :string]]]
  (t2/select :model/DataPermissions
             {:where [:and [:= :db_id database-id] [:= :table_id nil]
                      [:in :group_id group-ids] [:in :perm_type perm-types]]}))

(mu/defn distinct-table-level-permission-values
  "The distinct group, permission type, schema, and value combinations of the table-level DataPermissions rows of
  `perm-types` for `group-ids` on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   group-ids   :- [:sequential ms/PositiveInt]
   perm-types  :- [:sequential [:or :keyword :string]]]
  (t2/select :model/DataPermissions
             {:select-distinct [:group_id :perm_type :schema_name :perm_value]
              :where           [:and [:= :db_id database-id] [:not= :table_id nil]
                                [:in :group_id group-ids] [:in :perm_type perm-types]]}))

(mu/defn distinct-database-permission-values-for-group
  "The distinct database, permission type, and value combinations of the DataPermissions rows of the group with
  `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/select :model/DataPermissions
             {:select-distinct [:db_id :perm_type :perm_value]
              :where           [:= :group_id group-id]}))

(mu/defn other-table-permission-values
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

(mu/defn table-permission-ids
  "The IDs of the `perm-type` DataPermissions rows of the group with `group-id` on the Tables with `table-ids`."
  [perm-type :- [:or :keyword :string]
   group-id  :- ms/PositiveInt
   table-ids :- [:set ms/IntGreaterThanOrEqualToZero]]
  (t2/select [:model/DataPermissions :id]
             {:where [:and
                      [:= :perm_type perm-type]
                      [:= :group_id group-id]
                      [:in :table_id table-ids]]}))

(mu/defn non-audit-permission-values-for-groups
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

(mu/defn insert-data-permissions!
  "Insert the DataPermissions `rows`."
  [rows :- [:sequential (mut/select-keys ::permissions.schema/data-permissions.update [:perm_type :group_id :perm_value :db_id :table_id :schema_name])]]
  (t2/insert! :model/DataPermissions rows))

(mu/defn delete-data-permissions!
  "Delete the DataPermissions with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/DataPermissions :id [:in ids]))

;;; ------------------------------------------ Data permission filters ------------------------------------------

(def ^:private ColumnOrExp
  "A HoneySQL column reference, or an expression over one, to filter on."
  [:or :keyword vector?])

(def ^:private every-row-clause
  "The filter for a user who sees every row."
  [:= [:inline 1] [:inline 1]])

(mu/defn- value-rank
  "The index of `value` among the values of `perm-type`, 0 being the most permissive."
  [perm-type :- ::permissions.schema/data-permission-type
   value     :- ::permissions.schema/data-permission-value]
  (let [^PersistentVector values (-> permissions.schema/data-permissions perm-type :values)]
    (.indexOf values value)))

(mu/defn- rank-case
  "A CASE giving the rank (see [[value-rank]]) of the `perm-type` value in `column`."
  [perm-type :- ::permissions.schema/data-permission-type
   column    :- :keyword]
  (into [:case]
        cat
        (for [value (-> permissions.schema/data-permissions perm-type :values)]
          [[:= column (h2x/literal value)] [:inline (value-rank perm-type value)]])))

(defn- sees-every-row?
  "Whether the user of `user-info` sees every Table and Database for `permission-mapping` without asking."
  [{:keys [is-superuser? is-data-analyst?]} permission-mapping]
  (or is-superuser?
      (and is-data-analyst?
           (contains? permission-mapping :perms/manage-table-metadata))))

(def ^:private view-data-priority
  "The view-data values in the order the best of several rows is picked: `:blocked` beats `:legacy-no-self-service`."
  [:unrestricted :blocked :legacy-no-self-service])

(mu/defn- grant-clause
  "A clause holding when the best `perm-type` value of the user's rows is `level` or more permissive, given `holds`, a
  function of a sequence of values returning a clause holding when the user has a row with one of them."
  [perm-type :- ::permissions.schema/data-permission-type
   level     :- ::permissions.schema/data-permission-value
   holds     :- fn?]
  (let [enough? #(<= (value-rank perm-type %) (value-rank perm-type level))]
    (if (= perm-type :perms/view-data)
      ;; the best value is the first one held in priority order, so `v` wins when held and no earlier one is
      (into [:or]
            (keep-indexed (fn [i v]
                            (when (enough? v)
                              (into [:and (holds [v])]
                                    (for [earlier (take i view-data-priority)
                                          :when   (not (enough? earlier))]
                                      [:not (holds [earlier])])))))
            view-data-priority)
      (holds (filter enough? (-> permissions.schema/data-permissions perm-type :values))))))

(defn- rows-exist-clause
  "A clause holding when the user with `user-id` has a `perm-type` row with one of `values` matching `scope-where`."
  [user-id perm-type values scope-where]
  [:exists ^:allow-subquery
   {:select [[[:inline 1] :one]]
    :from   [[:data_permissions :dp]]
    :where  [:and
             [:= :dp.perm_type (h2x/literal perm-type)]
             [:in :dp.perm_value (mapv h2x/literal values)]
             [:in :dp.group_id ^:allow-subquery {:select [:group_id]
                                                 :from   [:permissions_group_membership]
                                                 :where  [:= :user_id [:inline user-id]]}]
             scope-where]}])

(mu/defn visible-tables-filter-clause :- [:fn vector?]
  "A HoneySQL where-clause holding when `column-or-exp` is a Table on which the user of `user-info` has, for each type
  of `permission-mapping`, the required value or a more permissive one. Each Table, aliased `mt`, is probed on its own,
  through the `data_permissions (table_id, ...)` index for its own rows and through its Database's rows, so a query
  that filters a few Tables doesn't work out the permissions of every Table. `published-clause`, a clause over `mt` or
  nil, also grants `:perms/create-queries :query-builder`."
  [column-or-exp      :- ColumnOrExp
   user-info          :- ::permissions.schema/data-user-info
   permission-mapping :- ::permissions.schema/permission-mapping
   published-clause   :- [:maybe [:fn vector?]]]
  (if (sees-every-row? user-info permission-mapping)
    every-row-clause
    (let [user-id (:user-id user-info)
          holds   (fn [perm-type]
                    (fn [values]
                      [:or
                       [:and
                        [:= :mt.active true]
                        (rows-exist-clause user-id perm-type values [:= :dp.table_id :mt.id])]
                       (rows-exist-clause user-id perm-type values [:and
                                                                    [:= :dp.db_id :mt.db_id]
                                                                    [:= :dp.table_id nil]])
                       (when (and (= perm-type :perms/create-queries)
                                  (some #{:query-builder} values))
                         published-clause)]))]
      [:in column-or-exp
       ^:allow-subquery
       {:select [:mt.id]
        :from   [[(t2/table-name :model/Table) :mt]]
        :where  (into [:and]
                      (map (fn [[perm-type level]] (grant-clause perm-type level (holds perm-type))))
                      permission-mapping)}])))

(mu/defn visible-databases-filter-clause :- [:fn vector?]
  "A HoneySQL where-clause holding when `column-or-exp` is a Database on which the user of `user-info` has, for each
  type of `permission-mapping`, the required value or a more permissive one on some row: the Database's own, or one of
  an active Table of it. Each Database is probed on its own."
  [column-or-exp      :- ColumnOrExp
   user-info          :- ::permissions.schema/data-user-info
   permission-mapping :- ::permissions.schema/permission-mapping]
  (if (sees-every-row? user-info permission-mapping)
    every-row-clause
    (let [user-id (:user-id user-info)
          holds   (fn [perm-type]
                    (fn [values]
                      [:or
                       (rows-exist-clause user-id perm-type values [:and
                                                                    [:= :dp.db_id :md.id]
                                                                    [:= :dp.table_id nil]])
                       (rows-exist-clause user-id perm-type values
                                          [:and
                                           [:= :dp.db_id :md.id]
                                           [:exists ^:allow-subquery
                                            {:select [[[:inline 1] :one]]
                                             :from   [[(t2/table-name :model/Table) :mt]]
                                             :where  [:and [:= :mt.id :dp.table_id] [:= :mt.active true]]}]])]))]
      [:in column-or-exp
       ^:allow-subquery
       {:select [:md.id]
        :from   [[(t2/table-name :model/Database) :md]]
        :where  (into [:and]
                      (map (fn [[perm-type level]] (grant-clause perm-type level (holds perm-type))))
                      permission-mapping)}])))

(mu/defn select-tables-and-groups-granting-perm
  "Selects the id of each Table, and the group, type and value of each `data_permissions` row of the user of
  `user-info` that applies to it with the required value of its type in `permission-mapping` or a more permissive one,
  for telling which group grants a Table."
  [{:keys [user-id is-superuser?]} :- ::permissions.schema/data-user-info
   permission-mapping              :- ::permissions.schema/permission-mapping]
  ^:allow-subquery
  {:select [:mt.id :dp.group_id :dp.perm_type :dp.perm_value]
   :from   [[(t2/table-name :model/Table) :mt]]
   :join   [[:data_permissions :dp] [:or
                                     [:and
                                      [:= :mt.db_id :dp.db_id]
                                      [:= :dp.table_id nil]]
                                     [:= :mt.id :dp.table_id]]
            [:permissions_group :pg] [:= :pg.id :dp.group_id]
            [:permissions_group_membership :pgm] [:and
                                                  [:= :pgm.group_id :pg.id]
                                                  [:= :pgm.user_id [:inline user-id]]]]
   :where  (if is-superuser?
             every-row-clause
             (into [:or]
                   (map (fn [[perm-type level]]
                          [:and
                           [:= :dp.perm_type (h2x/literal perm-type)]
                           [:>= [:inline (value-rank perm-type level)] (rank-case perm-type :dp.perm_value)]]))
                   permission-mapping))})

;;; ----------------------------------------------- Permissions -----------------------------------------------

(mu/defn group-ids-with-permission-objects
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

(mu/defn related-permission-objects
  "The Permissions objects held by the group with `group-id` that are ancestors or descendants of `path` (also
  checking each of `also-under-paths`, e.g. a v2-equivalent path)."
  [group-id          :- ms/PositiveInt
   path              :- :string
   also-under-paths  :- [:sequential :string]]
  (t2/select-fn-set :object :model/Permissions
                    {:where (related-permission-objects-where group-id path also-under-paths)}))

(mu/defn delete-related-permissions!
  "Delete the Permissions rows held by the group with `group-id` that are ancestors or descendants of `path` (also
  checking each of `also-under-paths`, e.g. a v2-equivalent path)."
  [group-id          :- ms/PositiveInt
   path              :- :string
   also-under-paths  :- [:sequential :string]]
  (t2/delete! :model/Permissions
              {:where (related-permission-objects-where group-id path also-under-paths)}))

(mu/defn insert-permissions!
  "Insert the Permissions `rows`."
  [rows :- [:sequential (mut/select-keys ::permissions.schema/permissions.update [:group_id :object])]]
  (t2/insert! :model/Permissions rows))

(mu/defn permission-objects-for-user
  "The Permissions objects granted, via group membership, to the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (map :object (mdb/query {:select [:p.object]
                           :from   [[:permissions_group_membership :pgm]]
                           :join   [[:permissions_group :pg] [:= :pgm.group_id :pg.id]
                                    [:permissions :p]        [:= :p.group_id :pg.id]]
                           :where  [:= :pgm.user_id user-id]})))

;;; --------------------------------------------- PermissionsGroup ---------------------------------------------

(mu/defn magic-group
  "The ID, name, type, and tenant flag of the magic PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type :- :string]
  (t2/select-one [:model/PermissionsGroup :id :name :magic_group_type :is_tenant_group]
                 :magic_group_type magic-group-type))

(mu/defn group-id-by-magic-type
  "The ID of the PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type :- :string]
  (t2/select-one-pk :model/PermissionsGroup :magic_group_type magic-group-type))

(mu/defn group-exists-with-lower-name?
  "Whether a PermissionsGroup whose lower-cased name is `lower-name` exists."
  [lower-name :- :string]
  (t2/exists? :model/PermissionsGroup :%lower.name lower-name))

(mu/defn groups-except-magic-type
  "The PermissionsGroups other than the magic group of `magic-group-type`."
  [magic-group-type :- :string]
  (t2/select :model/PermissionsGroup :magic_group_type [:not= magic-group-type]))

(mu/defn non-magic-groups
  "The PermissionsGroups that are not magic groups."
  []
  (t2/select :model/PermissionsGroup {:where [:= :magic_group_type nil]}))

(mu/defn tenant-group?
  "Whether the PermissionsGroup with `group-id` is a tenant group."
  [group-id :- ms/PositiveInt]
  (t2/select-one-fn :is_tenant_group :model/PermissionsGroup :id group-id))

(mu/defn tenant-group-ids
  "The IDs of every tenant PermissionsGroup."
  []
  (t2/select-pks-set :model/PermissionsGroup :is_tenant_group true))

(mu/defn group-tenant-flags
  "A map of group ID to `:is_tenant_group` for `group-ids`."
  [group-ids :- [:set ms/PositiveInt]]
  (t2/select-pk->fn :is_tenant_group [:model/PermissionsGroup :id :is_tenant_group] :id [:in group-ids]))

(mu/defn groups-by-ids
  "The ID, name, magic type, and tenant flag of the requested groups, ordered by name."
  [group-ids :- [:set ms/PositiveInt]]
  (if (seq group-ids)
    (t2/select [:model/PermissionsGroup :id :name :magic_group_type :is_tenant_group]
               :id [:in group-ids]
               {:order-by [:%lower.name]})
    []))

(mu/defn group-members
  "The active Users in the PermissionsGroups with `group-ids`. When `include-group-manager?` is true each row also
  carries the membership's `:is_group_manager` flag."
  [group-ids              :- [:sequential ms/PositiveInt]
   include-group-manager? :- :boolean]
  (t2/select :model/User {:select    (cond-> [:u.id
                                              [:u.id :user_id]
                                              :u.first_name
                                              :u.last_name
                                              :u.email
                                              :u.is_superuser
                                              :u.type
                                              :pgm.group_id
                                              [:pgm.id :membership_id]]
                                       include-group-manager?
                                       (conj [:pgm.is_group_manager :is_group_manager]))
                          :from      [[:core_user :u]]
                          :left-join [[:permissions_group_membership :pgm] [:= :u.id :pgm.user_id]]
                          :where     [:and
                                      [:= :u.is_active true]
                                      [:in :pgm.group_id group-ids]]
                          :order-by  [[[:lower :u.first_name] :asc]
                                      [[:lower :u.last_name] :asc]]}))

(mu/defn group-member-counts
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

(mu/defn insert-group-memberships-from-mapping!
  "Insert a PermissionsGroupMembership (with `is_group_manager`) for each `[user-id group-id]` pair in
  `user-id-group-id->is-group-manager?`, matching Users to Groups on tenant status; returns the number of rows
  inserted."
  [user-id-group-id->is-group-manager? :- [:map-of [:tuple ms/PositiveInt ms/PositiveInt] :boolean]]
  (t2/query-one (insert-group-memberships-from-mapping-query user-id-group-id->is-group-manager?)))

(mu/defn other-active-member-count
  "The number of active Users other than `user-id` in the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt
   user-id  :- ::lib.schema.id/user]
  (t2/count :model/PermissionsGroupMembership
            {:join  [[:core_user :user] [:= :user.id :user_id]]
             :where [:and
                     [:= :group_id group-id]
                     [:= :user.is_active true]
                     [:not= :user.id user-id]]}))

(mu/defn memberships-for-user
  "The PermissionsGroupMemberships of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/PermissionsGroupMembership :user_id user-id))

(mu/defn memberships-for-user-in-groups
  "The PermissionsGroupMemberships of the User with `user-id` in the groups with `group-ids`."
  [user-id   :- ::lib.schema.id/user
   group-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids]))

(mu/defn memberships-for-group
  "The PermissionsGroupMemberships of the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/select :model/PermissionsGroupMembership :group_id group-id))

(mu/defn existing-membership-pairs :- [:set [:tuple ms/PositiveInt ms/PositiveInt]]
  "The `[user-id group-id]` pairs among `pairs` that already have a PermissionsGroupMembership."
  [pairs :- [:sequential [:tuple ms/PositiveInt ms/PositiveInt]]]
  (if (empty? pairs)
    #{}
    (let [wanted (set pairs)]
      (into #{}
            (comp (map (juxt :user_id :group_id))
                  (filter wanted))
            (t2/select [:model/PermissionsGroupMembership :user_id :group_id]
                       :user_id  [:in (map first pairs)]
                       :group_id [:in (map second pairs)])))))

(mu/defn delete-memberships-for-user!
  "Delete the PermissionsGroupMemberships of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/PermissionsGroupMembership :user_id user-id))

(mu/defn delete-memberships-for-user-in-groups!
  "Delete the PermissionsGroupMemberships of the User with `user-id` in the groups with `group-ids`."
  [user-id   :- ::lib.schema.id/user
   group-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids]))

(mu/defn delete-memberships-for-group!
  "Delete the PermissionsGroupMemberships of the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/delete! :model/PermissionsGroupMembership :group_id group-id))

;;; ------------------------------------------------ Revisions ------------------------------------------------

(mu/defn latest-permissions-revision-id
  "The highest ID of any PermissionsRevision, or nil."
  []
  (:id (t2/select-one [:model/PermissionsRevision [:%max.id :id]])))

(mu/defn latest-collection-permission-graph-revision-id
  "The highest ID of any CollectionPermissionGraphRevision, or nil."
  []
  (:id (t2/select-one [:model/CollectionPermissionGraphRevision [:%max.id :id]])))

(mu/defn latest-application-permissions-revision-id
  "The highest ID of any ApplicationPermissionsRevision, or nil."
  []
  (:id (t2/select-one [:model/ApplicationPermissionsRevision [:%max.id :id]])))

(mu/defn insert-collection-permission-graph-revision!
  "Insert `revision` into CollectionPermissionGraphRevision."
  [revision :- [:map {:closed true}
                [:id      {:optional true} ms/PositiveInt]
                [:before  {:optional true} ::permissions.schema/collection-permission-graph-revision.before]
                [:after   {:optional true} ::permissions.schema/collection-permission-graph-revision.after]
                [:user_id {:optional true} [:maybe ::lib.schema.id/user]]
                [:remark  {:optional true} [:maybe :string]]]]
  (t2/insert! :model/CollectionPermissionGraphRevision revision))

(mu/defn insert-collection-permission-graph-revision-returning-instance!
  "Insert `revision` into CollectionPermissionGraphRevision and return the new instance."
  [revision :- [:map {:closed true}
                [:id      {:optional true} ms/PositiveInt]
                [:before  {:optional true} ::permissions.schema/collection-permission-graph-revision.before]
                [:after   {:optional true} ::permissions.schema/collection-permission-graph-revision.after]
                [:user_id {:optional true} [:maybe ::lib.schema.id/user]]
                [:remark  {:optional true} [:maybe :string]]]]
  (first (t2/insert-returning-instances! :model/CollectionPermissionGraphRevision revision)))

(mu/defn insert-permissions-revision-returning-instance!
  "Insert `revision` into PermissionsRevision and return the new instance."
  [revision :- [:map {:closed true}
                [:id      {:optional true} ms/PositiveInt]
                [:before  {:optional true} [:maybe ::permissions.schema/permissions-revision.before]]
                [:after   {:optional true} [:maybe ::permissions.schema/permissions-revision.after]]
                [:user_id {:optional true} [:maybe ::lib.schema.id/user]]
                [:remark  {:optional true} [:maybe :string]]]]
  (first (t2/insert-returning-instances! :model/PermissionsRevision revision)))

(mu/defn insert-application-permissions-revision-returning-instance!
  "Insert `revision` into ApplicationPermissionsRevision and return the new instance."
  [revision :- [:map {:closed true}
                [:id      {:optional true} ms/PositiveInt]
                [:before  {:optional true} [:maybe ::permissions.schema/application-permissions-revision.before]]
                [:after   {:optional true} [:maybe ::permissions.schema/application-permissions-revision.after]]
                [:user_id {:optional true} [:maybe ::lib.schema.id/user]]
                [:remark  {:optional true} [:maybe :string]]]]
  (first (t2/insert-returning-instances! :model/ApplicationPermissionsRevision revision)))

(mu/defn update-collection-graph-revision!
  "Apply `changes` to the CollectionPermissionGraphRevision with `revision-id`."
  [revision-id :- ms/PositiveInt
   changes     :- (mut/select-keys ::permissions.schema/collection-permission-graph-revision.update [:before :after])]
  (t2/update! :model/CollectionPermissionGraphRevision :id revision-id changes))

;;; ----------------------------------------------- Collections -----------------------------------------------

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn personal-or-descendant-collection-ids
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

(mu/defn collection-ids-in-other-namespace
  "The IDs among `collection-ids` that do not belong to `namespace` (nil meaning the default namespace)."
  [collection-ids :- [:set ::lib.schema.id/collection]
   namespace      :- [:maybe [:or :keyword :string]]]
  (t2/select-pks-set :model/Collection
                     {:where [:and [:in :id collection-ids]
                              (cond->> [[:not= :namespace (some-> namespace name)]]
                                (nil? namespace)  (into [:and [:not= :namespace "analytics"]])
                                (some? namespace) (into [:or [:= :namespace nil]]))]}))

(mu/defn library-collection-ids
  "The IDs of the library Collections."
  []
  (t2/select-pks-set :model/Collection :type [:in ["library" "library-data" "library-metrics" "library-dashboards"]]))

(mu/defn namespace-clause
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

;;; ------------------------------------------- Collection permissions -------------------------------------------

(mr/def ::collection-user
  "What the Collection clauses read about the user they answer for: a nil `:user-id` in a superuser context without a
  user, such as `request/as-admin`, the Collections of their tenant, and whether the instance uses tenants."
  [:map {:closed true}
   [:user-id               [:maybe ::lib.schema.id/user]]
   [:is-superuser?         :boolean]
   [:is-data-analyst?      :boolean]
   [:tenant-collection-ids [:sequential ms/PositiveInt]]
   [:use-tenants?          :boolean]])

(defn- root-collection-objects
  "The read-and-write and read permission objects of the root Collection of `root-namespace`, nil for the default
  namespace."
  [root-namespace]
  (let [root {:metabase.collections.models.collection.root/is-root? true
              :namespace                                           (some-> root-namespace name)}]
    [(permissions.path/collection-readwrite-path root) (permissions.path/collection-read-path root)]))

(defn- user-groups-query
  "The ids of the groups of the user with `user-id`."
  [user-id]
  ^:allow-subquery {:select [:group_id]
                    :from   [(t2/table-name :model/PermissionsGroupMembership)]
                    :where  [:= :user_id user-id]})

(defn- user-collection-objects-query
  "The objects of the Collection permission rows of the groups of the user with `user-id`."
  [user-id]
  ^:allow-subquery {:select [:perms_row.object]
                    :from   [[(t2/table-name :model/Permissions) :perms_row]]
                    :where  [:and
                             [:in :perms_row.group_id (user-groups-query user-id)]
                             [:like :perms_row.object (h2x/literal "/collection/%")]]})

(defn- collection-rows-clause
  "Whether a group of the user with `user-id` holds the permission row of the Collection aliased `perms_collection` for
  `permission-level`, by its object path as the permission set reads it: `/collection/<id>/` for write, and also
  `/collection/<id>/read/` for read. With the `:per-row` `probe` it looks up the rows of each Collection, and with
  `:set` it matches each Collection against the user's rows, read once."
  [user-id permission-level probe]
  (let [path  (fn [suffix] [:concat (h2x/literal "/collection/") :perms_collection.id (h2x/literal suffix)])
        paths (cond-> [(path "/")]
                (= permission-level :read) (conj (path "/read/")))]
    (case probe
      :per-row [:exists ^:allow-subquery {:select [1]
                                          :from   [[(t2/table-name :model/Permissions) :perms_row]]
                                          :where  [:and
                                                   [:in :perms_row.object paths]
                                                   [:in :perms_row.group_id (user-groups-query user-id)]]}]
      :set     (into [:or] (map (fn [p] [:in p (user-collection-objects-query user-id)])) paths))))

(defn- own-collection-clause
  "Whether the user of `user` writes the Collection aliased `perms_collection` whatever their groups hold: their personal
  Collection and its descendants, their tenant Collections, and the transforms namespace for a data analyst."
  [{:keys [user-id tenant-collection-ids] :as user}]
  (when user-id
    [:or
     [:= :perms_collection.personal_owner_id user-id]
     [:exists ^:allow-subquery {:select [1]
                                :from   [[(t2/table-name :model/Collection) :perms_personal]]
                                :where  [:and
                                         [:= :perms_personal.personal_owner_id user-id]
                                         [:like :perms_collection.location [:concat "/" :perms_personal.id "/%"]]]}]
     (when (seq tenant-collection-ids)
       [:in :perms_collection.id tenant-collection-ids])
     (when (:is-data-analyst? user)
       [:= :perms_collection.namespace "transforms"])]))

(defn- collection-level-clause
  "A HoneySQL clause holding when `user` has `permission-level` on the Collection aliased `perms_collection`, probed per
  row or matched against the user's permission rows read once, by `probe`."
  ([user permission-level]
   (collection-level-clause user permission-level :per-row))
  ([{:keys [user-id is-superuser?] :as user} permission-level probe]
   (if is-superuser?
     every-row-clause
     [:or
      (own-collection-clause user)
      (collection-rows-clause user-id permission-level probe)])))

(defn- collection-rank-case
  "A HoneySQL CASE giving, for the Collection aliased `perms_collection`, 2 when the user of `user` writes it, 1 when they only
  read it, and 0 otherwise."
  [user]
  [:case
   (collection-level-clause user :write) [:inline 2]
   (collection-level-clause user :read)  [:inline 1]
   :else                                      [:inline 0]])

(defn- trash-clause
  "Whether the Collection aliased `perms_collection` is the trash."
  []
  [:= :perms_collection.type "trash"])

(defn- listed-collection-clause
  "The clause over the Collection aliased `perms_collection` applying the criteria of `options` beyond permissions: the trash,
  archived Collections, shared tenant Collections on an instance without tenants, and an archive operation."
  [{:keys [use-tenants?]}
   {:keys [include-trash-collection? include-archived-items archive-operation-id]}]
  [:and
   (when-not include-trash-collection?
     [:or [:= :perms_collection.type nil] [:not= :perms_collection.type "trash"]])
   (case include-archived-items
     :exclude [:= :perms_collection.archived false]
     ;; the trash is included when viewing archived items only
     :only    [:or [:= :perms_collection.archived true] (trash-clause)]
     :all     nil)
   (when-not use-tenants?
     [:or [:= :perms_collection.namespace nil] [:not= :perms_collection.namespace "shared-tenant-collection"]])
   (when archive-operation-id
     ;; the trash is part of every archive operation
     [:or [:= :perms_collection.archive_operation_id archive-operation-id] (trash-clause)])])

(defn- root-collection-clause
  "A clause holding when `user` has `permission-level` on the root Collection of `root-namespace`, which nothing
  archived or archived together lists."
  [{:keys [user-id is-superuser?] :as user}
   {:keys [permission-level include-archived-items archive-operation-id root-namespace]}]
  (when-not (or (= include-archived-items :only) archive-operation-id)
    (cond
      is-superuser?
      every-row-clause

      (and (= (some-> root-namespace name) "transforms") (:is-data-analyst? user))
      every-row-clause

      user-id
      [:exists ^:allow-subquery
       {:select [1]
        :from   [[(t2/table-name :model/Permissions) :perms_row]]
        :where  [:and
                 [:in :perms_row.object (let [[write-object read-object] (root-collection-objects root-namespace)]
                                          (cond-> [write-object]
                                            (= permission-level :read) (conj read-object)))]
                 [:in :perms_row.group_id (user-groups-query user-id)]]}])))

(defn- visible-collection-where
  "The HoneySQL where-clause over the Collection aliased `perms_collection` holding when it is listed to the user of `user` with
  `options` (see `::permissions.schema/collection-filter-options`)."
  ([user options]
   (visible-collection-where user options :per-row))
  ([user options probe]
   (let [options (merge {:permission-level :read, :include-archived-items :exclude} options)]
     [:and
      [:or
       (collection-level-clause user (:permission-level options) probe)
       (when (:include-trash-collection? options) (trash-clause))]
      (listed-collection-clause user options)])))

(defn- qualified-column?
  "Whether `column` names its table, as in `:report_card.collection_id`."
  [column]
  (and (keyword? column) (str/includes? (name column) ".")))

(def ^:private QualifiedColumn
  "A column keyword naming its table, so that it can't refer to a column of a table in the clause's subqueries."
  [:fn {:error/message "a column qualified with its table, such as :report_card.collection_id"} qualified-column?])

(defn- check-qualified-column
  "Throws unless `column` is qualified with its table, also where schemas aren't checked: a bare `:id` would compare the
  probed Collection with itself."
  [column]
  (when-not (qualified-column? column)
    (throw (ex-info (str "The column must be qualified with its table: " column) {:column column}))))

(mu/defn visible-collections-filter-clause :- [:fn vector?]
  "A HoneySQL where-clause holding when `collection-id-field` is a Collection listed to the user of `user` with
  `options` (see `::permissions.schema/collection-filter-options`), or nil when they have the permission on the root Collection of its namespace. A
  correlated `EXISTS` probes the Collection of each row, so a query asking about a few rows doesn't work out every
  visible Collection."
  [collection-id-field :- QualifiedColumn
   user           :- ::collection-user
   options             :- ::permissions.schema/collection-filter-options]
  (check-qualified-column collection-id-field)
  (let [options (merge {:permission-level :read, :include-archived-items :exclude} options)]
    [:or
     (when-let [root (root-collection-clause user options)]
       [:and [:= collection-id-field nil] root])
     [:exists
      ^:allow-subquery
      {:select [1]
       :from   [[(t2/table-name :model/Collection) :perms_collection]]
       :where  [:and
                [:= :perms_collection.id collection-id-field]
                (visible-collection-where user options)]}]]))

(mu/defn visible-collections-set-filter-clause :- [:fn vector?]
  "Like [[visible-collections-filter-clause]], for queries checking most Collections, such as Collection trees and
  listings: it works out the set of visible Collections once and matches `collection-id-field` against it, instead of
  probing each row's Collection."
  [collection-id-field :- QualifiedColumn
   user           :- ::collection-user
   options             :- ::permissions.schema/collection-filter-options]
  (check-qualified-column collection-id-field)
  (let [options (merge {:permission-level :read, :include-archived-items :exclude} options)]
    [:or
     (when-let [root (root-collection-clause user options)]
       [:and [:= collection-id-field nil] root])
     [:in collection-id-field
      ^:allow-subquery
      {:select [:perms_collection.id]
       :from   [[(t2/table-name :model/Collection) :perms_collection]]
       :where  (visible-collection-where user options :set)}]]))

(mu/defn collection-ranks :- [:sequential [:map [:id ms/PositiveInt] [:rank :int]]]
  "For each of the Collections with `collection-ids`, 2 when `user` writes it, 1 when they only read it, and 0
  otherwise."
  [user           :- ::collection-user
   collection-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select [:perms_collection.id [(collection-rank-case user) :rank]]
             :from   [[(t2/table-name :model/Collection) :perms_collection]]
             :where  [:in :perms_collection.id collection-ids]}))

(mu/defn some-collection-rank :- :int
  "2 when `user` writes a Collection listed to them, 1 when they only read one, and 0 otherwise, stopping at the first
  match."
  [user :- ::collection-user]
  (let [some-collection (fn [permission-level]
                          [:exists ^:allow-subquery {:select [1]
                                                     :from   [[(t2/table-name :model/Collection) :perms_collection]]
                                                     :where  (visible-collection-where user {:permission-level permission-level})}])]
    (:rank (t2/query-one {:select [[[:case
                                     (some-collection :write) [:inline 2]
                                     (some-collection :read)  [:inline 1]
                                     :else                    [:inline 0]]
                                    :rank]]}))))

(mu/defn root-collection-rank :- :int
  "2 when a group of the user with `user-id` holds the read-and-write permission row of the root Collection of
  `root-namespace`, nil for the default namespace, 1 when one holds its read row, and 0 otherwise."
  [user-id        :- ::lib.schema.id/user
   root-namespace :- [:maybe [:or :keyword :string]]]
  (let [[write-object read-object] (root-collection-objects root-namespace)
        objects                    (into #{}
                                         (map :object)
                                         (t2/query {:select [:p.object]
                                                    :from   [[(t2/table-name :model/Permissions) :p]]
                                                    :join   [[(t2/table-name :model/PermissionsGroupMembership) :pgm]
                                                             [:= :pgm.group_id :p.group_id]]
                                                    :where  [:and
                                                             [:= :pgm.user_id user-id]
                                                             [:in :p.object [write-object read-object]]]}))]
    (cond
      (contains? objects write-object) 2
      (contains? objects read-object)  1
      :else                            0)))

;;; ------------------------------------------------- Users -------------------------------------------------

(mu/defn user-superuser?
  "Whether the User with `user-id` is a superuser."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(mu/defn user-data-analyst?
  "Whether the User with `user-id` is a data analyst."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_data_analyst :model/User :id user-id))

(mu/defn user-tenant-ids
  "A map of User ID to `:tenant_id` for `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn :tenant_id [:model/User :id :tenant_id] :id [:in user-ids]))

(mu/defn earliest-user-join-date
  "The earliest `date_joined` of any User, or nil."
  []
  (:min (t2/select-one [:model/User [:%min.date_joined :min]])))

(mu/defn update-user!
  "Apply `changes` to the User with `user-id`."
  [user-id :- ::lib.schema.id/user
   changes :- (mut/select-keys ::users.schema/user.update [:is_superuser :is_data_analyst])]
  (t2/update! :model/User :id user-id changes))

(mu/defn update-users!
  "Apply `changes` to the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]
   changes  :- (mut/select-keys ::users.schema/user.update [:is_superuser :is_data_analyst])]
  (t2/update! :model/User :id [:in user-ids] changes))

(mu/defn deactivate-active-tenant-users!
  "Deactivate every active tenant User, marking them as deactivated with their tenant."
  []
  (t2/update! :model/User :tenant_id [:not= nil] :is_active true {:is_active false :deactivated_with_tenant true}))

(mu/defn deactivate-all-tenants!
  "Mark every tenant row inactive."
  []
  (t2/query {:update :tenant
             :set    {:is_active false}}))

;;; --------------------------------------------- Databases and Tables ---------------------------------------------

(mu/defn non-destination-database-ids
  "The IDs of the Databases that are not routing destinations."
  []
  (t2/select-pks-vec :model/Database :router_database_id nil))

(mu/defn destination-database?
  "Whether the Database with `database-id` is a routing destination."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id :router_database_id [:not= nil]))

(mu/defn table-location
  "The ID, Database ID, schema, and data source of the Table with `table-id`.

  `:data_source` is included because new-table permission defaults branch on whether the table came from an upload;
  see [[metabase.permissions.data-permissions/set-default-table-permissions!]]."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :id :db_id :schema :data_source] :id table-id))

(mu/defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(mu/defn table-database-ids
  "The ID and Database ID of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids]))

(mu/defn active-table-locations-for-database
  "The ID, Database ID, and schema of the active Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Table :id :db_id :schema] :db_id database-id :active true))

(mu/defn table-ids-and-schemas-excluding
  "The ID and schema of the Tables of the Database with `database-id` other than `excluded-table-ids`."
  [database-id        :- ::lib.schema.id/database
   excluded-table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Table :id :schema]
             {:where [:and
                      [:= :db_id database-id]
                      [:not [:in :id excluded-table-ids]]]}))

(mu/defn field-visibility-info
  "The ID, visibility type, and Table ID of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select [:model/Field :id :visibility_type :table_id] :id [:in field-ids]))

(mu/defn instance-by-id
  "The instance of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))
