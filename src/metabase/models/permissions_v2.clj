(ns metabase.models.permissions-v2
  "Model namespace for the V2 permissions system. This is not based on permission paths (as in V1), but rather explicit
  permission types and associated values for every object (table/collection) or capability on the system."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/PermissionsV2
  (derive :metabase/model))

(methodical/defmethod t2/table-name :model/PermissionsV2 [_model] :permissions_v2)

(t2/deftransforms :model/PermissionsV2
  {:type       mi/transform-keyword
   :perm_value mi/transform-keyword
   ;; define keyword transformation for :value as well so that we can use it as an alias for :perm_value
   :value      mi/transform-keyword})


;;; ---------------------------------------- Permission definitions ---------------------------------------------------

;; IMPORTANT: If you add a new permission type, `:values` must be ordered from *most* permissive to *least* permissive.
;;
;;  - When fetching a user's permissions, the default behavior is to return the *most* permissive value from any group the
;;    user is in. This can be overridden by definding a custom implementation of `coalesce`.
;;
;;  - If a user does not have any value for the permission when it is fetched, the *least* permissive value is used as a
;;    fallback.


(def ^:private DataPermissions
  "Permissions which apply to individual databases or tables"
  {:data-access           {:model :model/Table :values [:unrestricted :no-self-service :block]}
   :download-results      {:model :model/Table :values [:one-million-rows :ten-thousand-rows :no]}
   :manage-table-metadata {:model :model/Table :values [:yes :no]}

   :native-query-editing {:model :model/Database :values [:yes :no]}
   :manage-database      {:model :model/Database :values [:yes :no]}})

(def ^:private CollectionPermissions
  "Permissions which apply to collections"
  {:collection {:model :model/Collection :values [:curate :view :no-access]}})

(def ^:private ApplicationPermissions
  "Permissions which apply to the application as a whole, rather than being linked to a specific model"
  {:settings-access          {:values [:yes :no]}
   :monitoring-access        {:values [:yes :no]}
   :subscriptions-and-alerts {:values [:yes :no]}})

(def ^:private Permissions
  (merge DataPermissions
         CollectionPermissions
         ApplicationPermissions))

(def PermissionType
  "Malli spec for valid permission types."
  (into [:enum {:error/message "Invalid permission type"}]
        (keys Permissions)))

(def PermissionValue
  "Malli spec for a keyword that matches any value in [[Permissions]]."
  (into [:enum {:error/message "Invalid permission value"}]
        (distinct (mapcat :values (vals Permissions)))))


;;; ------------------------------------------- Misc Utils ------------------------------------------------------------

(defn- least-permissive-value
  "The *least* permissive value for a given perm type. This value is used as a fallback when a user does not have a
  value for the permission in the database."
  [perm-type]
  (-> Permissions perm-type :values last))

