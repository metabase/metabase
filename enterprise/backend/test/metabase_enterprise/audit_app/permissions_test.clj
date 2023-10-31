(ns metabase-enterprise.audit-app.permissions-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.permissions :as audit-app.permissions]
   [metabase-enterprise.audit-db :as audit-db]
   [metabase-enterprise.audit-db-test :as audit-db-test]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.collection.graph :refer [update-graph!]]
   [metabase.models.collection.graph-test :refer [graph]]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions
    :as perms
    :refer [Permissions table-query-path]]
   [metabase.models.permissions-group :refer [PermissionsGroup]]
   [metabase.models.table :refer [Table]]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest audit-db-view-names-test
  (testing "`audit-db-view-names` includes all views in the app DB prefixed with `v_`"
    (let [view-query "SELECT table_name FROM information_schema.views WHERE table_name LIKE 'v\\_%';"]
      (is (set/superset?
           audit-app.permissions/audit-db-view-names
           (into #{}
                 (map :table_name (t2/query view-query))))))))

(deftest audit-db-basic-query-test
  (mt/test-drivers #{:postgres :h2 :mysql}
   (audit-db-test/with-audit-db-restoration
     (audit-db/ensure-audit-db-installed!)
     (premium-features-test/with-premium-features #{:audit-app}
       (mt/with-test-user :crowberto
         (testing "A query using a saved audit model as the source table runs succesfully"
           (let [audit-card (t2/select-one :model/Card :database_id perms/audit-db-id :dataset true)]
             (is (partial=
                  {:status :completed}
                  (qp/process-query
                   {:database perms/audit-db-id
                    :type     :query
                    :query    {:source-table (str "card__" (u/the-id audit-card))}})))))

         (testing "A non-native query can be run on views in the audit DB"
           (let [audit-view (t2/select-one :model/Table :db_id perms/audit-db-id)]
             (is (partial=
                  {:status :completed}
                  (qp/process-query
                   {:database perms/audit-db-id
                    :type     :query
                    :query    {:source-table (u/the-id audit-view)}}))))))))))

(deftest audit-db-disallowed-queries-test
  (mt/test-drivers #{:postgres :h2 :mysql}
   (audit-db-test/with-audit-db-restoration
     (audit-db/ensure-audit-db-installed!)
     (premium-features-test/with-premium-features #{:audit-app}
       (mt/with-test-user :crowberto
         (testing "Native queries are not allowed to be run on audit DB views, even by admins"
           (is (thrown-with-msg?
                clojure.lang.ExceptionInfo
                #"Native queries are not allowed on the audit database"
                (qp/process-query
                 {:database perms/audit-db-id
                  :type     :native
                  :native   {:query "SELECT * FROM v_audit_log;"}}))))

         (testing "Non-native queries are not allowed to run on tables in the audit DB that are not views"
           ;; Nothing should be synced directly from the audit DB, just loaded via serialization, so only the views
           ;; should have metadata present in the app DB in the first place. But in case this changes, we want to
           ;; explicitly block other tables from being queried.
           (t2.with-temp/with-temp [:model/Table table {:db_id perms/audit-db-id}
                                    :model/Field _     {:table_id (u/the-id table)}]
             (is (thrown-with-msg?
                  clojure.lang.ExceptionInfo
                  #"Audit queries are only allowed on audit views"
                  (qp/process-query
                   {:database perms/audit-db-id
                    :type     :query
                    :query   {:source-table (u/the-id table)}}))))))))))

(deftest permissions-instance-analytics-audit-v2-test
  (premium-features-test/with-premium-features #{:audit-app}
    (mt/with-temp [PermissionsGroup {group-id :id}    {}
                   Database         {database-id :id} {}
                   Table            view-table        {:db_id database-id :name "v_users"}
                   Collection       collection        {}]
      (with-redefs [perms/audit-db-id                 database-id
                    audit-db/default-audit-collection (constantly collection)]
        (testing "Adding instance analytics adds audit db permissions"
          (update-graph! (assoc-in (graph :clear-revisions? true) [:groups group-id (:id collection)] :read))
          (let [new-perms (t2/select-fn-set :object Permissions {:where [:= :group_id group-id]})]
            (is (contains? new-perms (table-query-path view-table)))))
        (testing "Unable to update instance analytics to writable"
          (is (thrown-with-msg?
               Exception
               #"Unable to make audit collections writable."
               (update-graph! (assoc-in (graph :clear-revisions? true) [:groups group-id (:id collection)] :write)))))))))
