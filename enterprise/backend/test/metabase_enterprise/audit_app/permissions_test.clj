(ns metabase-enterprise.audit-app.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-db :as audit-db]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.collection.graph :refer [update-graph!]]
   [metabase.models.collection.graph-test :refer [graph]]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions :refer [Permissions
                                        table-query-path]]
   [metabase.models.permissions-group :refer [PermissionsGroup]]
   [metabase.models.table :refer [Table]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest permissions-instance-analytics-audit-v2-test
  (mt/with-temp [PermissionsGroup {group-id :id}                    {}
                 Database         {database-id :id}                 {}
                 Table            view-table                        {:db_id database-id :name "v_users"}
                 Collection       {collection-id :id
                                   collection-entity-id :entity_id} {}]
    (with-redefs [audit-db/default-audit-db-id                (constantly database-id)
                  audit-db/default-audit-collection-entity-id (constantly collection-entity-id)]
      (testing "Adding instance analytics adds audit db permissions"
        (update-graph! (assoc-in (graph :clear-revisions? true) [:groups group-id collection-id] :read))
        (let [new-perms (t2/select-fn-set :object Permissions {:where [:= :group_id group-id]})]
          (is (contains? new-perms (table-query-path view-table)))))
      (testing "Unable to update instance analytics to writable"
        (is (thrown-with-msg?
             Exception
             #"Unable to make audit collections writable."
             (update-graph! (assoc-in (graph :clear-revisions? true) [:groups group-id collection-id] :write))))))))
