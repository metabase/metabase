(ns metabase.permissions.models.data-permissions.sql
  "Helper functions for models using data permissions to construct `visisble-query` methods from."
  (:require
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang PersistentVector)))

(set! *warn-on-reflection* true)

(defmulti perm-type-to-least-int-case
  "Converts a given `data-perm/PermissionType` keyword and either a column for a literal value into a case when ... then ... SQL statement
   that converts the given column or literal into the index of the value for provide permission type.

   For example, calling with perm-type :perms/view-data and a column :perm-value creates a SQL Statement like:

     ```sql
     CASE WHEN \"perm_value\" = 'unrestricted' THEN 0 ELSE ...
     ```
   This lets us write SQL statements to compare permissions values by their index position in the same way we do in the
   `data-perms/at-least-as-permissive?` function"
  {:arglists '([perm-type column])}
  (fn [perm-type _] perm-type))

(mu/defn- perm-type-to-int-case
  [perm-type     :- data-perms/PermissionType
   column        :- :keyword]
  (into [:case]
        (apply concat
               (map-indexed (fn [idx perm-value] [[:= column (h2x/literal perm-value)] [:inline idx]])
                            (-> data-perms/Permissions perm-type :values)))))

(mu/defmethod perm-type-to-least-int-case :default
  [perm-type     :- data-perms/PermissionType
   column        :- :keyword]
  [:min (perm-type-to-int-case perm-type column)])

(mu/defmethod perm-type-to-least-int-case :perms/view-data
  [_ :- data-perms/PermissionType
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
  [perm-type :- data-perms/PermissionType
   level :- data-perms/PermissionValue]
  (let [^PersistentVector values (-> data-perms/Permissions perm-type :values)]
    [:inline (.indexOf values level)]))

(mu/defn- perm-type-to-most-int-case
  [perm-type     :- data-perms/PermissionType
   column        :- :keyword]
  [:max (perm-type-to-int-case perm-type column)])

(mu/defn- perm-condition
  [perm-type      :- :keyword
   required-level :- :keyword
   most-or-least  :- [:enum :most :least]]
  [:<=
   (case most-or-least
     :most  (perm-type-to-most-int-case perm-type :dp.perm_value)
     :least (perm-type-to-least-int-case perm-type :dp.perm_value))
   (perm-type-to-int-inline perm-type required-level)])

(mu/defn- user-in-group-half-join
  [user-id :- pos-int?]
  [:exists {:select [1]
            :from   [[:permissions_group :pg]]
            :where  [:and
                     [:= :pg.id :dp.group_id]
                     [:exists {:select [1]
                               :from [[:permissions_group_membership :pgm]]
                               :where [:and
                                       [:= :pgm.group_id :pg.id]
                                       [:= :pgm.user_id [:inline user-id]]]}]]}])

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
                     (user-in-group-half-join user-id)]
            :group-by [:mt.id]
            :having   [(perm-condition perm-type required-level (or most-or-least :least))]}])

(def UserInfo
  "The user-id to use in the visiblity query and their superuser status."
  [:map
   [:user-id       pos-int?]
   [:is-superuser? :boolean]])

(def PermissionMapping
  "Map of permission-type to either a permission value or tuple of (permission-value, :most/:least) indicating if we want to get the
  most or least restrictive permission a user has in any of the groups they are a member of. If that value is left out we will assume we
  want the least restrict permission value."
  [:map-of
   data-perms/PermissionType
   [:or data-perms/PermissionValue [:tuple data-perms/PermissionValue [:enum :most :least]]]])

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
