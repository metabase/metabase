(ns metabase.embedding-hub.db
  "Application database queries for the embedding hub module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn user-added-database?
  "Whether a database other than the sample and audit ones exists."
  []
  (t2/exists? :model/Database {:where [:and
                                       [:= :is_sample false]
                                       [:= :is_audit false]]}))

(defn sample-database-id
  "The id of the sample database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(defn uploaded-table?
  "Whether the database with `database-id` has an active uploaded table."
  [database-id]
  (t2/exists? :model/Table {:where [:and
                                    [:= :active true]
                                    [:= :is_upload true]
                                    [:= :db_id database-id]]}))

(defn user-created-dashboard?
  "Whether an unarchived dashboard exists outside `example-dashboard-id` and `audit-collection-ids`."
  [example-dashboard-id audit-collection-ids]
  (t2/exists? :model/Dashboard {:where (cond-> [:and
                                                [:= :archived false]]
                                         example-dashboard-id (conj [:not= :id example-dashboard-id])
                                         (seq audit-collection-ids) (conj [:or
                                                                           [:is :collection_id nil]
                                                                           [:not-in :collection_id audit-collection-ids]]))}))

(defn user-created-model?
  "Whether an unarchived model exists outside the audit collection with `audit-collection-id` and the sample
  collections."
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

(defn sandbox?
  "Whether a Sandbox exists."
  []
  (t2/exists? :model/Sandbox))

(defn active-tenant?
  "Whether an active Tenant exists."
  []
  (t2/exists? :model/Tenant :is_active true))

(defn shared-tenant-collection?
  "Whether an unarchived shared tenant collection exists."
  []
  (t2/exists? :model/Collection {:where [:and
                                         [:= :namespace "shared-tenant-collection"]
                                         [:= :archived false]]}))

(defn shared-tenant-collection-id
  "The id of an unarchived shared tenant collection, or nil."
  []
  (t2/select-one-pk :model/Collection {:where [:and
                                               [:= :namespace "shared-tenant-collection"]
                                               [:= :archived false]]}))

(defn dashboard-in-collection?
  "Whether an unarchived dashboard lives in the collection with `collection-id`."
  [collection-id]
  (t2/exists? :model/Dashboard {:where [:and
                                        [:= :collection_id collection-id]
                                        [:= :archived false]]}))

(defn connection-impersonation?
  "Whether a ConnectionImpersonation exists."
  []
  (t2/exists? :model/ConnectionImpersonation))

(defn database-router?
  "Whether a DatabaseRouter exists."
  []
  (t2/exists? :model/DatabaseRouter))

(defn embedding-enabled-card?
  "Whether a Card is published as a guest embed."
  []
  (t2/exists? :model/Card :enable_embedding true))

(defn embedding-enabled-dashboard?
  "Whether a Dashboard is published as a guest embed."
  []
  (t2/exists? :model/Dashboard :enable_embedding true))

(defn custom-embedding-theme?
  "Whether an EmbeddingTheme that Metabase did not seed exists."
  []
  (t2/exists? :model/EmbeddingTheme :is_default false))
