(ns metabase.models.data-permissions
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/DataPermissions
  (derive :metabase/model))

(methodical/defmethod t2/table-name :model/DataPermissions [_model] :data_permissions)

(t2/deftransforms :model/DataPermissions
  {:perm_type  mi/transform-keyword
   :perm-type  mi/transform-keyword
   :perm_value mi/transform-keyword
   ;; define keyword transformation for :type and :value as well so that we can use them as aliases
   :type       mi/transform-keyword
   :value      mi/transform-keyword})


;;; ---------------------------------------- Permission definitions ---------------------------------------------------

;; IMPORTANT: If you add a new permission type, `:values` must be ordered from *most* permissive to *least* permissive.
;;
;;  - When fetching a user's permissions, the default behavior is to return the *most* permissive value from any group the
;;    user is in. This can be overridden by definding a custom implementation of `coalesce`.
;;
;;  - If a user does not have any value for the permission when it is fetched, the *least* permissive value is used as a
;;    fallback.


(def Permissions
  "Permissions which apply to individual databases or tables"
  {:perms/data-access           {:model :model/Table :values [:unrestricted :no-self-service :block]}
   :perms/download-results      {:model :model/Table :values [:one-million-rows :ten-thousand-rows :no]}
   :perms/manage-table-metadata {:model :model/Table :values [:yes :no]}

   :perms/native-query-editing  {:model :model/Database :values [:yes :no]}
   :perms/manage-database       {:model :model/Database :values [:yes :no]}})

(def PermissionType
  "Malli spec for valid permission types."
  (into [:enum {:error/message "Invalid permission type"}]
        (keys Permissions)))

(def PermissionValue
  "Malli spec for a keyword that matches any value in [[Permissions]]."
  (into [:enum {:error/message "Invalid permission value"}]
        (distinct (mapcat :values (vals Permissions)))))


;;; ------------------------------------------- Misc Utils ------------------------------------------------------------

(defn least-permissive-value
  "The *least* permissive value for a given perm type. This value is used as a fallback when a user does not have a
  value for the permission in the database."
  [perm-type]
  (-> Permissions perm-type :values last))

(defn most-permissive-value
  "The *most* permissive value for a given perm type. This is the default value for superusers."
  [perm-type]
  (-> Permissions perm-type :values first))

(def ^:private model-by-perm-type
  "A map from permission types directly to model identifiers (or `nil`)."
  (update-vals Permissions :model))

(defn- assert-value-matches-perm-type
  [perm-type perm-value]
  (when-not (contains? (set (get-in Permissions [perm-type :values])) perm-value)
    (throw (ex-info (tru "Permission type {0} cannot be set to {1}" perm-type perm-value)
                    {perm-type (Permissions perm-type)}))))


;;; ---------------------------------------- Fetching a user's permissions --------------------------------------------

(defmulti coalesce
  "Coalesce a set of permission values into a single value. This is used to determine the permission to enforce for a
  user in multiple groups with conflicting permissions. By default, this returns the *most* permissive value that the
  user has in any group.

  For instance,
  - Given an empty set, we return the most permissive.
    (coalesce :settings-access #{}) => :yes
  - Given a set with values, we select the most permissive option in the set.
    (coalesce :settings-access #{:view :no-access}) => :view"
  {:arglists '([perm-type perm-values])}
  (fn [perm-type _perm-values] perm-type))

(defmethod coalesce :default
  [perm-type perm-values]
  (let [ordered-values (-> Permissions perm-type :values)]
    (first (filter (set perm-values) ordered-values))))

(mu/defn database-permission-for-user :- PermissionValue
  "Returns the effective permission value for a given user, permission type, and database ID. If the user has
  multiple permissions for the given type in different groups, they are coalesced into a single value."
  [user-id perm-type database-id]
  (when (not= :model/Database (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is a table-level permission." perm-type)
                    {perm-type (Permissions perm-type)})))
  (if (t2/select-one-fn :is_superuser :model/User :id user-id)
    (most-permissive-value perm-type)
    (let [perm-values (t2/select-fn-set :value
                                        :model/DataPermissions
                                        {:select [[:p.perm_value :value]]
                                         :from [[:permissions_group_membership :pgm]]
                                         :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                                                [:data_permissions :p]   [:= :p.group_id :pg.id]]
                                         :where [:and
                                                 [:= :pgm.user_id user-id]
                                                 [:= :p.perm_type (u/qualified-name perm-type)]
                                                 [:= :p.db_id database-id]]})]
      (or (coalesce perm-type perm-values)
          (least-permissive-value perm-type)))))

(mu/defn table-permission-for-user :- PermissionValue
  "Returns the effective permission value for a given user, permission type, and database ID, and table ID. If the user
  has multiple permissions for the given type in different groups, they are coalesced into a single value."
  [user-id perm-type database-id table-id]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is a table-level permission." perm-type)
                    {perm-type (Permissions perm-type)})))
  (if (t2/select-one-fn :is_superuser :model/User :id user-id)
    (most-permissive-value perm-type)
    (let [perm-values (t2/select-fn-set :value
                                        :model/DataPermissions
                                        {:select [[:p.perm_value :value]]
                                         :from [[:permissions_group_membership :pgm]]
                                         :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                                                [:data_permissions :p]   [:= :p.group_id :pg.id]]
                                         :where [:and
                                                 [:= :pgm.user_id user-id]
                                                 [:= :p.perm_type (u/qualified-name perm-type)]
                                                 [:= :p.db_id database-id]
                                                 [:or
                                                  [:= :table_id table-id]
                                                  [:= :table_id nil]]]})]
      (or (coalesce perm-type perm-values)
          (least-permissive-value perm-type)))))

