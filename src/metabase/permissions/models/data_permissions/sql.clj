(ns metabase.permissions.models.data-permissions.sql
  "Helper functions for models using data permissions to construct `visisble-query` methods from."
  (:require
   [metabase.permissions.schema :as permissions.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang PersistentVector)))

(set! *warn-on-reflection* true)

(defmulti perm-type-to-least-int-case
  "Converts a given `data-perm/PermissionType` keyword and either a column for a literal value into a case when ... then
  ... SQL statement that converts the given column or literal into the index of the value for provide permission type.

  For example, calling with perm-type :perms/view-data and a column :perm-value creates a SQL Statement like:

  ```sql
  CASE WHEN \"perm_value\" = 'unrestricted' THEN 0 ELSE ...
  ```

  This lets us write SQL statements to compare permissions values by their index position in the same way we do in the
  `data-perms/at-least-as-permissive?` function"
  {:arglists '([perm-type column])}
  (fn [perm-type _] perm-type))

(mu/defn- perm-type-to-int-case
  [perm-type     :- ::permissions.schema/data-permission-type
   column        :- :keyword]
  (into [:case]
        (apply concat
               (map-indexed (fn [idx perm-value] [[:= column (h2x/literal perm-value)] [:inline idx]])
                            (-> permissions.schema/data-permissions perm-type :values)))))

(mu/defmethod perm-type-to-least-int-case :default
  [perm-type     :- ::permissions.schema/data-permission-type
   column        :- :keyword]
  [:min (perm-type-to-int-case perm-type column)])

(mu/defmethod perm-type-to-least-int-case :perms/view-data
  [_ :- ::permissions.schema/data-permission-type
   column :- :keyword]
  ;; blocked has a higher 'prioirty' than legacy-no-self-service when determining what permission level the user has
  (let [minimum-perm-value [:min
                            [:case
                             [:= column [:inline "unrestricted"]] [:inline 0]
                             [:= column [:inline "blocked"]] [:inline 1]
                             [:= column [:inline "legacy-no-self-service"]] [:inline 2]]]]
    ;; but when we compare it against the required level it should still be compared by its index value
    [:case
     [:= minimum-perm-value [:inline 0]] [:inline 0]
     [:= minimum-perm-value [:inline 1]] [:inline 2]
     [:= minimum-perm-value [:inline 2]] [:inline 1]]))

(mu/defn- perm-type-to-int-inline :- [:tuple [:= :inline] nat-int?]
  [perm-type :- ::permissions.schema/data-permission-type
   level     :- ::permissions.schema/data-permission-value]
  (let [^PersistentVector values (-> permissions.schema/data-permissions perm-type :values)]
    [:inline (.indexOf values level)]))

(mu/defn- perm-type-to-most-int-case
  [perm-type     :- ::permissions.schema/data-permission-type
   column        :- :keyword]
  [:max (perm-type-to-int-case perm-type column)])

(mu/defn- perm-condition
  [perm-type      :- :keyword
   required-level :- :keyword
   most-or-least  :- [:enum :most :least]]
  [(case most-or-least
     :most  :>=
     :least :<=)
   (case most-or-least
     :most  (perm-type-to-most-int-case perm-type :dp.perm_value)
     :least (perm-type-to-least-int-case perm-type :dp.perm_value))
   (perm-type-to-int-inline perm-type required-level)])

(mu/defn- user-in-group-clause
  "Returns a simple IN clause to check if dp.group_id is in the user's groups.
   This is more efficient than nested EXISTS subqueries."
  [user-id :- pos-int?]
  [:in :dp.group_id {:select [:group_id]
                     :from   [:permissions_group_membership]
                     :where  [:= :user_id [:inline user-id]]}])

(mu/defn- has-perms-for-table-as-honey-sql?
  "Builds an EXIST (SELECT ...) half-join to filter tables that a user has the required permissions for. It builds the subselect by as a
   GROUP BY table_id HAVING user-most-or-least-restrictive-permission <= required-permission-level. The group by allows us to map the permission
   value column to the index of the permission value in the `data-perms/Permission` map."
  [user-id          :- pos-int?
   perm-type        :- :keyword
   required-level   :- :keyword
   & [most-or-least :- [:maybe [:enum :most :least]]]]
  [:exists {:select [1]
            :from   [[:data_permissions :dp]]
            :where  [:and
                     [:= :dp.perm_type (h2x/literal perm-type)]
                     [:or
                      [:and [:= :mt.db_id :dp.db_id]
                       [:= :dp.table_id nil]]
                      [:= :mt.id :dp.table_id]]
                     (user-in-group-clause user-id)]
            :group-by [:mt.id]
            :having   [(perm-condition perm-type required-level (or most-or-least :least))]}])

(def UserInfo
  "The user-id to use in the visibility query and their superuser status."
  [:map
   [:user-id       pos-int?]
   [:is-superuser? :boolean]])

(def PermissionMapping
  "Map of permission-type to either a permission value or tuple of (permission-value, :most/:least) indicating if we want to get the
  most or least restrictive permission a user has in any of the groups they are a member of. If that value is left out we will assume we
  want the least restrict permission value."
  [:map-of
   ::permissions.schema/data-permission-type
   [:or ::permissions.schema/data-permission-value [:tuple ::permissions.schema/data-permission-value [:enum :most :least]]]])

(mu/defn visible-table-filter-select
  "Selects a column from tables that are visible to the provided user given a mapping of permission types to the required value or the required
  value and a directive if we should test against the most or least permissive permission the user has."
  [select-column                   :- [:enum :id :db_id]
   {:keys [user-id is-superuser?]} :- UserInfo
   permission-mapping              :- PermissionMapping]
  {:select [(case select-column
              :id :mt.id
              :db_id :mt.db_id)]
   :from   [[:metabase_table :mt]]
   :where  (if is-superuser?
             [:= [:inline 1] [:inline 1]]
             (into [:and]
                   (mapcat (fn [[perm-type perm-level]]
                             [(apply has-perms-for-table-as-honey-sql? user-id perm-type (cond-> perm-level
                                                                                           (not (sequential? perm-level)) vector))]))
                   permission-mapping))})

(mu/defn- permission-type-having-clause
  "Builds a HAVING clause condition for a single permission type using conditional aggregation."
  [perm-type      :- :keyword
   required-level :- :keyword
   most-or-least  :- [:enum :most :least]]
  (let [agg-fn (case most-or-least
                 :most  :max
                 :least :min)
        ;; Build conditional: CASE WHEN dp.perm_type = ? THEN <int-case> END
        conditional-case [:case
                          [:= :dp.perm_type (h2x/literal perm-type)]
                          (perm-type-to-int-case perm-type :dp.perm_value)]]
    [(case most-or-least
       :most  :>=
       :least :<=)
     (if (= perm-type :perms/view-data)
       ;; Special handling for view-data permission priority
       (let [minimum-perm-value [agg-fn
                                 [:case
                                  [:= :dp.perm_type (h2x/literal perm-type)]
                                  [:case
                                   [:= :dp.perm_value [:inline "unrestricted"]] [:inline 0]
                                   [:= :dp.perm_value [:inline "blocked"]] [:inline 1]
                                   [:= :dp.perm_value [:inline "legacy-no-self-service"]] [:inline 2]]]]]
         [:case
          [:= minimum-perm-value [:inline 0]] [:inline 0]
          [:= minimum-perm-value [:inline 1]] [:inline 2]
          [:= minimum-perm-value [:inline 2]] [:inline 1]])
       [agg-fn conditional-case])
     (perm-type-to-int-inline perm-type required-level)]))

(mu/defn visible-table-filter-with-cte
  "Returns a map with :with (CTE definitions) and :clause (WHERE clause fragment) for filtering
   tables visible to the user. Uses a CTE to compute permitted table IDs once rather than using
   correlated subqueries, which provides better performance for large numbers of tables.

   The returned map can be merged into a query by adding :with to the query's :with vector
   and using :clause in the WHERE clause.

   Uses UNION ALL to separate table-level and database-level permission lookups, avoiding
   inefficient BitmapOr scans that occur with OR joins."
  [column-or-exp                    :- :any
   {:keys [user-id is-superuser?]} :- UserInfo
   permission-mapping               :- PermissionMapping]
  (if is-superuser?
    {:clause [:= [:inline 1] [:inline 1]]}
    (let [perm-types (keys permission-mapping)
          perm-type-filter (into [:or]
                                 (map (fn [pt] [:= :dp.perm_type (h2x/literal pt)])
                                      perm-types))
          having-conditions (into [:and]
                                  (map (fn [[perm-type perm-level]]
                                         (let [[level most-or-least] (if (sequential? perm-level)
                                                                       perm-level
                                                                       [perm-level :least])]
                                           (permission-type-having-clause perm-type level most-or-least)))
                                       permission-mapping))
          user-groups-clause (user-in-group-clause user-id)]
      {:with [;; First CTE: collect all permission grants that apply to each table
              [:table_permissions
               {:union-all
                [;; Table-level permissions (direct grant to table)
                 {:select [:mt.id :dp.perm_type :dp.perm_value]
                  :from   [[:data_permissions :dp]]
                  :join   [[:metabase_table :mt] [:= :mt.id :dp.table_id]]
                  :where  [:and
                           [:not= :dp.table_id nil]
                           user-groups-clause
                           perm-type-filter]}
                 ;; Database-level permissions (applies to all tables in db)
                 {:select [:mt.id :dp.perm_type :dp.perm_value]
                  :from   [[:data_permissions :dp]]
                  :join   [[:metabase_table :mt] [:= :mt.db_id :dp.db_id]]
                  :where  [:and
                           [:= :dp.table_id nil]
                           user-groups-clause
                           perm-type-filter]}]}]
              ;; Second CTE: aggregate and filter by permission requirements
              [:permitted_tables
               {:select   [:dp.id]
                :from     [[:table_permissions :dp]]
                :group-by [:dp.id]
                :having   having-conditions}]]
       :clause [:in column-or-exp {:select [:id] :from [:permitted_tables]}]})))

(mu/defn select-tables-and-groups-granting-perm
  "Selects table.id and the group.id of all permissions groups that give the provided user the provided permission level or a
  permission level either more or less restrictive than the supplied level."
  [{:keys [user-id is-superuser?]} :- UserInfo
   permission-mapping              :- PermissionMapping]
  {:select [:mt.id :dp.group_id :dp.perm_type :dp.perm_value]
   :from   [[:metabase_table :mt]]
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
             [:= [:inline 1] [:inline 1]]
             (into [:or]
                   (map (fn [[perm-type perm-level]]
                          (let [[level most-or-least] (cond-> perm-level
                                                        (not (sequential? perm-level)) vector)]
                            [:and
                             [:= :dp.perm_type (h2x/literal perm-type)]
                             [(case most-or-least
                                :most :<=
                                (:least nil) :>=)
                              (perm-type-to-int-inline perm-type level)
                              (perm-type-to-int-case perm-type :dp.perm_value)]]))
                        permission-mapping)))})

