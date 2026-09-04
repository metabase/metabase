(ns metabase.collections-rest.db
  "Application database queries for the collections REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(defn other-users-personal-collection-ids
  "The ids of the personal Collections owned by Users other than `user-id`."
  [user-id]
  (t2/select-fn-set :id :model/Collection
                    {:where [:and [:!= :personal_owner_id nil] [:!= :personal_owner_id user-id]]}))

(defn- location-from-collection-id-clause
  "Clause to restrict which collections are being selected based off collection-id. If collection-id is nil,
   then restrict to the children and the grandchildren of the root collection. If collection-id is an an integer,
   then restrict to that collection's parents and children."
  [collection-id]
  (if collection-id
    [:and
     [:like :location (str "%/" collection-id "/%")]
     [:not [:like :location (str "%/" collection-id "/%/%/%")]]]
    [:not [:like :location "/%/%/"]]))

(defn collections-for-listing
  "The Collections the User with `current-user-id` can read, for the listing endpoint: archived or unarchived ones
  (`archived`), only those around `collection-id` when `shallow`, only personal ones when `personal-only`, only the
  user's own personal ones when `exclude-other-user-collections`, library ones only when `include-library?`, and
  those in `namespaces`; official and non-trash Collections first, then by name."
  [{:keys [archived exclude-other-user-collections namespaces shallow collection-id personal-only include-library?]}
   current-user-id]
  (t2/select :model/Collection
             {:where [:and
                      (case archived
                        nil nil
                        false [:and
                               [:not= :id (collection/trash-collection-id)]
                               [:not :archived]]
                        true [:or
                              [:= :id (collection/trash-collection-id)]
                              :archived])
                      (when shallow
                        (location-from-collection-id-clause collection-id))
                      (when personal-only
                        [:!= :personal_owner_id nil])
                      (when exclude-other-user-collections
                        [:or [:= :personal_owner_id nil] [:= :personal_owner_id current-user-id]])
                      (when-not include-library?
                        [:or [:= nil :type]
                         [:not-in :type [collection/library-collection-type
                                         collection/library-data-collection-type
                                         collection/library-metrics-collection-type]]])
                      [:or
                       (when (contains? namespaces nil)
                         [:= :namespace nil])
                       (when (seq namespaces)
                         [:in :namespace namespaces])]
                      (collection/visible-collection-filter-clause
                       :id
                       {:include-archived-items    (if archived
                                                     :only
                                                     :exclude)
                        :include-trash-collection? true
                        :permission-level          :read
                        :archive-operation-id      nil})]
              ;; Order NULL collection types first so that audit collections are last
              :order-by [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
                         [[[:case
                            [:= :type nil] 0
                            [:= :type collection/trash-collection-type] 1
                            :else 2]] :asc]
                         [:%lower.name :asc]]}))

(defn collection
  "The Collection with `id`, or nil."
  [id]
  (t2/select-one :model/Collection :id id))

(defn directly-archived-descendant-collections
  "The directly archived Collections whose location starts with `location-prefix`."
  [location-prefix]
  (t2/select :model/Collection :location [:like (str location-prefix "%")] :archived_directly true))

(defn update-collection!
  "Apply `changes` to the Collection with `id`."
  [id changes]
  (t2/update! :model/Collection id changes))

(defn delete-collection!
  "Delete the Collection with `id`."
  [id]
  (t2/delete! :model/Collection :id id))

(defn unarchived-card-collection-types-reducible
  "A reducible of the distinct Collection id and type of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:= :archived false]}))

(defn unarchived-card-collection-types-in-reducible
  "A reducible of the distinct Collection id and type of the unarchived Cards in the Collections with
  `collection-ids`, leaving out dashboard questions when `exclude-dashboard-questions?`."
  [collection-ids exclude-dashboard-questions?]
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:and
                                         (when exclude-dashboard-questions?
                                           [:= :dashboard_id nil])
                                         [:= :archived false]
                                         [:in :collection_id collection-ids]]}))

(defn published-table-collection-ids
  "The distinct `:collection_id`s of the published, unarchived Tables."
  []
  (t2/query {:select-distinct [:collection_id]
             :from :metabase_table
             :where [:and
                     [:= :is_published true]
                     [:= :archived_at nil]]}))

(defn published-table-collection-ids-in
  "The distinct `:collection_id`s of the published, unarchived Tables in the Collections with `collection-ids`."
  [collection-ids]
  (t2/query {:select-distinct [:collection_id]
             :from :metabase_table
             :where [:and
                     [:= :is_published true]
                     [:= :archived_at nil]
                     [:in :collection_id collection-ids]]}))

(defn transform-collection-ids-in
  "The distinct `:collection_id`s of the Transforms with one of `source-types` in the Collections with
  `collection-ids`."
  [collection-ids source-types]
  (t2/query {:select-distinct [:collection_id]
             :from :transform
             :where [:and
                     [:in :collection_id collection-ids]
                     [:in :source_type source-types]]}))

(defn unarchived-dashboard-collection-ids-in
  "The distinct `:collection_id`s of the unarchived Dashboards in the Collections with `collection-ids`."
  [collection-ids]
  (t2/query {:select-distinct [:collection_id]
             :from :report_dashboard
             :where [:and
                     [:= :archived false]
                     [:in :collection_id collection-ids]]}))

(defn top-level-cards-in-collection
  "The Cards in the Collection with `collection-id` that belong to no Dashboard, newest first."
  [collection-id]
  (t2/select :model/Card {:where [:and
                                  [:= :collection_id collection-id]
                                  [:= :dashboard_id nil]]
                          :order-by [[:id :desc]]}))