(mu/defn data-permissions-graph-for-user
  "Returns a permissions graph for a single user."
  [user-id & {:keys [db-id perm-type]}]
  (let [data-perms    (t2/select :model/DataPermissions
                                 {:select [[:p.perm_type :perm-type]
                                           [:p.group_id :group-id]
                                           [:p.perm_value :value]
                                           [:p.db_id :db-id]
                                           [:p.table_id :table-id]]
                                  :from [[:permissions_group_membership :pgm]]
                                  :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                                         [:data_permissions :p]   [:= :p.group_id :pg.id]]
                                  :where [:and
                                          [:= :pgm.user_id user-id]
                                          (when db-id [:= :db_id db-id])
                                          (when perm-type [:= :perm_type (u/qualified-name perm-type)])]})
        grouped-perms (group-by (fn [{:keys [db-id perm-type table-id]}]
                                  (if table-id
                                    [db-id perm-type table-id]
                                    [db-id perm-type]))
                                data-perms)
        coalesced-perms (reduce-kv
                         (fn [result path perms]
                           ;; Coalesce the values for permissions set in multiple groups for the same user
                           (let [[db-id perm-type] path
                                 coalesced-perms (coalesce perm-type
                                                           (concat
                                                            (map :value perms)
                                                            (map :value (get grouped-perms [db-id perm-type]))))]
                             (assoc result path coalesced-perms)))
                         {}
                         grouped-perms)
        granular-graph  (reduce
                         (fn [graph [[db-id perm-type table-id] value]]
                           (let [current-perms (get-in graph [db-id perm-type])
                                 updated-perms (if table-id
                                                 (if (keyword? current-perms)
                                                   {table-id value}
                                                   (assoc current-perms table-id value))
                                                 (if (map? current-perms)
                                                   current-perms
                                                   value))]
                             (assoc-in graph [db-id perm-type] updated-perms)))
                         {}
                         coalesced-perms)]
    (reduce (fn [new-graph [db-id perms]]
              (assoc new-graph db-id
                     (reduce (fn [new-perms [perm-type value]]
                               (if (and (map? value)
                                        (apply = (vals value)))
                                 (assoc new-perms perm-type (first (vals value)))
                                 (assoc new-perms perm-type value)))
                             {}
                             perms)))
            {}
            granular-graph)))


;;; ---------------------------------------- Fetching the data permissions graph --------------------------------------

