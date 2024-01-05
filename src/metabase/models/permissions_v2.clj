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

(methodical/defmethod t2/table-name :model/PermissionsV2 [_model] :permissions_v2)

(doto :model/PermissionsV2
  (derive :metabase/model))

(t2/deftransforms :model/PermissionsV2
  {:type mi/transform-keyword
   :value mi/transform-keyword})


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
  {:collection {:values [:curate :view :no-access]
                :model  :model/Collection}})

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

(defn- assert-required-object-id
  "Takes a permission type and a possibly-nil object ID, and throws an exception if the permission type requires an
  object ID and the object ID is nil."
  [perm-type object-id]
  (when (and (get-in Permissions [perm-type :model])
             (not object-id))
    (throw (ex-info (tru "Permission type {0} requires an object ID" perm-type)
                    {perm-type (Permissions perm-type)}))))

(defn- assert-value-matches-perm-type
  [perm-type perm-value]
  (when-not (contains? (set (get-in Permissions [perm-type :values])) perm-value)
    (throw (ex-info (tru "Permission type {0} cannot be set to {1}" perm-type perm-value)
                    {perm-type (Permissions perm-type)}))))

(def perm-types-by-model
  "A map from model identifiers to a list of permission types that apply to that model."
  (reduce-kv
   (fn [acc perm-type {:keys [model]}]
     (cond-> acc
       model (update model (fnil conj #{}) perm-type)))
   {}
   Permissions))

;;; ---------------------------------------- Fetching permissions -----------------------------------------------------

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

(mu/defn permission-for-user :- PermissionValue
  "Returns the effective permission value for a given user, permission type, and (optional) object ID. If the user has
  multiple permissions for the given type in different groups, they are coalesced into a single value."
  [user-id perm-type & [object-or-id]]
  (assert-required-object-id perm-type object-or-id)
  (when (t2/select-one-fn :is_superuser :model/User :id user-id)
    (most-permissive-value perm-type))
  (let [object-id (when object-or-id (u/the-id object-or-id))
        perm-values (t2/select-fn-set :value
                                      :model/PermissionsV2
                                      {:select [:p.value]
                                       :from [[:permissions_group_membership :pgm]]
                                       :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                                              [:permissions_v2 :p]     [:= :p.group_id :pg.id]]
                                       :where [:and
                                               [:= :pgm.user_id user-id]
                                               [:= :p.type (name perm-type)]
                                               (when object-id [:= :p.object_id object-id])]})]
    (or (coalesce perm-type perm-values)
        (least-permissive-value perm-type))))

#_(defn permissions-graph
    "Returns a map representing all permissions on the Metabase instance. Can be optionally be scoped by `group-id`
  and/or `perm-type`."
    [& {:keys [group-id perm-type]}]
    [group-id perm-type]
    (let [permissions (t2/select :model/PermissionsV2
                                 {:where [:and
                                          (when group-id [:= :group_id group-id])
                                          (when perm-type [:= :type (name perm-type)])]})]
      permissions))

(defn data-permissions-graph
  "Returns a tree representation of all data permissions on the instance."
  [user-id]
  (let [table-level-permissions
        (t2/select :model/PermissionsV2
                   {:select [:p.type :p.value [:p.object_id :table_id] [:mt.db_id :db-id] :mt.schema]
                    :from   [[:permissions_group_membership :pgm]]
                    :join   [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                             [:permissions_v2 :p]     [:= :p.group_id :pg.id]
                             [:metabase_table :mt]    [:and
                                                       [:= :mt.id :p.object_id]
                                                       [:in :p.type (map name (perm-types-by-model :model/Table))]]]
                    :where  [:= :pgm.user_id user-id]})
        db-level-permissions
        (t2/select :model/PermissionsV2
                   {:select [:p.type :p.value [:p.object_id :object-id] [:md.id :db_id]]
                    :from   [[:permissions_group_membership :pgm]]
                    :join   [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                             [:permissions_v2 :p]     [:= :p.group_id :pg.id]
                             [:metabase_database :md] [:and
                                                       [:= :md.id :p.object_id]
                                                       [:in :p.type (map name (perm-types-by-model :model/Database))]]]
                    :where  [:= :pgm.user_id user-id]})]
    ;; TODO: build graph
    [table-level-permissions db-level-permissions]))

;;; --------------------------------------------- Updating permissions ------------------------------------------------

(t2/define-before-insert :model/PermissionsV2
  [{perm-type :type, perm-value :value, object-id :object_id :as permission}]
  (when-not (mc/validate PermissionType perm-type)
    (throw (ex-info (str/join (mu/explain PermissionType perm-type)) permission)))
  (assert-value-matches-perm-type perm-type perm-value)
  (assert-required-object-id perm-type object-id)
  permission)


(def ^:private TheIdable
  [:or pos-int? [:map [:id pos-int?]]])

(mu/defn set-permission!
  "Sets a single permission to a specified value for a given group. Optionally takes an `object-or-id` representing the
  object (e.g. table or collection) that this permission applies to. If a permission value already exists for the
  specified group and object, it will be updated to the new value. Returns the number of permission rows added."
  [perm-type             :- :keyword
   group-or-group-id     :- TheIdable
   value                 :- :keyword
   & [object-or-group-id :- TheIdable]]
  (assert-value-matches-perm-type perm-type value)
  (t2/with-transaction [_conn]
    (let [group-id         (u/the-id group-or-group-id)
          object-id        (when object-or-group-id (u/the-id object-or-group-id))
          new-perm         {:type      perm-type
                            :group_id  group-id
                            :object_id object-id
                            :value     value}
          existing-perm-id (t2/select-one-pk :model/PermissionsV2
                                             :type perm-type
                                             :group_id group-id
                                             :object_id object-id)]
      (if existing-perm-id
        (t2/update! :model/PermissionsV2 existing-perm-id new-perm)
        (t2/insert! :model/PermissionsV2 new-perm)))))

(mu/defn set-permissions!
  "For a single group and permission type, sets permissions for multiple objects at once (e.g. tables or collections).
  Takes a map of `object-or-id` -> `value` pairs. Returns the number of permission rows added."
  [perm-type           :- :keyword
   group-id            :- pos-int?
   object-or-id->value :- [:map-of TheIdable :keyword]]
  (let [object-id->value (update-keys object-or-id->value u/the-id)
        permissions      (for [[object-id value] object-id->value]
                           {:type       perm-type
                            :group_id   group-id
                            :object_id  object-id
                            :value      value})]
    (t2/with-transaction [_conn]
      (t2/delete! :model/PermissionsV2
                  :type perm-type
                  :group_id group-id
                  {:where [:in :object_id (keys object-id->value)]})
      (t2/insert! :model/PermissionsV2 permissions))))


;; TODO
;; - Function that takes a DB and perm type, and sets permissions for all tables to a given value
;; - Similar function for a single schema


(comment
  (defn do-try-catch-message [thunk] (try (thunk) (catch Exception e (ex-message e))))
  (defmacro tcm [& body] `(do-try-catch-message (fn [] ~@body)))

  (set-permission! :data-access 1 :no-self-service 1)
  (set-permission! :data-access 1 :no-self-service {:id 2})
  (set-permission! :data-access {:id 1} :no-self-service 3)
  (set-permission! :data-access {:id 1} :no-self-service {:id 4})

  (= :no-self-service
     (permission-for-user 1 :data-access 1)
     (permission-for-user 1 :data-access {:id 1}))

  (set-permission! :settings-access 1 :no)

  (= :no (permission-for-user 1 :settings-access 1))

  (t2/delete! :model/PermissionsV2
              :type :data-access
              :group_id 1
              {:where [:in :object_id (keys {3 :unrestricted})]})

  (tcm (set-permission! :settings-access 1 :no-self-service))
  ;; => "Permission type :settings-access cannot be set to :no-self-service"

  (tcm (set-permission! :settings-access 1 :yes))
  ;; => "ERROR: insert or update on table \"permissions_v2\" violates foreign key constraint \"fk_permissions_v2_ref_permissions_group\"\n  Detail: Key (group_id)=(10) is not present in table \"permissions_group\"."

  )
