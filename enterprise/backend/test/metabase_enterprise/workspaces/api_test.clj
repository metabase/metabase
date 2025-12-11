(ns ^:mb/driver-tests metabase-enterprise.workspaces.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [with-transform-cleanup!]]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.merge :as ws.merge]
   [metabase.lib.core :as lib]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [toucan2.core :as t2])
  (:import (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [tests]
                      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
                        (mt/with-premium-features [:workspaces :dependencies :transforms]
                          (search.tu/with-index-disabled
                            (tests))))))

(use-fixtures :each (fn [tests]
                      (mt/with-model-cleanup [:model/Collection
                                              :model/Transform
                                              :model/Workspace
                                              :model/WorkspaceTransform
                                              :model/WorkspaceMappingTransform]
                        (tests))))

(defn ws-url [id & [path]]
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
             (mt/user-http-request :rasta :get 403 (ws-url (:id workspace) "")))))

    (testing "POST /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/workspace"
                                   {:name "Unauthorized Workspace"})))))

  (mt/with-temp [:model/Workspace workspace {:name "Put Workspace"}]
    (testing "PUT /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (ws-url (:id workspace) "")
                                   {:name "Updated"})))))

  (mt/with-temp [:model/Workspace workspace {:name "Delete Workspace"}]
    (testing "DELETE /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (ws-url (:id workspace) ""))))))

  (mt/with-temp [:model/Workspace workspace {:name "Promote Workspace"}]
    (testing "POST /api/ee/workspace/:id/promote requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/merge")))))))

(deftest workspace-crud-flow-test
  (let [workspace-name (str "Workspace " (random-uuid))
        created        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                             {:name        workspace-name
                                              :database_id (mt/id)})
        workspace-id   (:id created)
        collection-id  (:collection_id created)]
    (is (=? {:id            int?
             :collection_id int?
             :name          workspace-name}
            created))
    (testing "the collection exists, and we have a back reference"
      (is (t2/exists? :model/Workspace :id workspace-id :collection_id collection-id))
      (is (t2/exists? :model/Collection :id collection-id :workspace_id workspace-id)))

    (testing "workspace appears in list response"
      (let [{:keys [items]} (mt/user-http-request :crowberto :get 200 "ee/workspace")]
        (is (some #(= workspace-id (:id %)) items))))

    (testing "workspace can be fetched individually"
      (is (=? {:id workspace-id}
              (mt/user-http-request :crowberto :get 200 (ws-url workspace-id "")))))

    (testing "workspace can be archived"
      (let [updated (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" workspace-id "/archive"))]
        (is (some? (:archived_at updated)))))

    (testing "workspace can be unarchived"
      (let [updated (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" workspace-id "/unarchive"))]
        (is (nil? (:archived_at updated)))))))

(deftest ^:parallel promote-workspace-test
  (testing "POST /api/ee/workspace/:id/promote requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Promote Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/merge"))))))

  (testing "Cannot merge an already archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name        "Archived Workspace"
                                               :archived_at (OffsetDateTime/now)}]
      (is (= "Cannot merge an archived workspace"
             (mt/user-http-request :crowberto :post 400 (ws-url (:id workspace) "/merge")))))))

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
                                                         :database_id (mt/id)}))]
        (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                              (merge {:global_id (:id x1)}
                                     (select-keys x1 [:name :description :source :target])))
        (testing "We've got our workspace with transform to merge"
          (is (int? ws-id))
          ;; (sanya) TODO: maybe switch to using transform APIs once we get our own
          (let [x2-id (t2/select-one-fn :downstream_id :model/WorkspaceMappingTransform :upstream_id (:id x1))]
            (t2/update! :model/Transform :id x2-id {:description "Modified in workspace"})))
        (testing "returns merged transforms"
          (is (=? {:merged    {:transforms [(:id x1)]}
                   :errors    []
                   :workspace {:id ws-id :name "Merge test"}}
                  (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge")))))
        ;; TODO re-implement merge
        #_(testing "original transform was updated with workspace version"
            (is (= "Modified in workspace"
                   (t2/select-one-fn :description :model/Transform :id (:id x1)))))
        (testing "workspace was deleted after successful merge"
          (is (nil? (t2/select-one :model/Workspace :id ws-id))))))))

