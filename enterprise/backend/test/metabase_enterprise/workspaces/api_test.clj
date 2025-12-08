(ns ^:mb/driver-tests metabase-enterprise.workspaces.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [with-transform-cleanup!]]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.lib.core :as lib]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [tests]
                      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
                        (mt/with-premium-features [:workspaces :dependencies :transforms]
                          (search.tu/with-index-disabled
                            (tests))))))
(use-fixtures :each (fn [tests]
                      (mt/with-model-cleanup [:model/Collection :model/Workspace :model/Transform
                                              :model/WorkspaceMappingTransform]
                        (tests))))

(defn ws-url [id path]
  (str "ee/workspace/" id path))

(defn- ws-ready
  "Poll until workspace status becomes :ready or timeout"
  [ws-or-id]
  (let [ws-id (cond-> ws-or-id
                (map? ws-or-id) :id)]
    (try
      (tu/poll-until 300 (or (t2/select-one :model/Workspace :id ws-id :status :ready)
                             (Thread/sleep 10)))
      (catch Exception e
        (if (:timeout-ms (ex-data e))
          (throw (ex-info "Workspace is not ready yet" {:logs (t2/select [:model/WorkspaceLog :task :status :message]
                                                                         :workspace_id ws-id
                                                                         {:order-by [[:started_at :desc]]})}))
          (throw e))))))

