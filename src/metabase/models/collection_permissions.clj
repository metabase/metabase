(ns metabase.models.collection-permissions
  (:require [toucan2.core :as t2]
            [metabase.models.collection :as collection]
            [metabase.api.common :as api]))

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

(require '[metabase.test :as mt])
(require '[metabase.api.common :as api])
(mt/with-test-user :rasta
  (time (do
          #_(prn (count @api/*current-user-permissions-set*))
          (clojure.pprint/print-table [:id :name]
                                      (t2/select :model/Dashboard
                     #_{:where (collection/visible-collection-ids->honeysql-filter-clause
                              (collection/permissions-set->visible-collection-ids
                               @api/*current-user-permissions-set*))}
                     {:where (honeysql-filter-clause (mt/user->id :rasta) {})})))))
