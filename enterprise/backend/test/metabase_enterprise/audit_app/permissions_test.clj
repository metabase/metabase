(ns metabase-enterprise.audit-app.permissions-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.audit-test :as audit-test]
   [metabase-enterprise.audit-app.permissions :as audit-app.permissions]
   [metabase.audit-app.core :as audit]
   [metabase.core.core :as mbc]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.collection.graph :refer [update-graph!]]
   [metabase.permissions.models.collection.graph-test :refer [graph]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.test :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :plugins))

(deftest audit-db-view-names-test
  (testing "`audit-db-view-names` includes all views in the app DB prefixed with `v_`"
    (let [view-query {:select [:table_name]
                      :from   [:information_schema.views]
                      :where  [:like :table_name "v\\_%"]}]
      (is (set/superset?
           audit-app.permissions/audit-db-view-names
           (into #{}
                 (map :table_name (t2/query view-query))))))))

(deftest audit-db-basic-query-test
  (audit-test/with-audit-db-restoration!
    (mt/with-premium-features #{:audit-app}
      (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database :id audit/audit-db-id))
          "The sync status should be completed by this point. (In test it is synchronous!)")
      (mt/with-test-user :crowberto
        (testing "A query using a saved audit model as the source table runs successfully"
          (let [audit-card (t2/select-one :model/Card :database_id audit/audit-db-id :type :model)]
            (is (partial=
                 {:status :completed}
                 (qp/process-query
                  {:database audit/audit-db-id
                   :type     :query
                   :query    {:source-table (str "card__" (u/the-id audit-card))}})))))
        (testing "A non-native query can be run on views in the audit DB"
          (let [audit-view (t2/select-one :model/Table
                                          :db_id audit/audit-db-id
                                          {:where [:in [:lower :name] audit-app.permissions/audit-db-view-names]})]
            (when-not (some-> audit-view :name u/lower-case-en (str/starts-with? "v_"))
              (sync/sync-database! (:id (t2/select-one :model/Database :id audit/audit-db-id))))
            (is (partial=
                 {:status :completed}
                 (qp/process-query
                  {:database audit/audit-db-id
                   :type     :query
                   :query    {:source-table (u/the-id audit-view)}})))))))))

(defn- refusal
  "Run `query` and return the message and the QP error type of the exception that refuses it, or nil when it runs."
  [query]
  (try
    (qp/process-query query)
    nil
    (catch clojure.lang.ExceptionInfo e
      {:message (ex-message e), :type (:type (ex-data e))})))

(deftest audit-db-disallowed-queries-test
  (audit-test/with-audit-db-restoration!
    (mt/with-premium-features #{:audit-app}
      (mt/with-test-user :crowberto
        (testing "Native queries are not allowed to be run on audit DB views, even by admins"
          (is (= {:message "Native queries are not allowed on the audit database"
                  :type    qp.error-type/invalid-query}
                 (refusal {:database audit/audit-db-id
                           :type     :native
                           :native   {:query "SELECT * FROM v_audit_log;"}}))))
        (testing "Non-native queries are not allowed to run on tables in the audit DB that are not views"
          ;; Nothing should be synced directly from the audit DB, just loaded via serialization, so only the views
          ;; should have metadata present in the app DB in the first place. But in case this changes, we want to
          ;; explicitly block other tables from being queried.
          (mt/with-temp [:model/Table table {:db_id audit/audit-db-id}
                         :model/Field _     {:table_id (u/the-id table)}]
            (is (= {:message "Audit queries are only allowed on audit views"
                    :type    qp.error-type/invalid-query}
                   (refusal {:database audit/audit-db-id
                             :type     :query
                             :query    {:source-table (u/the-id table)}})))))
        (testing "Users without access to the audit collection cannot run any queries on the audit DB, even if they
                   have data perms for the audit DB"
          (mt/with-full-data-perms-for-all-users!
            (mt/with-test-user :rasta
              (mt/with-non-admin-groups-no-collection-perms (audit/default-audit-collection)
                (let [audit-view (->> (t2/select-one :model/Table :db_id audit/audit-db-id {:where [:like [:lower :name] "v_%"]})
                                      (tu/poll-until 5000))]
                  (is (= {:message "You do not have access to the audit database"
                          :type    qp.error-type/missing-required-permissions}
                         (refusal {:database audit/audit-db-id
                                   :type     :query
                                   :query    {:source-table (u/the-id audit-view)}}))))))))))))