(deftest merge-workspace-failure-test
  (testing "transactions"
    (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                   :model/Table     _table {:schema "public" :name "merge_test_table_2"}
                   :model/Transform x1 {:name        "Upstream Transform 1"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database 1
                                                      :schema   "public"
                                                      :name     "merge_test_table"}}
                   :model/Transform x2 {:name        "Upstream Transform 2"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database 1
                                                      :schema   "public"
                                                      :name     "merge_test_table_2"}}]
      (let [;; Create a workspace
            {ws-id :id} (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                        {:name        "Merge test"
                                                         :database_id (mt/id)}))
            ;; Add 2 transforms
            ws-x-1 (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                         (merge {:global_id (:id x1)}
                                                (select-keys x1 [:name :description :source :target])))
            ws-x-2 (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                         (merge {:global_id (:id x2)}
                                                (select-keys x1 [:name :description :source :target])))]
        ;; Update workspace transforms -- TODO: handle through appropriate api calls
        (t2/update! :model/WorkspaceTransform :ref_id (:ref_id ws-x-1) {:name "UPDATED 1"})
        (t2/update! :model/WorkspaceTransform :ref_id (:ref_id ws-x-2) {:name "UPDATED 2"})
        (let [merge-transorm! ws.merge/merge-transform!]
          (with-redefs [ws.merge/merge-transform! (let [call-count (atom 0)]
                                                    (fn [& args]
                                                      (when (> @call-count 0)
                                                        (throw (Exception. "boom")))
                                                      (swap! call-count inc)
                                                      (apply merge-transorm! args)))]
            (testing "Merging should atomically rollback on failure"
              @(def cau (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge"))))
            @(def yyy (t2/select :model/Transform :id [:in [(:id x1) (:id x2)]]))))))))

(deftest create-workspace-transform-permissions-test
  (testing "POST /api/ee/workspace/:id/transform requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Transform Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/transform")
                                   {:name   "Should Fail"
                                    :source {:type  "query"
                                             :query {}}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest create-workspace-transform-archived-test
  (testing "Cannot create transform in archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name        "Archived"
                                               :archived_at (OffsetDateTime/now)}]
      (is (= "Cannot create transforms in an archived workspace"
             (mt/user-http-request :crowberto :post 400 (ws-url (:id workspace) "/transform")
                                   {:name   "Should Fail"
                                    :source {:type  "query"
                                             :query (mt/mbql-query venues)}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest add-transforms-to-workspace-test
  (testing "Add transforms to workspace via POST /transform"
    (with-transform-cleanup! [orig-name "ws_tables_test"]
      (mt/with-temp [:model/Transform {x1-id :id :as x1} {:target {:type     "table"
                                                                   :database (mt/id)
                                                                   :schema   "public"
                                                                   :name     orig-name}}]
        (let [{ws-id :id} (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                          {:name        "Add Transforms Test"
                                                           :database_id (mt/id)}))]
          (is (int? ws-id))
          (testing "Can check out a global transform into workspace"
            (is (=? {:ref_id    string?
                     :global_id x1-id}
                    (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                          (merge {:global_id x1-id}
                                                 (select-keys x1 [:name :description :source :target]))))))

          (testing "Can create a new provisional transform"
            (is (=? {:ref_id    string?
                     :global_id nil?
                     :name      "New Transform"}
                    (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                          {:name   "New Transform"
                                           :source {:type  "query"
                                                    :query (mt/mbql-query venues)}
                                           :target {:type "table"
                                                    :name "new_transform_output"}}))))

          (testing "Cannot add transforms to archived workspace"
            (t2/update! :model/Workspace ws-id {:archived_at (OffsetDateTime/now)})
            (is (= "Cannot create transforms in an archived workspace"
                   (mt/user-http-request :crowberto :post 400 (ws-url ws-id "/transform")
                                         {:name   "Should Fail"
                                          :source {:type  "query"
                                                   :query (mt/mbql-query venues)}
                                          :target {:type "table"
                                                   :name "should_fail"}})))))))))

(deftest add-entities-requires-superuser-test
  (testing "POST /api/ee/workspace/:id/add requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/transform")
                                   {:name "blah", :source {}, :target {}}))))))

