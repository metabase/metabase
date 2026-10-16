(ns metabase-enterprise.data-apps.group-access-warnings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.dependencies.hooks :as dependencies.hooks]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-with-app-reading!
  "Call `f` with a data app whose resource collection holds a card that reads `table-ids`."
  [table-ids f]
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/Card card {:collection_id (:resource_collection_id app)}]
    (mt/with-model-cleanup [:model/Dependency]
      (when (seq table-ids)
        (t2/insert! :model/Dependency
                    (for [table-id table-ids]
                      {:from_entity_type :card :from_entity_id (:id card)
                       :to_entity_type :table :to_entity_id table-id})))
      (f app))))

(defmacro ^{:private true :clj-kondo/lint-as 'clojure.core/let} with-app-reading!
  "Bind `app-sym` to a data app whose resource collection reads `table-ids`, and run `body`."
  [[app-sym table-ids] & body]
  `(do-with-app-reading! ~table-ids (fn [~app-sym] ~@body)))

(deftest group-permission-warnings-walk-the-dependency-graph-test
  (testing "the warnings list the tables a native card, a card on another card, and a query action read"
    (mt/with-premium-features #{:data-apps :advanced-permissions :dependencies}
      (mt/with-no-data-perms-for-all-users!
        (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus]
          (let [mp (mt/metadata-provider)]
            (mt/with-temp [:model/DataApp {collection-id :resource_collection_id :as app}
                           {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                           :model/Card {base-id :id} {:collection_id collection-id
                                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                           :model/Card _ {:collection_id collection-id
                                          :dataset_query (lib/native-query mp "SELECT * FROM VENUES")}
                           :model/PermissionsGroup group {}]
              (mt/with-temp [:model/Card _ {:collection_id collection-id
                                            :dataset_query (lib/query mp (lib.metadata/card mp base-id))}
                             :model/Action {action-id :id} {:type :query :name "Delete" :collection_id collection-id}
                             :model/QueryAction _ {:action_id     action-id
                                                   :database_id   (mt/id)
                                                   :dataset_query (lib/native-query mp "DELETE FROM CHECKINS WHERE ID = 1")}]
                (deps.test/synchronously-run-backfill!)
                (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
                (group-access/add-groups! app [(:id group)])
                (is (=? [{:group_id       (:id group)
                          :missing_tables [{:id (mt/id :checkins)} {:id (mt/id :orders)} {:id (mt/id :venues)}]}]
                        (group-access/permission-warnings app)))))))))))

(deftest group-permission-warnings-include-tables-in-optional-clauses-test
  (testing "the tables an optional clause names count, whether or not its parameter is set"
    (mt/with-premium-features #{:data-apps :advanced-permissions :dependencies}
      (mt/with-no-data-perms-for-all-users!
        (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus]
          (doseq [sql ["SELECT * FROM VENUES [[WHERE ID IN (SELECT VENUE_ID FROM CHECKINS WHERE ID = {{id}})]]"
                       "SELECT * FROM VENUES v [[JOIN CHECKINS c ON c.VENUE_ID = v.ID AND c.ID = {{id}}]]"]]
            (testing sql
              (mt/with-temp [:model/DataApp {collection-id :resource_collection_id :as app}
                             {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                             :model/Card _ {:collection_id collection-id
                                            :dataset_query (lib/native-query (mt/metadata-provider) sql)}
                             :model/PermissionsGroup group {}]
                (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
                (group-access/add-groups! app [(:id group)])
                (deps.test/synchronously-run-backfill!)
                (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :checkins)} {:id (mt/id :venues)}]}]
                        (group-access/permission-warnings app)))))))))))

(deftest group-permission-warnings-follow-snippet-edit-test
  (testing "after a snippet edit and the jobs, the warnings list the tables of the snippet's new SQL"
    (mt/with-premium-features #{:data-apps :advanced-permissions :dependencies}
      (mt/with-no-data-perms-for-all-users!
        (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus :model/AnalysisFinding]
          (mt/with-temp [:model/NativeQuerySnippet snippet {:name "birds source" :content "VENUES"}
                         :model/DataApp {collection-id :resource_collection_id :as app}
                         {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                         :model/Card _ {:collection_id collection-id
                                        :dataset_query (lib/native-query (mt/metadata-provider)
                                                                         "SELECT * FROM {{snippet: birds source}}")}
                         :model/PermissionsGroup group {}]
            (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
            (group-access/add-groups! app [(:id group)])
            (deps.test/synchronously-run-backfill!)
            (t2/update! :model/NativeQuerySnippet (:id snippet) {:content "CHECKINS"})
            (deps.test/synchronously-run-backfill!)
            (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :checkins)}]}]
                    (group-access/permission-warnings app)))))))))

(deftest group-permission-warnings-include-table-synced-after-analysis-test
  (testing "a table that sync finds after the app's card was analyzed enters the warnings once the jobs run"
    (mt/with-premium-features #{:data-apps :advanced-permissions :dependencies}
      (mt/with-no-data-perms-for-all-users!
        (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus :model/AnalysisFinding]
          (mt/with-temp [:model/DataApp {collection-id :resource_collection_id :as app}
                         {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                         :model/Card _ {:collection_id collection-id
                                        :dataset_query (lib/native-query (mt/metadata-provider)
                                                                         "SELECT * FROM PUBLIC.BIRDS_LATE")}
                         :model/PermissionsGroup group {}]
            (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
            (group-access/add-groups! app [(:id group)])
            (deps.test/synchronously-run-backfill!)
            (mt/with-temp [:model/Table {late-id :id} {:db_id (mt/id) :schema "PUBLIC" :name "BIRDS_LATE" :active true}]
              (dependencies.hooks/after-database-sync (mt/id))
              (deps.test/synchronously-run-backfill!)
              (is (=? [{:group_id (:id group) :missing_tables [{:id late-id}]}]
                      (group-access/permission-warnings app))))))))))

(deftest group-permission-warnings-exclude-inactive-tables-test
  (mt/with-premium-features #{:data-apps :advanced-permissions}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues) (mt/id :orders) (mt/id :categories)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
          (group-access/add-groups! app [(:id group)])
          (mt/with-temp-vals-in-db :model/Table (mt/id :venues) {:active false}
            (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:visibility_type :hidden}
              ;; exclude inactive tables, but keep active visible and hidden tables.
              ;; permissions editor also follow this filtering.
              (is (=? [{:group_id (:id group)
                        :missing_tables [{:id (mt/id :categories)} {:id (mt/id :orders)}]}]
                      (group-access/permission-warnings app))))))))))

(deftest group-permission-warnings-ignore-apps-with-only-inactive-tables-test
  (mt/with-premium-features #{:data-apps :advanced-permissions}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
          (group-access/add-groups! app [(:id group)])
        ; if data apps only references inactive tables, there will be no access warnings
          (mt/with-temp-vals-in-db :model/Table (mt/id :venues) {:active false}
            (is (= [] (group-access/permission-warnings app)))))))))

(deftest group-permission-warnings-ignore-unassigned-groups-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [_app [(mt/id :venues) (mt/id :orders)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
          (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings"))))))))

(deftest group-permission-warnings-include-inherited-access-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues) (mt/id :orders)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
          (group-access/add-groups! app [(:id group)])
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (is (=? [{:group_id (:id group)
                    :missing_tables [{:id (mt/id :orders) :name "Orders" :database_id (mt/id)}]}]
                  (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings"))))))))

(deftest group-permission-warnings-preserve-permissions-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues) (mt/id :orders)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
          (group-access/add-groups! app [(:id group)])
          (let [before (t2/select :model/DataPermissions)]
            (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")
            (is (= before (t2/select :model/DataPermissions)))))))))

(deftest group-permission-warnings-include-direct-access-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues) (mt/id :orders)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (group-access/add-groups! app [(:id group)])
          (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
          (perms/set-table-permission! (:id group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (:id group) (mt/id :orders) :perms/view-data :unrestricted)
          (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings"))))))))

(deftest group-permission-warnings-include-sandbox-access-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues) (mt/id :orders)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (group-access/add-groups! app [(:id group)])
          (mt/user-http-request :crowberto :put 200 "permissions/graph"
                                (-> (data-perms.graph/api-graph)
                                    (assoc-in [:groups (:id group) (mt/id) :view-data]
                                              {"PUBLIC" {(mt/id :venues) :unrestricted
                                                         (mt/id :orders) :sandboxed}})
                                    (assoc :sandboxes [{:group_id (:id group) :table_id (mt/id :orders)}])))
          (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))
          (mt/user-http-request :crowberto :put 200 "permissions/graph"
                                (assoc-in (data-perms.graph/api-graph)
                                          [:groups (:id group) (mt/id) :view-data "PUBLIC" (mt/id :orders)]
                                          :blocked))
          (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :orders)}]}]
                  (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings"))))))))

(deftest group-permission-warnings-require-admin-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues) (mt/id :orders)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (group-access/add-groups! app [(:id group)])
          (mt/user-http-request :rasta :get 403 "apps/birds/group-permission-warnings"))))))

(deftest group-permission-warnings-without-dependencies-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app []]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (group-access/add-groups! app [(:id group)])
          (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings"))))))))

(deftest group-permission-warnings-missing-app-test
  (mt/with-premium-features #{:data-apps}
    (mt/user-http-request :crowberto :get 404 "apps/missing/group-permission-warnings")))

(deftest group-permission-warnings-use-group-access-not-memberships-test
  (mt/with-premium-features #{:data-apps :advanced-permissions}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues)]]
        (mt/with-temp [:model/PermissionsGroup group {}
                       :model/PermissionsGroup other-group {}]
          (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
          (perms/set-database-permission! (:id other-group) (mt/id) :perms/view-data :unrestricted)
          (group-access/add-groups! app [(:id group)])
          (perms/add-user-to-group! (mt/user->id :rasta) (:id group))
          (perms/add-user-to-group! (mt/user->id :rasta) (:id other-group))
          (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :venues)}]}]
                  (group-access/permission-warnings app))))))))

(deftest group-permission-warnings-include-impersonated-access-test
  (mt/with-premium-features #{:data-apps :advanced-permissions}
    (mt/with-no-data-perms-for-all-users!
      (with-app-reading! [app [(mt/id :venues)]]
        (mt/with-temp [:model/PermissionsGroup group {}]
          (group-access/add-groups! app [(:id group)])
          (mt/user-http-request :crowberto :put 200 "permissions/graph"
                                (-> (data-perms.graph/api-graph)
                                    (assoc-in [:groups (:id group) (mt/id) :view-data] :impersonated)
                                    (assoc :impersonations [{:group_id (:id group) :db_id (mt/id)
                                                             :attribute "role"}])))
          (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))
          (mt/user-http-request :crowberto :put 200 "permissions/graph"
                                (assoc-in (data-perms.graph/api-graph)
                                          [:groups (:id group) (mt/id) :view-data]
                                          :blocked))
          (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :venues)}]}]
                  (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings"))))))))

(deftest group-permission-warning-lookups-are-batched-test
  (mt/with-no-data-perms-for-all-users!
    (with-app-reading! [app [(mt/id :venues) (mt/id :orders)]]
      (mt/with-temp [:model/PermissionsGroup finches {}
                     :model/PermissionsGroup owls {}]
        (group-access/add-groups! app [(:id finches)])
        (group-access/permission-warnings app)
        (let [query-count #(t2/with-call-count [calls]
                             (group-access/permission-warnings app)
                             (calls))
              one-group-count (query-count)]
          (group-access/add-groups! app [(:id owls)])
          (is (= one-group-count (query-count))))))))

(deftest group-permission-warnings-require-feature-test
  (with-app-reading! [app [(mt/id :venues)]]
    (mt/with-temp [:model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (mt/with-premium-features #{}
        (mt/user-http-request :crowberto :get 402 "apps/birds/group-permission-warnings")
        (mt/user-http-request :rasta :get 402 "apps/birds/group-permission-warnings")))))

(deftest group-permission-warning-lookups-exclude-unrelated-permissions-test
  (mt/with-temp [:model/Database other-db {}
                 :model/PermissionsGroup finches {}
                 :model/PermissionsGroup owls {}
                 :model/PermissionsGroup sparrows {}]
    (t2/delete! :model/DataPermissions :group_id [:in [(:id finches) (:id owls) (:id sparrows)]])
    (let [table-permission {:group_id (:id finches) :db_id (mt/id) :table_id (mt/id :venues)
                            :perm_type :perms/view-data :perm_value :unrestricted}
          database-permission {:group_id (:id owls) :db_id (mt/id) :table_id nil
                               :perm_type :perms/view-data :perm_value :unrestricted}]
      (t2/insert! :model/DataPermissions
                  [table-permission
                   database-permission
                   (assoc table-permission :table_id (mt/id :orders))
                   (assoc table-permission :perm_type :perms/create-queries :perm_value :query-builder)
                   (assoc database-permission :group_id (:id sparrows))
                   (assoc database-permission :db_id (:id other-db))])
      (let [access (#'group-access/group-table-access
                    #{(:id finches) (:id owls)}
                    [{:id (mt/id :venues) :database_id (mt/id)}])
            permission-rows (mapcat val (:permissions access))]
        ;; exclude loading permission rows that the data access warning check does not need
        (is (= #{table-permission database-permission}
               (into #{} (map #(select-keys % (keys table-permission))) permission-rows)))))))

(deftest group-permission-warnings-preserve-table-details-test
  (mt/with-premium-features #{:data-apps :advanced-permissions}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database aviary {:name "Aviary"}
                     :model/Database zoo {:name "Zoo"}
                     :model/Table finches {:db_id (:id aviary) :name "finches" :display_name "Zebra" :schema "PUBLIC"}
                     :model/Table owls {:db_id (:id aviary) :name "owls" :display_name "Owls" :schema "PUBLIC"}
                     :model/Table albatrosses {:db_id (:id zoo) :name "albatrosses"
                                               :display_name "Albatrosses" :schema nil}
                     :model/TableUserSettings _ {:table_id (:id finches) :display_name "Finches"}
                     :model/PermissionsGroup group {}]
        (with-app-reading! [app [(:id albatrosses) (:id owls) (:id finches)]]
          (doseq [group-id [(:id (perms/all-users-group)) (:id group)]
                  database-id [(:id aviary) (:id zoo)]]
            (perms/set-database-permission! group-id database-id :perms/view-data :blocked))
          (group-access/add-groups! app [(:id group)])
          (is (= [{:group_id (:id group)
                   :missing_tables [{:id (:id finches) :name "Finches" :schema "PUBLIC"
                                     :database_id (:id aviary) :database_name "Aviary"}
                                    {:id (:id owls) :name "Owls" :schema "PUBLIC"
                                     :database_id (:id aviary) :database_name "Aviary"}
                                    {:id (:id albatrosses) :name "Albatrosses" :schema nil
                                     :database_id (:id zoo) :database_name "Zoo"}]}]
                 (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings"))))))))