(deftest audit-db-query-without-audit-app-feature-test
  (audit-test/with-audit-db-restoration!
    (mt/with-premium-features #{}
      (mt/with-test-user :crowberto
        (testing "Without the audit-app feature, the OSS check refuses every query on the audit DB"
          (is (= {:message "Querying this database requires the audit-app feature flag"
                  :type    qp.error-type/disabled-feature}
                 (refusal {:database audit/audit-db-id
                           :type     :native
                           :native   {:query "SELECT 1;"}}))))))))

(deftest analytics-permissions-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/PermissionsGroup {group-id :id}    {}
                   :model/Database         {database-id :id} {:is_audit true}
                   :model/Table            view-table        {:db_id database-id :name "v_users"}
                   :model/Collection       collection        {:namespace "analytics"}]
      (with-redefs [audit/audit-db-id                 database-id
                    audit/default-audit-collection (constantly collection)]
        (testing "Updating permissions for the audit collection also updates audit DB permissions"
          ;; Audit DB starts with full data access but no query builder access
          (is (= :unrestricted (get (data-perms/table-permissions-for-groups #{group-id} :perms/view-data {(:id view-table) database-id}) (:id view-table))))
          (is (= :no (get (data-perms/table-permissions-for-groups #{group-id} :perms/create-queries {(:id view-table) database-id}) (:id view-table))))
          ;; Granting access to the audit collection also grants query builder access to the DB
          (update-graph! (assoc-in (graph :clear-revisions? true) [:groups group-id (:id collection)] :read))
          (is (= :unrestricted (get (data-perms/table-permissions-for-groups #{group-id} :perms/view-data {(:id view-table) database-id}) (:id view-table))))
          (is (= :query-builder (get (data-perms/table-permissions-for-groups #{group-id} :perms/create-queries {(:id view-table) database-id}) (:id view-table)))))
        (testing "Setting audit collection to :write downgrades to :read instead of throwing (#71300)"
          (update-graph! (assoc-in (graph :clear-revisions? true :collections [collection] :groups [group-id])
                                   [:groups group-id (:id collection)] :write))
          (is (= :read (get-in (graph :clear-revisions? true :collections [collection] :groups [group-id])
                               [:groups group-id (:id collection)]))
              "Audit collection permission should be stored as :read, not :write")
          (is (= :unrestricted (get (data-perms/table-permissions-for-groups #{group-id} :perms/view-data {(:id view-table) database-id}) (:id view-table))))
          (is (= :query-builder (get (data-perms/table-permissions-for-groups #{group-id} :perms/create-queries {(:id view-table) database-id}) (:id view-table)))))))))

(defn- call-with-groups!
  "Call `f` with the ids of `group-count` new groups, deleting them afterwards."
  [group-count f]
  (let [group-ids (t2/insert-returning-pks! :model/PermissionsGroup
                                            (repeatedly group-count #(mt/with-temp-defaults :model/PermissionsGroup)))]
    (try
      (f group-ids)
      (finally
        (t2/delete! :model/PermissionsGroup :id [:in group-ids])))))

(defn- call-with-audit-database!
  "Call `f` with the id of a new audit Database holding a Table for each of `table-names`, its analytics Collection, a
  plain Collection and the ids of `group-count` new groups, with the audit Database and Collection redefined to them."
  [table-names group-count f]
  (mt/with-temp [:model/Database   {db-id :id}  {:is_audit true}
                 :model/Collection audit-coll   {:namespace "analytics"}
                 :model/Collection {plain :id}  {}]
    (t2/insert! :model/Table (for [table-name table-names]
                               {:db_id db-id :name table-name :display_name table-name :schema "PUBLIC" :active true}))
    (call-with-groups! group-count
                       (fn [group-ids]
                         (with-redefs [audit/audit-db-id db-id]
                           (mt/with-dynamic-fn-redefs [audit/default-audit-collection (constantly audit-coll)]
                             (f db-id (:id audit-coll) plain group-ids)))))))

(defn- data-permission-rows
  "The data permissions of the groups with `group-ids` on the Database with `db-id`, without their ids, as
  frequencies."
  [group-ids db-id]
  (frequencies (t2/select-fn-vec #(select-keys % [:group_id :perm_type :perm_value :db_id :table_id :schema_name])
                                 :model/DataPermissions :db_id db-id :group_id [:in group-ids])))

(defn- restore-data-permissions!
  "Replace the data permissions of the groups with `group-ids` on the Database with `db-id` by `rows`."
  [group-ids db-id rows]
  (t2/delete! :model/DataPermissions :db_id db-id :group_id [:in group-ids])
  (t2/insert! :model/DataPermissions (map #(dissoc % :id) rows)))

(defn- set-view-tables-one-at-a-time!
  "Set create-queries on each audit view Table of the Database with `db-id`, one Table at a time, for the group of each
  `[group-id access]` of `audit-accesses`: `:no` for `:none`, else `:query-builder`."
  [db-id audit-accesses]
  (let [view-tables (t2/select :model/Table :db_id db-id :name [:in audit-app.permissions/audit-db-view-names])]
    (doseq [[group-id access] audit-accesses
            table             view-tables]
      (data-perms/set-table-permission! group-id table :perms/create-queries (if (= access :none) :no :query-builder)))))

(defn- revision-after
  "The `:after` of a graph revision that records `changes`."
  [changes]
  (into {} (for [[group-id accesses] changes]
             [(keyword (str group-id)) (into {} (for [[collection-id access] accesses]
                                                  [(keyword (str collection-id)) (name access)]))])))

(deftest audit-collection-graph-update-writes-same-data-permissions-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-test-user :crowberto
      (mt/with-model-cleanup [:model/CollectionPermissionGraphRevision]
        (doseq [table-names [["v_users" "v_content" "v_tables"]
                             ["v_users" "v_content" "v_tables" "core_user"]]
                group-count [1 6]]
          (testing (format "Tables %s, %d groups" table-names group-count)
            (call-with-audit-database!
             table-names 6
             (fn [db-id audit-coll plain [g1 g2 g3 g4 g5 g6 :as group-ids]]
               (let [view-table (t2/select-one :model/Table :db_id db-id :name "v_users")]
                 (perms/grant-collection-read-permissions! g3 audit-coll)
                 (data-perms/set-table-permission! g3 view-table :perms/create-queries :query-builder)
                 (perms/grant-collection-read-permissions! g4 audit-coll)
                 (data-perms/set-database-permission! g4 db-id :perms/create-queries :query-builder)
                 (perms/grant-collection-read-permissions! g6 audit-coll))
               (let [changes        (cond-> {g1 {audit-coll :read}}
                                      (> group-count 1) (assoc g2 {audit-coll :write}
                                                               g3 {audit-coll :none}
                                                               g4 {audit-coll :write}
                                                               g5 {plain :read}))
                     audit-changes  (keep (fn [[group-id accesses]]
                                            (when-let [access (get accesses audit-coll)]
                                              [group-id access]))
                                          changes)
                     before         (t2/select :model/DataPermissions :db_id db-id :group_id [:in group-ids])
                     expected       (do (set-view-tables-one-at-a-time! db-id audit-changes)
                                        (data-permission-rows group-ids db-id))
                     _              (restore-data-permissions! group-ids db-id before)
                     _              (is (= (frequencies (map #(dissoc % :id) before))
                                           (frequencies (map #(dissoc % :id)
                                                             (t2/select :model/DataPermissions :db_id db-id
                                                                        :group_id [:in group-ids])))))
                     graph-update   (update-graph! nil {:revision 0
                                                        :groups   (assoc changes g6 {audit-coll :read})}
                                                   true)]
                 @graph-update
                 (testing "data permissions are those a one-Table-at-a-time update writes"
                   (is (= expected (data-permission-rows group-ids db-id))))
                 (testing "audit Collection write is stored as read"
                   (is (= (if (> group-count 1)
                            {g1 {audit-coll :read}, g2 {audit-coll :read}, g4 {audit-coll :read}, g5 {plain :read}
                             g6 {audit-coll :read}}
                            {g1 {audit-coll :read}, g3 {audit-coll :read}, g4 {audit-coll :read}
                             g6 {audit-coll :read}})
                          (select-keys (:groups (graph :collections [audit-coll plain] :groups group-ids))
                                       group-ids))))
                 (testing "revision records changes as requested"
                   (is (= (revision-after changes)
                          (:after (t2/select-one :model/CollectionPermissionGraphRevision
                                                 {:order-by [[:id :desc]]}))))))))))))))

(defn- graph-update-statement-count!
  "The number of app-DB statements a graph update takes that grants each of `group-ids` read on the Collection with
  `collection-id`."
  [collection-id group-ids]
  (t2/with-call-count [call-count]
    @(update-graph! nil {:revision 0 :groups (into {} (for [group-id group-ids] [group-id {collection-id :read}]))} true)
    (call-count)))

(deftest audit-collection-graph-update-statement-count-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-test-user :crowberto
      (mt/with-model-cleanup [:model/CollectionPermissionGraphRevision]
        (let [statements (fn [table-names group-count]
                           (call-with-audit-database!
                            table-names group-count
                            (fn [_db-id audit-coll _plain group-ids]
                              (graph-update-statement-count! audit-coll group-ids))))
              views      (fn [n] (take n (sort audit-app.permissions/audit-db-view-names)))]
          (statements (views 2) 2)
          (testing "granting read on audit Collection takes as many statements for 6 view Tables as for 2"
            (is (= (statements (views 2) 2)
                   (statements (views 6) 2))))
          (testing "each group granted read on audit Collection adds as many statements for 6 view Tables as for 2"
            (is (= (- (statements (views 2) 4) (statements (views 2) 2))
                   (- (statements (views 6) 4) (statements (views 6) 2))))))))))

(deftest plain-collection-graph-update-statement-count-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-test-user :crowberto
      (mt/with-temporary-setting-values [last-analytics-checksum 1]
        (mt/with-model-cleanup [:model/CollectionPermissionGraphRevision]
          (mt/with-temp [:model/Collection {collection-id :id} {}]
            (let [statements (fn [group-count]
                               (call-with-groups! group-count #(graph-update-statement-count! collection-id %)))]
              (statements 2)
              (testing "granting read on plain Collection takes as many statements for 6 groups as for 2"
                (is (= (statements 2) (statements 6)))))))))))

;; TODO: re-enable these tests once they're no longer flaky
(defn install-audit-db-if-needed!
  "Checks if there's an audit-db. if not, it will create it and serialize audit content, including the
  `default-audit-collection`. If the audit-db is there, this does nothing."
  []
  (let [coll (boolean (audit/default-audit-collection))
        default-audit-id (:id (audit/default-audit-collection))
        cards (t2/exists? :model/Card :collection_id default-audit-id)
        dashboards (t2/exists? :model/Dashboard :collection_id default-audit-id)]
    (when-not (and coll cards dashboards)
      ;; Force audit db to load, even if the checksum has not changed. Sometimes analytics bits get removed by tests,
      ;; but next time we go to load analytics data, we find the existing checksum and don't bother loading it again.
      (mt/with-temporary-setting-values [last-analytics-checksum -1]
        (mbc/ensure-audit-db-installed!)))))

(deftest can-write-false-for-audit-card-content-test
  (install-audit-db-if-needed!)
  (mt/with-temp [:model/Card audit-child-card {:collection_id (:id (audit/default-audit-collection))}
                 :model/Card root-child-card {:collection_id nil}]
    (is (false? (mi/can-write? (t2/hydrate audit-child-card :can_write))))
    (mt/with-test-user :rasta
      (is (true? (mi/can-write? (t2/hydrate root-child-card :can_write)))))
    (mt/with-test-user :crowberto
      (is (true? (mi/can-write? (t2/hydrate root-child-card :can_write)))))))

(deftest can-write-is-false-for-audit-content-cards-test
  (install-audit-db-if-needed!)
  (let [audit-cards (t2/select :model/Card :collection_id (:id (audit/default-audit-collection)))]
    (is (= #{false} (set (map mi/can-write? (t2/hydrate audit-cards :can_write)))))))

(deftest cannot-edit-audit-content-cards-over-api
  (install-audit-db-if-needed!)
  (let [card (t2/select-one :model/Card :collection_id (:id (audit/default-audit-collection)))]
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card)) {:name "My new title"})))))

(deftest can-write-false-for-audit-dashboard-content-test
  (install-audit-db-if-needed!)
  (mt/with-temp [:model/Dashboard audit-child-dashboard {:collection_id (:id (audit/default-audit-collection))}
                 :model/Dashboard root-child-dashboard {:collection_id nil}]
    (is (false? (mi/can-write? (t2/hydrate audit-child-dashboard :can_write))))
    (mt/with-test-user :rasta
      (is (true? (mi/can-write? (t2/hydrate root-child-dashboard :can_write)))))
    (mt/with-test-user :crowberto
      (is (true? (mi/can-write? (t2/hydrate root-child-dashboard :can_write)))))))

(deftest can-write-is-false-for-audit-content-dashboards-test
  (install-audit-db-if-needed!)
  (let [audit-dashboards (t2/select :model/Dashboard :collection_id (:id (audit/default-audit-collection)))]
    (is (= #{false} (set (map mi/can-write? (t2/hydrate audit-dashboards :can_write)))))))

(deftest cannot-edit-audit-content-dashboards-over-api
  (install-audit-db-if-needed!)
  (let [dashboard (t2/select-one :model/Dashboard :collection_id (:id (audit/default-audit-collection)))]
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dashboard)) {:name "My new title"})))))

(deftest audit-db-adhoc-query-and-collection-write-perms-test
  (audit-test/with-audit-db-restoration!
    (mt/with-premium-features #{:audit-app}
      (testing "An ad-hoc aggregation query on top of a saved audit model runs successfully (#43088)"
        (mt/with-test-user :crowberto
          (let [audit-card (t2/select-one :model/Card :database_id audit/audit-db-id :type :model :name "People")]
            (is (some? audit-card)
                "Expected the audit DB's 'People' model card to exist after installation")
            (let [mp    (lib.metadata.jvm/application-database-metadata-provider audit/audit-db-id)
                  query (-> (lib/query mp (lib.metadata/card mp (u/the-id audit-card)))
                            (lib/aggregate (lib/count)))]
              (is (partial= {:status :completed}
                            (qp/process-query query)))))))
      (testing "the analytics collection is read-only via the API"
        (let [audit-coll-id (:id (audit/default-audit-collection))
              items         (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
              analytics     (first (filter #(and (= (:model %) "collection") (= (:id %) audit-coll-id)) items))]
          (is (some? analytics)
              "the analytics collection is listed under the root collection")
          (is (false? (:can_write analytics)))))
      (testing "GET /api/permissions/graph does not include the audit DB"
        (let [resp (mt/user-http-request :crowberto :get 200 "permissions/graph")]
          (is (every? #(not (contains? % audit/audit-db-id))
                      (vals (:groups resp)))))))))