(deftest create-workspace-transform-test
  (mt/dataset transforms-dataset/transforms-test
    (let [{ws-id :id} (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                      {:name        "Test Workspace"
                                                       :database_id (mt/id)}))]
      (with-transform-cleanup! [table-name "workspace_transform_test"]
        (is (=? {:ref_id       string?
                 :workspace_id ws-id
                 ;:creator_id   (mt/user->id :crowberto)
                 :target       {:database (mt/id)}}
                (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                      {:name   "Workspace Transform"
                                       :source {:type  "query"
                                                :query (mt/mbql-query transforms_products)}
                                       :target {:type "table"
                                                :name table-name}})))
        (is (=? {:id ws-id, :status "ready"}
                (mt/user-http-request :crowberto :get 200 (ws-url ws-id))))
        (is (=? {:transforms [{:ref_id string?, :name "Workspace Transform", :source_type "query"}]}
                (mt/user-http-request :crowberto :get 200 (ws-url ws-id "/transform"))))))))

(deftest tables-endpoint-empty-ws-test
  (let [user-id (mt/user->id :crowberto)
        ws      (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                      {:name        "My test ws"
                                       :creator_id  user-id
                                       :database_id (mt/id)})]
    (is (= {:inputs  []
            :outputs []}
           (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "/table"))))))