(mu/defn- has-perms-for-database-as-honey-sql?
  "Builds an EXISTS (SELECT ...) half-join to filter databases that a user has the required permissions for.
   Similar to has-perms-for-table-as-honey-sql? but specifically for database-level permissions."
  [user-id :- pos-int?
   perm-type :- :keyword
   required-level :- :keyword
   & [most-or-least :- [:maybe [:enum :most :least]]]]
  [:exists {:select [1]
            :from [[:data_permissions :dp]]
            :where [:and
                    [:= :dp.perm_type (h2x/literal perm-type)]
                    [:= :md.id :dp.db_id]
                    (user-in-group-clause user-id)]
            :group-by [:md.id]
            :having [(perm-condition perm-type required-level (or most-or-least :least))]}])

(mu/defn visible-database-filter-select
  "Selects database IDs that are visible to the provided user given a mapping of permission types to the required value.
   Similar to visible-table-filter-select but for databases."
  [{:keys [user-id is-superuser?]} :- UserInfo
   permission-mapping :- PermissionMapping]
  {:select [:md.id]
   :from [[:metabase_database :md]]
   :where (if is-superuser?
            [:= [:inline 1] [:inline 1]]
            (into [:and]
                  (mapcat (fn [[perm-type perm-level]]
                            [(apply has-perms-for-database-as-honey-sql?
                                    user-id perm-type (cond-> perm-level
                                                        (not (sequential? perm-level)) vector))]))
                  permission-mapping))})