(defn- most-permissive-value
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

(defn- assert-required-object-id
 "Takes a permission type and a possibly-nil object ID, and throws an exception if the permission type requires an
  object ID and the object ID is nil."
  [perm-type object-id]
  (let [model (model-by-perm-type perm-type)]
    (when (and model
               (not (#{:model/Database :model/Table} model))
               (not object-id))
      (throw (ex-info (tru "Permission type {0} requires an object ID" perm-type)
                      {perm-type (Permissions perm-type)})))))

(defn- assert-required-db-id
  [perm-type db-id]
  (when (and (#{:model/Database :model/Table} (model-by-perm-type perm-type))
             (nil? db-id))
    (throw (ex-info (tru "Permission type {0} requires a database ID" perm-type)
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
    (def ordered-values ordered-values)
    (first (filter (set perm-values) ordered-values))))

(mu/defn permission-for-user :- PermissionValue
  "Returns the effective permission value for a given user, permission type, and (optional) object ID. If the user has
  multiple permissions for the given type in different groups, they are coalesced into a single value."
  [user-id perm-type & [object-or-id]]
  (let [object-id (u/id object-or-id)
        db-perm?  (= :model/Database (model-by-perm-type perm-type))]
    (assert-required-object-id perm-type object-id)
    (assert-required-db-id perm-type object-id)
    (when (t2/select-one-fn :is_superuser :model/User :id user-id)
      (most-permissive-value perm-type))
    (let [perm-values (t2/select-fn-set :value
                                        :model/PermissionsV2
                                        {:select [[:p.perm_value :value]]
                                         :from [[:permissions_group_membership :pgm]]
                                         :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                                                [:permissions_v2 :p]     [:= :p.group_id :pg.id]]
                                         :where [:and
                                                 [:= :pgm.user_id user-id]
                                                 [:= :p.type (name perm-type)]
                                                 (when object-id
                                                   (if db-perm?
                                                    [:= :p.db_id object-id]
                                                    [:= :p.object_id object-id]))]})]

      (or (coalesce perm-type perm-values)
          (least-permissive-value perm-type)))))


;;; ---------------------------------------- Fetching the data permissions graph --------------------------------------

(comment
  ;; General hierarchy of the data access permissions graph
  {#_:group-id 1
   {#_:db-id 1
    {#_:perm-type :data-access
     {#_:schema-name "PUBLIC"
      {#_:table-id 1 :unrestricted}}}}})

(defn data-permissions-graph
  "Returns a tree representation of all data permissions. Can be optionally filtered by group ID, database ID,
  and/or permission type. This is intended to power the permissions editor in the admin panel, and should not be used
  for permission enforcement, as it will read much more data than necessary."
  [& {:keys [group-id db-id perm-type]}]
  (let [data-perms (t2/select [:model/PermissionsV2
                               :type
                               [:group_id :group-id]
                               [:perm_value :value]
                               [:db_id :db-id]
                               :schema
                               [:table_id :table-id]]
                              {:where [:and
                                       (when db-id [:= :db_id db-id])
                                       (when group-id [:= :group_id group-id])
                                       (when perm-type [:= :type (name perm-type)])]})]
    (reduce
     (fn [graph {group-id  :group-id
                 perm-type :type
                 value     :value
                 db-id     :db-id
                 schema    :schema
                 table-id  :table-id}]
       (let [schema   (or schema "")
             db-perm? (= :model/Database (model-by-perm-type perm-type))
             path     (if db-perm?
                        [group-id db-id perm-type]
                        [group-id db-id perm-type schema table-id])]
         (assoc-in graph path value)))
     {}
     data-perms)))


;;; --------------------------------------------- Updating permissions ------------------------------------------------

(defn- assert-valid-permission
  [{:keys [type perm_value object_id db_id] :as permission}]
  (when-not (mc/validate PermissionType type)
    (throw (ex-info (str/join (mu/explain PermissionType type)) permission)))
  (assert-value-matches-perm-type type perm_value)
  (assert-required-object-id type object_id)
  (assert-required-db-id type db_id))

(t2/define-before-insert :model/PermissionsV2
  [permission]
  (assert-valid-permission permission)
  permission)

(t2/define-before-update :model/PermissionsV2
  [permission]
  (assert-valid-permission permission)
  permission)

(def ^:private TheIdable
  "An ID, or something with an ID."
  [:or pos-int? [:map [:id pos-int?]]])

(mu/defn set-permission!
  "Sets a single permission to a specified value for a given group.

  For permissions set at the database, table, or collection-level, this function takes an additional `object-or-id`
  argument which indicates the ID of the model to which this permission value applies.

  For permissions set at the table-level, this function also requires `db-or-id` and `schema` to be passed in, in
  addition to `object-or-id`.

  If a permission value already exists for the specified group and object, it will be updated to the new value. Returns
  the number of permission rows added."
  [perm-type       :- :keyword
   group-or-id     :- TheIdable
   value           :- :keyword
   & [object-or-id :- [:maybe TheIdable]
      db-or-id     :- [:maybe TheIdable]
      schema       :- [:maybe :string]]]
  (t2/with-transaction [_conn]
    (let [group-id         (u/the-id group-or-id)
          db-id            (u/id db-or-id)
          db-perm?         (= :model/Database (model-by-perm-type perm-type))
          table-perm?      (= :model/Table (model-by-perm-type perm-type))
                           ;; Set object-id for non-data permissions; otherwise store that value in db_id or table_id
                           ;; depending on the permission type.
          object-id        (when-not (or db-perm? table-perm?) (u/id object-or-id))
          db-id            (if db-perm? (u/id object-or-id) db-id)
          table-id         (when table-perm? (u/id object-or-id))
          existing-perm-id (t2/select-one-pk :model/PermissionsV2
                                             :type      perm-type
                                             :group_id  group-id
                                             :object_id object-id
                                             :db_id     db-id
                                             :table_id  table-id)
          new-perm         {:type       perm-type
                            :group_id   group-id
                            :object_id  object-id
                            :perm_value value
                            :db_id      db-id
                            :table_id   table-id
                            :schema     schema}]
      (if existing-perm-id
        (t2/update! :model/PermissionsV2 existing-perm-id new-perm)
        (t2/insert! :model/PermissionsV2 new-perm)))))