(comment
  ;; General hierarchy of the data access permissions graph
  {#_:group-id 1
   {#_:db-id 1
    {#_:perm-type :perms/data-access
     {#_:schema-name "PUBLIC"
      {#_:table-id 1 :unrestricted}}}}})

(defn data-permissions-graph
  "Returns a tree representation of all data permissions. Can be optionally filtered by group ID, database ID,
  and/or permission type. This is intended to power the permissions editor in the admin panel, and should not be used
  for permission enforcement, as it will read much more data than necessary."
  [& {:keys [group-id db-id perm-type]}]
  (let [data-perms (t2/select [:model/DataPermissions
                               [:perm_type :type]
                               [:group_id :group-id]
                               [:perm_value :value]
                               [:db_id :db-id]
                               [:schema_name :schema]
                               [:table_id :table-id]]
                              {:where [:and
                                       (when db-id [:= :db_id db-id])
                                       (when group-id [:= :group_id group-id])
                                       (when perm-type [:= :perm_type (u/qualified-name perm-type)])]})]
    (reduce
     (fn [graph {group-id  :group-id
                 perm-type :type
                 value     :value
                 db-id     :db-id
                 schema    :schema
                 table-id  :table-id}]
       (let [schema   (or schema "")
             path     (if table-id
                        [group-id db-id perm-type schema table-id]
                        [group-id db-id perm-type])]
         (assoc-in graph path value)))
     {}
     data-perms)))


;;; --------------------------------------------- Updating permissions ------------------------------------------------

(defn- assert-valid-permission
  [{:keys [perm_type perm_value] :as permission}]
  (when-not (mc/validate PermissionType perm_type)
    (throw (ex-info (str/join (mu/explain PermissionType perm_type)) permission)))
  (assert-value-matches-perm-type perm_type perm_value))

(t2/define-before-insert :model/DataPermissions
  [permission]
  (assert-valid-permission permission)
  permission)

(t2/define-before-update :model/DataPermissions
  [permission]
  (assert-valid-permission permission)
  permission)

(def ^:private TheIdable
  "An ID, or something with an ID."
  [:or pos-int? [:map [:id pos-int?]]])

(mu/defn set-database-permission!
  "Sets a single permission to a specified value for a given group and database. If a permission value already exists
  for the specified group and object, it will be updated to the new value.

  Block permissions (i.e. :perms/data-access :block) can only be set at the database-level, despite :perms/data-access
  being a table-level permission."
  [group-or-id :- TheIdable
   db-or-id    :- TheIdable
   perm-type   :- :keyword
   value       :- :keyword]
  (t2/with-transaction [_conn]
    (let [group-id (u/the-id group-or-id)
          db-id    (u/the-id db-or-id)]
      (t2/delete! :model/DataPermissions :perm_type perm-type :group_id group-id :db_id db-id)
      (t2/insert! :model/DataPermissions {:perm_type  perm-type
                                          :group_id   group-id
                                          :perm_value value
                                          :db_id      db-id})
      (when (= [:perms/data-access :block] [perm-type value])
        (set-database-permission! group-or-id db-or-id :perms/native-query-editing :no)))))

(mu/defn set-table-permissions!
  "Sets table permissions to specified values for a given group. If a permission value already exists for a specified
  group and table, it will be updated to the new value.

  `table-perms` is a map from tables or table ID to the permission value for each table. All tables in the list must
  belong to the same database.

  If this permission is currently set at the database-level, the database-level permission
  is removed and table-level rows are are added for all of its tables. Similarly, if setting a table-level permission to a value
  that results in all of the database's tables having the same permission, it is replaced with a single database-level row."
  [group-or-id :- TheIdable
   perm-type   :- :keyword
   table-perms :- [:map-of TheIdable :keyword]]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} cannot be set on tables." perm-type)
                    {perm-type (Permissions perm-type)})))
  (let [values (set (vals table-perms))]
    (when (values :block)
      (throw (ex-info (tru "Block permissions must be set at the database-level only.")
                      {})))
    (t2/with-transaction [_conn]
      (let [group-id               (u/the-id group-or-id)
            new-perms              (map (fn [[table value]]
                                          (let [{:keys [id db_id schema]}
                                                (if (map? table)
                                                  table
                                                  (t2/select-one [:model/Table :id :db_id :schema] :id table))]
                                            {:perm_type   perm-type
                                             :group_id    group-id
                                             :perm_value  value
                                             :db_id       db_id
                                             :table_id    id
                                             :schema_name schema}))
                                        table-perms)
            _                      (when (not= (count (set (map :db_id new-perms))) 1)
                                     (throw (ex-info (tru "All tables must belong to the same database.")
                                                     {:new-perms new-perms})))
            table-ids              (map :table_id new-perms)
            db-id                  (:db_id (first new-perms))
            existing-db-perm       (t2/select-one :model/DataPermissions
                                                  {:where
                                                   [:and
                                                    [:= :perm_type (u/qualified-name perm-type)]
                                                    [:= :group_id  group-id]
                                                    [:= :db_id     db-id]
                                                    [:= :table_id  nil]]})
            existing-db-perm-value (:perm_value existing-db-perm)]
        (if existing-db-perm
          (when (not= values #{existing-db-perm-value})
            ;; If we're setting any table permissions to a value that is different from the database-level permission,
            ;; we need to replace it with individual permission rows for every table in the database instead.
            (let [other-tables    (t2/select :model/Table {:where [:and
                                                                   [:= :db_id db-id]
                                                                   [:not [:in :id table-ids]]]})
                  other-new-perms (map (fn [table]
                                         {:perm_type   perm-type
                                          :group_id    group-id
                                          :perm_value  existing-db-perm-value
                                          :db_id       db-id
                                          :table_id    (:id table)
                                          :schema_name (:schema table)})
                                       other-tables)]
              (t2/delete! :model/DataPermissions :id (:id existing-db-perm))
              (t2/insert! :model/DataPermissions (concat other-new-perms new-perms))))
          (let [existing-table-perms (t2/select :model/DataPermissions
                                                :perm_type (u/qualified-name perm-type)
                                                :group_id  group-id
                                                :db_id     db-id
                                                {:where [:and
                                                         [:not= :table_id nil]
                                                         [:not [:in :table_id table-ids]]]})
                existing-table-values (set (map :perm_value existing-table-perms))]
            (if (and (= (count existing-table-values) 1)
                     (= values existing-table-values))
              ;; If all tables would have the same permissions after we update these ones, we can replace all of the table
              ;; perms with a DB-level perm instead.
              (set-database-permission! group-or-id db-id perm-type (first values))
              ;; Otherwise, just replace the rows for the individual table perm
              (do
                (t2/delete! :model/DataPermissions :perm_type perm-type :group_id group-id {:where [:in :table_id table-ids]})
                (t2/insert! :model/DataPermissions new-perms)))))))))

(mu/defn set-table-permission!
  "Sets permissions for a single table to the specified value for a given group."
  [group-or-id :- TheIdable
   table-or-id :- TheIdable
   perm-type   :- :keyword
   value       :- :keyword]
  (set-table-permissions! group-or-id perm-type {table-or-id value}))
