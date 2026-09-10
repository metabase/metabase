(ns metabase-enterprise.embedding-hub.db
  "Application database queries for the embedding-hub module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn user-database-exists?
  "Whether a non-sample, non-audit Database exists."
  []
  (t2/exists? :model/Database {:where [:and
                                       [:= :is_sample false]
                                       [:= :is_audit false]]}))

(defn sample-database-id
  "The ID of the sample Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(defn upload-table-exists-in-database?
  "Whether the Database with `database-id` holds an active uploaded Table."
  [database-id]
  (t2/exists? :model/Table {:where [:and
                                    [:= :active true]
                                    [:= :is_upload true]
                                    [:= :db_id database-id]]}))

(defn user-dashboard-exists?
  "Whether an unarchived Dashboard exists other than `example-dashboard-id` and outside the Collections with
  `excluded-collection-ids`."
  [example-dashboard-id excluded-collection-ids]
  (t2/exists? :model/Dashboard {:where (cond-> [:and
                                                [:= :archived false]]
                                         example-dashboard-id (conj [:not= :id example-dashboard-id])
                                         (seq excluded-collection-ids) (conj [:or
                                                                              [:is :collection_id nil]
                                                                              [:not-in :collection_id excluded-collection-ids]]))}))

(defn sandbox-exists?
  "Whether any Sandbox exists."
  []
  (t2/exists? :model/Sandbox))

(defn user-model-exists?
  "Whether an unarchived model Card exists outside the sample Collections and the Collection with
  `audit-collection-id`."
  [audit-collection-id]
  (t2/exists? :model/Card {:where [:and
                                   [:= :type "model"]
                                   [:= :archived false]
                                   [:or
                                    [:and
                                     [:!= :collection_id audit-collection-id]
                                     [:not [:exists ^:allow-subquery
                                            {:select [1]
                                             :from   [[(t2/table-name :model/Collection) :sample_coll]]
                                             :where  [:and
                                                      [:= :sample_coll.is_sample true]
                                                      [:= :sample_coll.id :report_card.collection_id]]}]]]
                                    [:is :collection_id nil]]]}))

(defn active-tenant-exists?
  "Whether an active Tenant exists."
  []
  (t2/exists? :model/Tenant :is_active true))

(defn shared-tenant-collection-exists?
  "Whether an unarchived shared tenant Collection exists."
  []
  (t2/exists? :model/Collection {:where [:and
                                         [:= :namespace "shared-tenant-collection"]
                                         [:= :archived false]]}))

(defn shared-tenant-collection-id
  "The ID of an unarchived shared tenant Collection, or nil."
  []
  (t2/select-one-pk :model/Collection {:where [:and
                                               [:= :namespace "shared-tenant-collection"]
                                               [:= :archived false]]}))

(defn unarchived-dashboard-exists-in-collection?
  "Whether an unarchived Dashboard exists in the Collection with `collection-id`."
  [collection-id]
  (t2/exists? :model/Dashboard {:where [:and
                                        [:= :collection_id collection-id]
                                        [:= :archived false]]}))

(defn impersonation-exists?
  "Whether any ConnectionImpersonation exists."
  []
  (t2/exists? :model/ConnectionImpersonation))

(defn database-router-exists?
  "Whether any DatabaseRouter exists."
  []
  (t2/exists? :model/DatabaseRouter))

(defn embedded-card-exists?
  "Whether any Card has embedding enabled."
  []
  (t2/exists? :model/Card :enable_embedding true))

(defn embedded-dashboard-exists?
  "Whether any Dashboard has embedding enabled."
  []
  (t2/exists? :model/Dashboard :enable_embedding true))
