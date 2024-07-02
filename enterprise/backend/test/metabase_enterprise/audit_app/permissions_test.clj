(ns metabase-enterprise.audit-app.permissions-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.audit-test :as audit-test]
   [metabase-enterprise.audit-app.permissions :as audit-app.permissions]
   [metabase.api.common :as api]
   [metabase.audit :as audit]
   [metabase.core :as mbc]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.collection.graph :refer [update-graph!]]
   [metabase.models.collection.graph-test :refer [graph]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :refer [PermissionsGroup]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db :plugins))

(deftest audit-db-view-names-test
  (testing "`audit-db-view-names` includes all views in the app DB prefixed with `v_`"
    (let [view-query "SELECT table_name FROM information_schema.views WHERE table_name LIKE 'v\\_%';"]
      (is (set/superset?
           audit-app.permissions/audit-db-view-names
           (into #{}
                 (map :table_name (t2/query view-query))))))))

(deftest audit-db-basic-query-test
  (mt/test-drivers #{:postgres :h2 :mysql}
    (audit-test/with-audit-db-restoration
      (mt/with-premium-features #{:audit-app}
        (mt/with-test-user :crowberto
          (testing "A query using a saved audit model as the source table runs succesfully"
            (let [audit-card (t2/select-one :model/Card :database_id audit/audit-db-id :type :model)]
              (is (partial=
                   {:status :completed}
                   (qp/process-query
                    {:database audit/audit-db-id
                     :type     :query
                     :query    {:source-table (str "card__" (u/the-id audit-card))}})))))

          (testing "A non-native query can be run on views in the audit DB"
            (let [audit-view (t2/select-one :model/Table :db_id audit/audit-db-id)]
              (is (partial=
                   {:status :completed}
                   (qp/process-query
                    {:database audit/audit-db-id
                     :type     :query
                     :query    {:source-table (u/the-id audit-view)}}))))))))))

(deftest audit-db-disallowed-queries-test
  (mt/test-drivers #{:postgres :h2 :mysql}
    (audit-test/with-audit-db-restoration
      (mt/with-premium-features #{:audit-app}
        (mt/with-test-user :crowberto
          (testing "Native queries are not allowed to be run on audit DB views, even by admins"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Native queries are not allowed on the audit database"
                 (qp/process-query
                  {:database audit/audit-db-id
                   :type     :native
                   :native   {:query "SELECT * FROM v_audit_log;"}}))))

          (testing "Non-native queries are not allowed to run on tables in the audit DB that are not views"
            ;; Nothing should be synced directly from the audit DB, just loaded via serialization, so only the views
            ;; should have metadata present in the app DB in the first place. But in case this changes, we want to
            ;; explicitly block other tables from being queried.
            (t2.with-temp/with-temp [:model/Table table {:db_id audit/audit-db-id}
                                     :model/Field _     {:table_id (u/the-id table)}]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"Audit queries are only allowed on audit views"
                   (qp/process-query
                    {:database audit/audit-db-id
                     :type     :query
                     :query   {:source-table (u/the-id table)}})))))

          (testing "Users without access to the audit collection cannot run any queries on the audit DB, even if they
                   have data perms for the audit DB"
            (mt/with-full-data-perms-for-all-users!
              (mt/with-test-user :rasta
                (binding [api/*current-user-permissions-set* (delay #{})]
                  (let [audit-view (t2/select-one :model/Table :db_id audit/audit-db-id)]
                    (is (thrown-with-msg?
                         clojure.lang.ExceptionInfo
                         #"You do not have access to the audit database"
                         (qp/process-query
                          {:database audit/audit-db-id
                           :type     :query
                           :query    {:source-table (u/the-id audit-view)}})))))))))))))

(deftest analytics-permissions-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [PermissionsGroup {group-id :id}    {}
                   Database         {database-id :id} {}
                   Table            view-table        {:db_id database-id :name "v_users"}
                   Collection       collection        {}]
      (with-redefs [audit/audit-db-id                 database-id
                    audit/default-audit-collection (constantly collection)]
        (testing "Updating permissions for the audit collection also updates audit DB permissions"
          ;; Audit DB starts with full data access but no query builder access
          (is (= :unrestricted (data-perms/table-permission-for-groups #{group-id} :perms/view-data database-id (:id view-table))))
          (is (= :no (data-perms/table-permission-for-groups #{group-id} :perms/create-queries database-id (:id view-table))))
          ;; Granting access to the audit collection also grants query builder access to the DB
          (update-graph! (assoc-in (graph :clear-revisions? true) [:groups group-id (:id collection)] :read))
          (is (= :unrestricted (data-perms/table-permission-for-groups #{group-id} :perms/view-data database-id (:id view-table))))
          (is (= :query-builder (data-perms/table-permission-for-groups #{group-id} :perms/create-queries database-id (:id view-table)))))
        (testing "Unable to update instance analytics to writable"
          (is (thrown-with-msg?
               Exception
               #"Unable to make audit collections writable."
               (update-graph! (assoc-in (graph :clear-revisions? true) [:groups group-id (:id collection)] :write)))))))))

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
  (t2.with-temp/with-temp [:model/Card audit-child-card {:collection_id (:id (audit/default-audit-collection))}
                           :model/Card root-child-card {:collection_id nil}]
    (is (false? (mi/can-write? audit-child-card)))
    (binding [api/*current-user-permissions-set* (delay #{"/collection/root/"})]
      (is (true? (mi/can-write? root-child-card))))
    (binding [api/*current-user-permissions-set* (delay #{"/"})]
      (is (true? (mi/can-write? root-child-card))))))

(deftest can-write-is-false-for-audit-content-cards-test
  (install-audit-db-if-needed!)
  (let [audit-cards (t2/select :model/Card :collection_id (:id (audit/default-audit-collection)))]
    (is (= #{false} (set (map mi/can-write? audit-cards))))))

(deftest cannot-edit-audit-content-cards-over-api
  (install-audit-db-if-needed!)
  (let [card (t2/select-one :model/Card :collection_id (:id (audit/default-audit-collection)))]
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card)) {:name "My new title"})))))

(deftest can-write-false-for-audit-dashboard-content-test
  (install-audit-db-if-needed!)
  (t2.with-temp/with-temp [:model/Dashboard audit-child-dashboard {:collection_id (:id (audit/default-audit-collection))}
                           :model/Dashboard root-child-dashboard {:collection_id nil}]
    (is (false? (mi/can-write? audit-child-dashboard)))
    (binding [api/*current-user-permissions-set* (delay #{"/collection/root/"})]
      (is (true? (mi/can-write? root-child-dashboard))))
    (binding [api/*current-user-permissions-set* (delay #{"/"})]
      (is (true? (mi/can-write? root-child-dashboard))))))

(deftest can-write-is-false-for-audit-content-dashboards-test
  (install-audit-db-if-needed!)
  (let [audit-dashboards (t2/select :model/Dashboard :collection_id (:id (audit/default-audit-collection)))]
    (is (= #{false} (set (map mi/can-write? audit-dashboards))))))

(deftest cannot-edit-audit-content-dashboards-over-api
  (install-audit-db-if-needed!)
  (let [dashboard (t2/select-one :model/Dashboard :collection_id (:id (audit/default-audit-collection)))]
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dashboard)) {:name "My new title"})))))