(deftest workspace-endpoints-require-superuser-test
  (mt/with-temp [:model/Workspace workspace {:name "Private Workspace"}]
    (testing "GET /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/workspace"))))

    (testing "GET /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (str "ee/workspace/" (:id workspace))))))

    (testing "POST /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/workspace"
                                   {:name "Unauthorized Workspace"})))))

  (mt/with-temp [:model/Workspace workspace {:name "Put Workspace"}]
    (testing "PUT /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (str "ee/workspace/" (:id workspace))
                                   {:name "Updated"})))))

  (mt/with-temp [:model/Workspace workspace {:name "Delete Workspace"}]
    (testing "DELETE /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (str "ee/workspace/" (:id workspace)))))))

  (mt/with-temp [:model/Workspace workspace {:name "Promote Workspace"}]
    (testing "POST /api/ee/workspace/:id/promote requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (str "ee/workspace/" (:id workspace) "/merge")))))))

(deftest workspace-crud-flow-test
  (let [tx-id          (->> (t2/select :model/Transform :workspace_id nil)
                            (filter #(= (mt/id) (get-in % [:target :database])))
                            (sort-by :id >)
                            first
                            :id)
        workspace-name (str "Workspace " (random-uuid))
        ;; Create workspace with or without upstream transforms depending on availability
        created        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                             (cond-> {:name        workspace-name
                                                      :database_id (mt/id)}
                                               tx-id (assoc :upstream {:transforms [tx-id]})))
        workspace-id   (:id created)
        collection-id  (:collection_id created)]
    (is (=? {:id            int?
             :collection_id int?
             :name          workspace-name}
            created))
    (is (t2/exists? :model/Workspace :id workspace-id :collection_id collection-id))
    (is (t2/exists? :model/Collection :id collection-id :workspace_id workspace-id))

    (testing "workspace appears in list response"
      (let [{:keys [items]} (mt/user-http-request :crowberto :get 200 "ee/workspace")]
        (is (some #(= workspace-id (:id %)) items))))

    (testing "workspace can be fetched individually"
      (let [response (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" workspace-id))]
        (is (= workspace-id (:id response)))))

    #_(testing "workspace can be archived"
        (let [updated (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" workspace-id "/archive"))]
          (is (some? (:archived_at updated)))))))

(deftest ^:parallel promote-workspace-test
  (testing "POST /api/ee/workspace/:id/promote requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Promote Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (str "ee/workspace/" (:id workspace) "/merge"))))))

  (testing "Cannot promote an already archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name      "Archived Workspace"
                                               :archived_at (java.time.OffsetDateTime/now)}]
      (is (= "Cannot promote an already archived workspace"
             (mt/user-http-request :crowberto :post 400 (str "ee/workspace/" (:id workspace) "/merge")))))))

(deftest merge-workspace-with-transform-test
  (testing "POST /api/ee/workspace/:id/merge promotes transforms and archives workspace"
    (mt/with-temp [:model/Table                     _table {:schema "public" :name "merge_test_table"}
                   :model/Transform                 x1    {:name        "Upstream Transform"
                                                           :description "Original description"
                                                           :target      {:type     "table"
                                                                         :database 1
                                                                         :schema   "public"
                                                                         :name     "merge_test_table"}}]
      (let [{ws-id :id} (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                        {:name        "Merge test"
                                                         :database_id (mt/id)
                                                         :upstream    {:transforms [(:id x1)]}}))]
        (testing "We've got our workspace with transform to merge"
          (is (int? ws-id))
          ;; (sanya) TODO: maybe switch to using transform APIs once we get our own
          (let [x2-id (t2/select-one-fn :downstream_id :model/WorkspaceMappingTransform :upstream_id (:id x1))]
            (t2/update! :model/Transform :id x2-id {:description "Modified in workspace"})))
        (testing "returns promoted transforms"
          (is (=? {:promoted  [{:id (:id x1)}]
                   :workspace {:id ws-id :name "Merge test"}}
                  (mt/user-http-request :crowberto :post 200
                                        (str "ee/workspace/" ws-id "/merge")))))
        (testing "original transform was updated with workspace version"
          (is (= "Modified in workspace"
                 (t2/select-one-fn :description :model/Transform :id (:id x1)))))
        (testing "workspace was deleted after successful merge"
          (is (nil? (t2/select-one :model/Workspace :id ws-id))))))))

(deftest create-workspace-transform-permissions-test
  (testing "POST /api/ee/workspace/:id/transform requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Transform Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403
                                   (str "ee/workspace/" (:id workspace) "/transform")
                                   {:name "Should Fail"
                                    :source {:type "query"
                                             :query {}}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest create-workspace-transform-archived-test
  (testing "Cannot create transform in archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name "Archived"
                                               :archived_at (java.time.OffsetDateTime/now)}]
      (is (= "Cannot create transforms in an archived workspace"
             (mt/user-http-request :crowberto :post 400
                                   (str "ee/workspace/" (:id workspace) "/transform")
                                   {:name   "Should Fail"
                                    :source {:type  "query"
                                             :query (mt/mbql-query venues)}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest add-entities-to-workspace-test
  (testing "Add entities to workspace"
    (with-transform-cleanup! [orig-name "ws_tables_test"]
      (mt/with-temp [:model/Transform {x1-id :id} {:target {:type     "table"
                                                            :database (mt/id)
                                                            :schema   "public"
                                                            :name     orig-name}}
                     :model/Transform {x2-id :id} {:target {:type     "table"
                                                            :database (mt/id)
                                                            :schema   "public"
                                                            :name     orig-name}}]
        (let [{ws-id :id} (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                          {:name        "Add Entities Test"
                                                           :database_id (mt/id)
                                                           :upstream    {:transforms [x1-id]}}))]
          (is (int? ws-id))
          (testing "Can add new entities to workspace"
            (is (=? {:contents {:transforms [{:upstream_id x1-id}
                                             {:upstream_id x2-id}]}}
                    (mt/user-http-request :crowberto :post 200
                                          (str "ee/workspace/" ws-id "/contents")
                                          {:add {:transforms [x2-id]}}))))

          (testing "Adding duplicate entity is a noop"
            (is (=? {:contents {:transforms #(>= (count %) 2)}}
                    (mt/user-http-request :crowberto :post 200
                                          (str "ee/workspace/" ws-id "/contents")
                                          {:add {:transforms [x1-id]}}))))

          (testing "Cannot add entities to archived workspace"
            (t2/update! :model/Workspace ws-id {:archived_at (java.time.OffsetDateTime/now)})
            (is (= "Cannot add entities to an archived workspace"
                   (mt/user-http-request :crowberto :post 400
                                         (str "ee/workspace/" ws-id "/contents")
                                         {:add {:transforms [x2-id]}})))))))))

(deftest add-entities-requires-superuser-test
  (testing "POST /api/ee/workspace/:id/add requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403
                                   (str "ee/workspace/" (:id workspace) "/contents")
                                   {:add {:transforms [1]}}))))))

(deftest add-entities-no-nested-branching-test
  (testing "Cannot add transforms that belong to another workspace (no nested branching)"
    (mt/with-temp [:model/Workspace workspace-1 {:name "Workspace 1"}
                   :model/Workspace workspace-2 {:name "Workspace 2"}
                   :model/Transform transform {:name         "Downstream Transform"
                                               :workspace_id (:id workspace-1)}]
      (is (= "Cannot add transforms that belong to another workspace"
             (mt/user-http-request :crowberto :post 400
                                   (str "ee/workspace/" (:id workspace-2) "/contents")
                                   {:add {:transforms [(:id transform)]}}))))))

(deftest create-workspace-transform-test
  (mt/dataset transforms-dataset/transforms-test
    (let [workspace-id (:id (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                  {:name        "Test Workspace"
                                                   :database_id (mt/id)}))]
      (with-transform-cleanup! [table-name "workspace_transform_test"]
        (is (=? {:id           pos-int?
                 :workspace_id workspace-id
                 :creator_id   (mt/user->id :crowberto)
                 :target       {:database (mt/id)}}
                (mt/user-http-request :crowberto :post 200
                                      (str "ee/workspace/" workspace-id "/transform")
                                      {:name   "Workspace Transform"
                                       :source {:type  "query"
                                                :query (mt/mbql-query transforms_products)}
                                       :target {:type "table"
                                                :name table-name}})))))))
(deftest tables-endpoint-empty-ws-test
  (let [user-id (mt/user->id :crowberto)
        ws (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                 {:name        "My test ws"
                                  :creator_id  user-id
                                  :database_id (mt/id)})]
    (is (= {:inputs  []
            :outputs []}
           (mt/user-http-request :crowberto :get 200
                                 (str "ee/workspace/" (:id ws) "/tables"))))))

(deftest tables-endpoint-transform-not-run-test
  (let [mp          (mt/metadata-provider)
        query       (lib/native-query mp "select * from orders limit 10;")
        orig-schema "public"]
    (with-transform-cleanup! [orig-name "ws_tables_test"]
      (mt/with-temp [:model/Transform x1 {:source_type "native"
                                          :name        "My X1"
                                          :source      {:type  "query"
                                                        :query query}
                                          :target      {:type     "table"
                                                        :database (mt/id)
                                                        :schema   "public"
                                                        :name     orig-name}}]
        (let [;; create the workspace
              workspace     (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                  {:name        "Test Workspace"
                                                   :database_id (mt/id)})
              ;; add the transform
              _             (mt/user-http-request :crowberto :post 200
                                                  (str "ee/workspace/" (:id workspace) "/contents")
                                                  {:add {:transforms [(:id x1)]}})
              ;; get the tables
              tables-result (mt/user-http-request :crowberto :get 200
                                                  (str "ee/workspace/" (:id workspace) "/tables"))]
          (testing "/tables returns expected results"
            (is (= {:inputs  [{:id (mt/id :orders) :schema orig-schema :table "orders"}]
                    :outputs []}
                   tables-result))))))))

(deftest tables-endpoint-test
  (let [mp          (mt/metadata-provider)
        query       (lib/native-query mp "select * from orders limit 10;")
        orig-schema "public"]
    (with-transform-cleanup! [orig-name "ws_tables_test"]
      (mt/with-temp [:model/Transform x1 {:source_type "native"
                                          :name        "My X1"
                                          :source      {:type  "query"
                                                        :query query}
                                          :target      {:type     "table"
                                                        :database (mt/id)
                                                        :schema   "public"
                                                        :name     orig-name}}]
        ;; create the target table
        (transforms.i/execute! x1 {:run-method :manual})
        (let [;; create the workspace
              workspace        (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                               {:name        "Test Workspace"
                                                                :database_id (mt/id)}))
              ;; add the transform
              _                (mt/user-http-request :crowberto :post 200
                                                     (str "ee/workspace/" (:id workspace) "/contents")
                                                     {:add {:transforms [(:id x1)]}})
              ;; get the tables
              tables-result    (mt/user-http-request :crowberto :get 200
                                                     (str "ee/workspace/" (:id workspace) "/tables"))
              mirror-transform (t2/select-one :model/Transform :workspace_id (:id workspace))
              mirror-table     (t2/select-one :model/Table
                                              :schema (-> mirror-transform :target :schema)
                                              :name (-> mirror-transform :target :name))]
          (testing "/tables returns expected results"
            (is (=? {:inputs [{:id (mt/id :orders) :schema orig-schema :table "orders"}]
                     :outputs
                     [{:global    {:schema orig-schema :table orig-name}
                       :workspace {:transform-id (:id mirror-transform)
                                   :table-id     (:id mirror-table)}}]}
                    tables-result))))))))

;;;; Card dependency rejection tests

(defn- query-with-source-card
  "Create a pMBQL query that uses a card as its source."
  [card-id]
  {:lib/type :mbql/query
   :database (mt/id)
   :stages   [{:lib/type    :mbql.stage/mbql
               :source-card card-id}]})

(defn- create-transform-with-card-source!
  "Create a transform whose source query depends on a card.
   The after-insert hook triggers dependency calculation automatically."
  [card]
  (t2/insert-returning-instance! :model/Transform
                                 {:name   "Transform depending on card"
                                  :source {:type  :query
                                           :query (query-with-source-card (:id card))}
                                  :target {:type     "table"
                                           :database (mt/id)
                                           :schema   "public"
                                           :name     "card_dep_output"}}))

(deftest create-workspace-rejects-card-dependencies-test
  (testing "Cannot create workspace with transforms that depend on cards"
    (mt/with-temp [:model/Card card {:name          "Test Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/mbql-query venues)}]
      (let [tx       (create-transform-with-card-source! card)
            response (mt/user-http-request :crowberto :post 400 "ee/workspace"
                                           {:name        "Card Dep Workspace"
                                            :database_id (mt/id)
                                            :upstream    {:transforms [(:id tx)]}})]
        (is (re-find #"Cannot add transforms that depend on saved questions" response))))))

(deftest create-workspace-rejects-transitive-card-dependencies-test
  (testing "Cannot create workspace with transforms that transitively depend on cards"
    (mt/with-temp [:model/Card card {:name          "Base Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/mbql-query venues)}]
      ;; tx1 depends on card
      (let [tx1 (create-transform-with-card-source! card)
            ;; tx2 depends on tx1 (via a manually created dependency - simulating transform chain)
            tx2 (t2/insert-returning-instance! :model/Transform
                                               {:name   "Transform 2 - depends on tx1"
                                                :source {:type  :query
                                                         :query {:database (mt/id)
                                                                 :type     :native
                                                                 :native   {:query "SELECT 1"}}}
                                                :target {:type     "table"
                                                         :database (mt/id)
                                                         :schema   "public"
                                                         :name     "tx2_output"}})]
        ;; Create dependency: tx2 depends on tx1
        (t2/insert! :model/Dependency
                    {:from_entity_type "transform"
                     :from_entity_id   (:id tx2)
                     :to_entity_type   "transform"
                     :to_entity_id     (:id tx1)})
        ;; Try to create workspace with tx2 (which transitively depends on card via tx1)
        (let [response (mt/user-http-request :crowberto :post 400 "ee/workspace"
                                             {:name        "Transitive Card Dep Workspace"
                                              :database_id (mt/id)
                                              :upstream    {:transforms [(:id tx2)]}})]
          (is (re-find #"Cannot add transforms that depend on saved questions" response)))))))

(deftest rename-workspace-test
  (testing "POST /api/ee/workspace/:id/name updates the workspace name"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Workspace  workspace {:name          "Original Name"
                                                :database_id   (mt/id)
                                                :collection_id coll-id}]
      (let [response (mt/user-http-request :crowberto :post 200
                                           (str "ee/workspace/" (:id workspace) "/name")
                                           {:name "Updated Name"})]
        (is (= "Updated Name"
               (:name response)
               (t2/select-one-fn :name :model/Workspace :id (:id workspace)))))))

  (testing "Requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403
                                   (str "ee/workspace/" (:id workspace) "/name")
                                   {:name "Should Fail"})))))

  (testing "Cannot rename an archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name        "Archived"
                                               :archived_at (java.time.OffsetDateTime/now)}]
      (is (= "Cannot update an archived workspace"
             (mt/user-http-request :crowberto :post 400
                                   (str "ee/workspace/" (:id workspace) "/name")
                                   {:name "Should Fail"}))))))

(deftest add-entities-rejects-card-dependencies-test
  (testing "Cannot add transforms with card dependencies to existing workspace"
    (mt/with-temp [:model/Card card {:name          "Test Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/mbql-query venues)}]
      (let [tx           (create-transform-with-card-source! card)
            ;; Create a workspace without the card-dependent transform
            workspace-id (:id (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                    {:name        "Empty Workspace"
                                                     :database_id (mt/id)}))
            response     (mt/user-http-request :crowberto :post 400 (ws-url workspace-id "/contents")
                                               {:add {:transforms [(:id tx)]}})]
        (is (re-find #"Cannot add transforms that depend on saved questions" response))))))

(deftest validate-target-test
  (let [table (t2/select-one :model/Table :active true)]
    (mt/with-temp [:model/Workspace {ws-id :id}  {:name "test"}
                   :model/Transform _x1          {:workspace_id ws-id
                                                  :target       {:database (:db_id table)
                                                                 :type     "table"
                                                                 :schema   (:schema table)
                                                                 :name     (str "q_" (:name table))}}]
      (testing "Unique"
        (is (= "OK"
               (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                 (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/validate-target")
                                       {:db_id  (mt/id)
                                        :target {:type   "table"
                                                 :schema "public"
                                                 :name   (str/replace (str (random-uuid)) "-" "_")}})))))
      (testing "Conflict outside of workspace"
        (is (= "A table with that name already exists."
               (mt/user-http-request :crowberto :post 403 (ws-url ws-id "/validate-target")
                                     {:db_id  (:db_id table)
                                      :target {:type   "table"
                                               :schema (:schema table)
                                               :name   (:name table)}}))))
      (testing "Conflict inside of workspace"
        (let [table (t2/select-one :model/Table :active true)]
          (is (= "Another transform in this workspace already targets that table."
                 (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                   (mt/user-http-request :crowberto :post 403 (ws-url ws-id "/validate-target")
                                         {:db_id  (:db_id table)
                                          :target {:type   "table"
                                                   :schema (:schema table)
                                                   :name   (str "q_" (:name table))}})))))))))

;;;; Async workspace creation tests

(deftest create-workspace-returns-updating-status-test
  (testing "Creating workspace returns status :pending immediately"
    (is (=? {:status "pending"}
            (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                  {:name "async-test" :database_id (mt/id)})))))

(deftest workspace-status-becomes-ready-test
  (testing "Workspace status transitions to :ready after setup completes"
    (let [ws (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                             {:name "async-ready-test" :database_id (mt/id)}))]
      (is (= :ready (:status ws))))))

(deftest workspace-log-endpoint-test
  (testing "GET /api/ee/workspace/:id/log returns status and log entries"
    (let [{ws-id :id} (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                      {:name "log-test" :database_id (mt/id)}))]
      (is (=? {:workspace_id      ws-id
               :status            "ready"
               :updated_at        some?
               :last_completed_at some?
               :logs              [{:task   "database-isolation"
                                    :status "success"}
                                   {:task "workspace-setup"}]}
              (mt/user-http-request :crowberto :get 200
                                    (format "ee/workspace/%d/log" ws-id)))))))

(deftest workspace-log-endpoint-404-test
  (testing "GET /api/ee/workspace/:id/log returns 404 for non-existent workspace"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get 404 "ee/workspace/999999/log")))))

(deftest workspace-log-entries-created-test
  (testing "WorkspaceLog entries are created during setup"
    (let [{ws-id :id} (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                      {:name "log-entries-test" :database_id (mt/id)}))]
      (is (=? [{:task   :database-isolation
                :status :success}
               {:task   :workspace-setup
                :status :success}]
              (t2/select :model/WorkspaceLog :workspace_id ws-id {:order-by [[:started_at :desc]]}))))))

(deftest workspace-setup-failure-logs-error-test
  (testing "Failed workspace setup logs error message"
    (with-redefs [ws.isolation/ensure-database-isolation!
                  (fn [& _] (throw (ex-info "Test isolation error" {})))]
      (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                              {:name "fail-test" :database_id (mt/id)})
            _           (try (ws-ready ws-id) (catch Exception _))]
        (Thread/sleep 500)
        (is (=? [{:task    :database-isolation
                  :status  :failure
                  :message "Test isolation error"}
                 {:task   :workspace-setup
                  :status :failure}]
                (t2/select :model/WorkspaceLog :workspace_id ws-id {:order-by [[:started_at :desc]]})))))))