(deftest tables-endpoint-transform-not-run-test
  (let [mp    (mt/metadata-provider)
        query (lib/native-query mp "select * from orders limit 10;")]
    (with-transform-cleanup! [orig-name "ws_tables_test"]
      (mt/with-temp [:model/Transform x1 {:source_type "native"
                                          :name        "My X1"
                                          :source      {:type  "query"
                                                        :query query}
                                          :target      {:type     "table"
                                                        :database (mt/id)
                                                        :schema   "public"
                                                        :name     orig-name}}]
        (let [{ws-id :id}   (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                  {:name        "Test Workspace"
                                                   :database_id (mt/id)})
              ;; add the transform
              ref_id        (:ref_id (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform") x1))
              ;; get the tables
              tables-result (mt/user-http-request :crowberto :get 200 (ws-url ws-id "/table"))]
          (testing "/tables returns expected results"
            (is (=? {:inputs  [#_{:id (mt/id :orders) :schema orig-schema :table "orders"}]
                     :outputs [{:db_id (mt/id)
                                :global {:schema "public", :table orig-name}
                                :isolated {:transform_id ref_id}}]}
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
        ;; TODO: add a provisional transform, and make sure one of the output tables is created
        ;; create the global table
        (transforms.i/execute! x1 {:run-method :manual})
        (let [workspace        (ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                               {:name        "Test Workspace"
                                                                :database_id (mt/id)}))
              ;; add the transform
              ref-id           (:ref_id (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/transform") x1))
              ;; get the tables
              tables-result    (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/table"))
              mirror-transform (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace))
              mirror-table     (t2/select-one :model/Table
                                              :schema (-> mirror-transform :target :schema)
                                              :name (-> mirror-transform :target :name))]
          (testing "/table returns expected results"
            ;; TODO: implement inputs (requires query analysis)
            (is (=? {:inputs [#_{:id (mt/id :orders) :schema orig-schema :table "orders"}]
                     :outputs
                     [{:db_id    (mt/id)
                       :global   {:schema orig-schema :table orig-name, :table_id (:id mirror-table)}
                       :isolated {:transform_id ref-id}}]}
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

(deftest add-transform-rejects-card-dependencies-test
  (testing "Cannot add transforms that depend on cards"
    (mt/with-temp [:model/Card card {:name          "Test Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/mbql-query venues)}]
      (let [tx        (create-transform-with-card-source! card)
            ws        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name        "Card Dep Workspace"
                                             :database_id (mt/id)})
            ;; TODO add validation
            _response (mt/user-http-request :crowberto :post 200 #_403 (ws-url (:id ws) "/transform") tx)]
        #_(is (re-find #"Cannot add transforms that depend on saved questions" ws))))))

(deftest add-transform-rejects-transitive-card-dependencies-test
  (testing "Cannot add transforms that transitively depend on cards"
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
        ;; Try to add tx2 (which transitively depends on card via tx1) to workspace
        (let [ws        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                              {:name        "Transitive Card Dep Workspace"
                                               :database_id (mt/id)})
              ;; TODO add validation
              _response (mt/user-http-request :crowberto :post 200 #_403 (ws-url (:id ws) "/transform") tx2)]
          #_(is (re-find #"Cannot add transforms that depend on saved questions" response)))))))

(deftest rename-workspace-test
  (testing "POST /api/ee/workspace/:id/name updates the workspace name"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Workspace  workspace     {:name          "Original Name"
                                                    :database_id   (mt/id)
                                                    :collection_id coll-id}]
      (let [response (mt/user-http-request :crowberto :put 200 (ws-url (:id workspace))
                                           {:name "Updated Name"})]
        (is (= "Updated Name"
               (:name response)
               (t2/select-one-fn :name :model/Workspace :id (:id workspace)))))))

  (testing "Requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (ws-url (:id workspace))
                                   {:name "Should Fail"})))))

  (testing "Cannot rename an archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name        "Archived"
                                               :archived_at (OffsetDateTime/now)}]
      (is (= "Cannot update an archived workspace"
             (mt/user-http-request :crowberto :put 400 (ws-url (:id workspace))
                                   {:name "Should Fail"}))))))

(deftest add-transform-rejects-card-dependencies-to-existing-workspace-test
  (testing "Cannot add transforms with card dependencies to existing workspace"
    (mt/with-temp [:model/Card card {:name          "Test Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/mbql-query venues)}]
      (let [tx           (create-transform-with-card-source! card)
            workspace-id (:id (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                    {:name        "Empty Workspace"
                                                     :database_id (mt/id)}))
            ;; TODO add validation
            _response    (mt/user-http-request :crowberto :post 200 (ws-url workspace-id "/transform") tx)]
        #_(is (re-find #"Cannot add transforms that depend on saved questions" response))))))

(deftest validate-target-test
  (let [table (t2/select-one :model/Table :active true)]
    (mt/with-temp [:model/Workspace          {ws-id :id}  {:name "test"}
                   :model/WorkspaceTransform _x1          {:workspace_id ws-id
                                                           :target       {:database (:db_id table)
                                                                          :type     "table"
                                                                          :schema   (:schema table)
                                                                          :name     (str "q_" (:name table))}}]
      (testing "Unique"
        (is (= "OK"
               (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                 (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform/validate/target")
                                       {:db_id  (mt/id)
                                        :target {:type   "table"
                                                 :schema "public"
                                                 :name   (str/replace (str (random-uuid)) "-" "_")}})))))
      ;; We've decided to defer this error until merge.
      ;; Also, this logic is going to become more relaxed, where we're allowed to take over a "dormant" table.
      #_(testing "Conflict outside of workspace"
          (is (= "A table with that name already exists."
                 (mt/user-http-request :crowberto :post 403 (ws-url ws-id "/transform/validate/target")
                                       {:db_id  (:db_id table)
                                        :target {:type   "table"
                                                 :schema (:schema table)
                                                 :name   (:name table)}}))))
      (testing "Conflict inside of workspace"
        (let [table (t2/select-one :model/Table :active true)]
          (is (= "Another transform in this workspace already targets that table."
                 (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                   (mt/user-http-request :crowberto :post 403 (ws-url ws-id "/transform/validate/target")
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
              (mt/user-http-request :crowberto :get 200 (ws-url ws-id "/log")))))))

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

;;; ---------------------------------------- Workspace Transform CRUD Tests ----------------------------------------

(deftest get-workspace-transforms-test
  (testing "GET /api/ee/workspace/:id/transform"
    (mt/with-temp [:model/Workspace          workspace {:name "List Transforms Test"}
                   :model/WorkspaceTransform tx1       {:name         "Transform 1"
                                                        :workspace_id (:id workspace)}
                   :model/WorkspaceTransform tx2       {:name         "Transform 2"
                                                        :workspace_id (:id workspace)}
                   :model/Transform          _tx3      {:name "Global Transform"}]
      (testing "returns transforms in workspace"
        (is (=? {:transforms [{:ref_id (:ref_id tx1)}
                              {:ref_id (:ref_id tx2)}]}
                (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/transform")))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (ws-url (:id workspace) "/transform"))))))
    (testing "returns empty list when no transforms"
      (mt/with-temp [:model/Workspace workspace {:name "Empty Workspace"}]
        (is (= {:transforms []}
               (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/transform"))))))
    (testing "returns 404 for non-existent workspace"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "ee/workspace/999999/transform"))))))

(deftest get-workspace-transform-by-id-test
  (testing "GET /api/ee/workspace/:id/transform/:txid"
    (mt/with-temp [:model/Workspace          workspace1 {:name "Workspace 1"}
                   :model/Workspace          workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform  {:name         "My Transform"
                                                         :description  "Test description"
                                                         :workspace_id (:id workspace1)}]
      (testing "returns specific transform"
        (is (=? {:ref_id      (:ref_id transform)
                 :name        "My Transform"
                 :description "Test description"}
                (mt/user-http-request :crowberto :get 200
                                      (ws-url (:id workspace1) (str "/transform/" (:ref_id transform)))))))
      (testing "returns 404 if transform not in workspace"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404
                                     (ws-url (:id workspace2) (str "/transform/" (:ref_id transform)))))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403
                                     (ws-url (:id workspace1) (str "/transform/" (:ref_id transform))))))))))

(deftest update-workspace-transform-test
  (testing "PUT /api/ee/workspace/:id/transform/:txid"
    (mt/with-temp [:model/Workspace          workspace1 {:name "Workspace 1"}
                   :model/Workspace          workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform {:name         "Original Name"
                                                        :description  "Original description"
                                                        :workspace_id (:id workspace1)}]
      (testing "updates transform"
        (is (=? {:ref_id      (:ref_id transform)
                 :name        "Updated Name"
                 :description "Updated description"}
                (mt/user-http-request :crowberto :put 200
                                      (ws-url (:id workspace1) (str "/transform/" (:ref_id transform)))
                                      {:name        "Updated Name"
                                       :description "Updated description"})))
        (is (= "Updated Name" (t2/select-one-fn :name :model/WorkspaceTransform :ref_id (:ref_id transform)))))
      (testing "returns 404 if transform not in workspace"
        (is (= "Not found."
               (mt/user-http-request :crowberto :put 404
                                     (ws-url (:id workspace2) (str "/transform/" (:ref_id transform)))
                                     {:name "Should Fail"}))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403
                                     (ws-url (:id workspace1) (str "/transform/" (:ref_id transform)))
                                     {:name "Should Fail"})))))))

(deftest delete-workspace-transform-test
  (testing "DELETE /api/ee/workspace/:id/transform/:txid"
    (mt/with-temp [:model/Workspace workspace1 {:name "Workspace 1"}
                   :model/Workspace workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform1 {:name         "Transform in WS1"
                                                         :workspace_id (:id workspace1)}
                   :model/WorkspaceTransform transform2 {:name         "To Delete"
                                                         :workspace_id (:id workspace1)}]
      (testing "returns 404 if transform not in workspace"
        (is (= "Not found."
               (mt/user-http-request :crowberto :delete 404
                                     (ws-url (:id workspace2) (str "/transform/" (:ref_id transform1)))))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403
                                     (ws-url (:id workspace1) (str "/transform/" (:ref_id transform1)))))))
      (testing "deletes transform"
        (is (nil? (mt/user-http-request :crowberto :delete 204
                                        (ws-url (:id workspace1) (str "/transform/" (:ref_id transform2))))))
        (is (some? (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id transform1))))
        (is (nil? (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id transform2))))))))

(deftest run-workspace-transform-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/run"
    (mt/with-temp [:model/Workspace workspace1 {:name "Workspace 1"}
                   :model/Workspace workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform {:name         "Transform in WS1"
                                                        :workspace_id (:id workspace1)}]
      (testing "returns 404 if transform not in workspace"
        (is (= "Not found."
               (mt/user-http-request :crowberto :post 404
                                     (ws-url (:id workspace2) (str "/transform/" (:ref_id transform) "/run"))))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403
                                     (ws-url (:id workspace1) (str "/transform/" (:ref_id transform) "/run")))))))))

(deftest run-workspace-test
  (testing "POST /api/ee/workspace/:id/execute"
    (mt/with-temp [:model/Workspace          workspace1 {:name "Workspace 1"}
                   :model/Workspace          workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform  {:name         "Transform in WS1"
                                                         :workspace_id (:id workspace1)}]
      (testing "returns empty when no transforms"
        (is (= {:succeeded []
                :failed    []
                :not_run   []}
               (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace2) "/run")))))
      (testing "executes transforms in workspace"
        (is (= {:succeeded [(:ref_id transform)]
                :failed    []
                :not_run   []}
               (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace1) "/run"))))))))
