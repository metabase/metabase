(ns metabase.models.collection-permissions
  (:require [metabase.api.common :as api]
            [metabase.models.collection :as collection]
            [metabase.models.collection.root :refer [is-root-collection?]]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.permissions.util :as perms.u]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.malli :as mu]
            [metabase.util.malli.schema :as ms]
            [methodical.core :as methodical]
            [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CollectionPermissions [_model] :collection_permissions)

(t2/deftransforms :model/CollectionPermissions
  {:perm_type  mi/transform-keyword
   :perm_value mi/transform-keyword})

(defn- has-root-access?
  [user-id namespace]
  (t2/exists? :model/CollectionPermissions
              {:select [[:cp.*]]
               :from [[:collection_permissions :cp]]
               :join [[:permissions_group :pg]
                      [:= :pg.id :cp.group_id]

                      [:permissions_group_membership :pgm]
                      [:and
                       [:= :pgm.group_id :pg.id]
                       [:= :pgm.user_id user-id]]]
               :where [:and
                       [:= :cp.collection_id nil]
                       [:= :cp.collection_namespace namespace]]}))

(defn- non-root-query
  [user-id {:keys [include-archived-items
                   include-trash-collection?
                   archive-operation-id
                   permission-level]}]
  {:select :*
   :from [[{:union-all [{:select [:coll.id]
                         :from [[:collection :coll]]
                         :join [[:collection_permissions :cp]
                                [:and
                                 [:= :cp.collection_id :coll.id]
                                 [:= :cp.perm_type "perms/access"]
                                 [:in :cp.perm_value (case permission-level
                                                       :write #{"read-and-write"}
                                                       :read #{"read" "read-and-write"})]]

                                [:permissions_group :pg]
                                [:= :pg.id :cp.group_id]

                                [:permissions_group_membership :pgm]
                                [:and
                                 [:= :pgm.group_id :pg.id]
                                 [:= :pgm.user_id user-id]]]

                         :where [:and
                                 (case include-archived-items
                                   :exclude [:not :coll.archived]
                                   :only :coll.archived
                                   :all nil)
                                 (when-not include-trash-collection?
                                   [:or [:= :coll.type nil] [:not= :coll.type "trash"]])
                                 (when archive-operation-id
                                   [:= :coll.archive_operation_id archive-operation-id])]}
                        {:select [:coll.id]
                         :from [[:collection :coll]]
                         :where [:in :id (collection/user->personal-collection-and-descendant-ids
                                          user-id)]}]}]]})

(defn honeysql-filter-clause
  [user-id {:keys [collection-id-field
                   namespace]
            :or {collection-id-field :collection_id}
            :as config}]
  (let [config (merge
                {:collection-id-field :collection_id
                 :include-archived-items :exclude
                 :include-trash-collection? true
                 :archive-operation-id nil
                 :permission-level :read}
                config)
        has-root-access? (has-root-access? user-id namespace)
        root-clause (when has-root-access?
                      [:= collection-id-field nil])
        non-root-clause [:in collection-id-field
                         (non-root-query user-id config)]]
    (cond
      (and root-clause non-root-clause)
      [:or root-clause non-root-clause]

      (or root-clause non-root-clause)
      (or root-clause non-root-clause)

      :else
      false)))

(defn- is-personal-collection-or-descendant-of-one? [collection]
  (collection/is-personal-collection-or-descendant-of-one? collection))

(defn- is-trash-or-descendant? [collection]
  (collection/is-trash-or-descendant? collection))

(defn- ^:private collection-or-id->collection
  [collection-or-id]
  (if (map? collection-or-id)
    collection-or-id
    (t2/select-one :model/Collection :id (u/the-id collection-or-id))))

(def ^:private MapOrID
  [:or :map ms/PositiveInt])

(mu/defn- check-is-modifiable-collection
  "Check whether `collection-or-id` refers to a collection that can have permissions modified. Personal collections, the
  Trash, and descendants of those can't have their permissions modified."
  [collection-or-id :- MapOrID]
  ;; skip the whole thing for the root collection, we know it's not a personal collection, trash, or descendant of one
  ;; of them.
  (when-not (:metabase.models.collection.root/is-root? collection-or-id)
    (let [collection (collection-or-id->collection collection-or-id)]
      ;; Check whether the collection is the Trash collection or a descendant thereof; if so, throw an Exception. This
      ;; is done because you can't modify the permissions of things in the Trash, you need to untrash them first.
      (when (is-trash-or-descendant? collection)
        (throw (ex-info (tru "You cannot edit permissions for the Trash collection or its descendants.") {})))
      ;; Check whether the collection is a personal collection or a descendant thereof; if so, throw an Exception.
      ;; This is done because we *should* never be editing granting/etc. permissions for *Personal* Collections to
      ;; entire Groups! Their owner will get implicit permissions automatically, and of course admins will be able to
      ;; see them,but a whole group should never be given some sort of access.
      (when (is-personal-collection-or-descendant-of-one? collection)
        (throw (ex-info (tru "You cannot edit permissions for a Personal Collection or its descendants.") {}))))))

(defn- set-collection-permission!
  [group-or-id collection-or-id perm-type value]
  (prn :HERE group-or-id collection-or-id perm-type value)
  (check-is-modifiable-collection collection-or-id)
  (let [collection (collection-or-id->collection collection-or-id)
        collection-id (when-not (is-root-collection? collection)
                        (u/the-id collection))]
    (t2/delete! :model/CollectionPermissions
                :group_id (u/the-id group-or-id)
                :collection_id collection-id
                :collection_namespace (:namespace collection)
                :perm_type perm-type)
    #p (t2/insert! :model/CollectionPermissions
                :group_id #p (u/the-id group-or-id)
                :collection_id #p collection-id
                :collection_namespace #p (:namespace collection)
                :perm_type #p perm-type
                :perm_value #p value)))

(mu/defn revoke!
  "Revoke all access for `group-or-id` to a Collection."
  [group-or-id :- MapOrID collection-or-id :- MapOrID]
  (set-collection-permission! group-or-id collection-or-id :perms/access :no))

(mu/defn grant-readwrite!
  "Grant full access to a Collection, which means a user can view all Cards in the Collection and add/remove Cards."
  [group-or-id :- MapOrID collection-or-id :- MapOrID]
  (set-collection-permission! group-or-id collection-or-id :perms/access :read-and-write))

(mu/defn grant-read!
  "Grant read access to a Collection, which means a user can view all Cards in the Collection."
  [group-or-id :- MapOrID collection-or-id :- MapOrID]
  (set-collection-permission! group-or-id collection-or-id :perms/access :read))

(defn permissions-set
  "Translates the new-style collection permissions into the old-style permissions objects."
  [user-or-id]
  (set (when-let [user-id (u/the-id user-or-id)]
         (concat
          ;; Current User always gets readwrite perms for their Personal Collection and for its descendants! (1 DB Call)
          (map perms/collection-readwrite-path (collection/user->personal-collection-and-descendant-ids user-or-id))

          (->> (t2/select-fn-set (fn [{:keys [perm_value collection_id collection_namespace]}]
                                   (let [readwrite-path
                                         (if-not (nil? collection_id)
                                           (format "/collection/%d/" collection_id)
                                           (if collection_namespace
                                             (format "/collection/namespace/%s/root/" (perms.u/escape-path-component (u/qualified-name collection_namespace)))
                                             "/collection/root/"))]
                                     (case perm_value
                                       :read-and-write readwrite-path
                                       :read (str readwrite-path "read/")
                                       nil)))
                                 :model/CollectionPermissions
                                 {:select [:cp.perm_value :cp.collection_id]
                                  :from [[:collection_permissions :cp]]
                                  :join [[:permissions_group :pg] [:= :pg.id :cp.group_id]
                                         [:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]]
                                  :where [:= :pgm.user_id user-id]})
               (filter some?))))))

;; (require '[metabase.test :as mt])
;; (require '[metabase.api.common :as api])
#_(mt/with-test-user :rasta
  (time (do
          #_(prn (count @api/*current-user-permissions-set*))
          (clojure.pprint/print-table [:id :name]
                                      (t2/select :model/Dashboard
                     #_{:where (collection/visible-collection-ids->honeysql-filter-clause
                              (collection/permissions-set->visible-collection-ids
                               @api/*current-user-permissions-set*))}
                     {:where (honeysql-filter-clause (mt/user->id :rasta) {})})))))
