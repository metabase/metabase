(ns ^:mb/driver-tests metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [with-transform-cleanup!]]
   [metabase.lib.core :as lib]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features [:workspaces :dependencies :transforms]
      (mt/with-model-cleanup [:model/Collection :model/Workspace :model/Transform]
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
                (is (some? (:archived_at updated))))))))))

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
  (search.tu/with-index-disabled
    (testing "POST /api/ee/workspace/:id/merge promotes transforms and archives workspace"
      (mt/with-premium-features #{:workspaces :dependencies}
        (mt/with-temp [:model/Table                     _table {:schema "public" :name "merge_test_table"}
                       :model/Transform                 x1    {:name        "Upstream Transform"
                                                               :description "Original description"
                                                               :target      {:type     "table"
                                                                             :database 1
                                                                             :schema   "public"
                                                                             :name     "merge_test_table"}}]
          (mt/with-model-cleanup [:model/Workspace :model/Transform :model/WorkspaceMappingTransform]
            (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                    {:name        "Merge test"
                                                     :database_id (mt/id)
                                                     :upstream    {:transforms [(:id x1)]}})]
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
                (is (nil? (t2/select-one :model/Workspace :id ws-id)))))))))))

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
    (mt/with-premium-features [:transforms]
      (mt/with-temp [:model/Workspace workspace {:name "Archived"
                                                 :archived_at (java.time.OffsetDateTime/now)}]
        (is (= "Cannot create transforms in an archived workspace"
               (mt/user-http-request :crowberto :post 400
                                     (str "ee/workspace/" (:id workspace) "/transform")
                                     {:name "Should Fail"
                                      :source {:type "query"
                                               :query (mt/mbql-query venues)}
                                      :target {:type "table"
                                               :name "should_fail"}})))))))

(deftest add-entities-to-workspace-test
  (testing "Add entities to workspace"
    (search.tu/with-index-disabled
      (mt/with-premium-features [:workspaces :dependencies :transforms]
        (with-transform-cleanup! [orig-name "ws_tables_test"]
          (mt/with-temp [:model/Transform {x1-id :id} {:target      {:type     "table"
                                                                     :database (mt/id)
                                                                     :schema   "public"
                                                                     :name     orig-name}}
                         :model/Transform {x2-id :id} {:target      {:type     "table"
                                                                     :database (mt/id)
                                                                     :schema   "public"
                                                                     :name     orig-name}}]
            (mt/with-model-cleanup [:model/Collection :model/Workspace :model/Transform :model/WorkspaceMappingTransform]
              (let [workspace-id (:id (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                            {:name        "Add Entities Test"
                                                             :database_id (mt/id)
                                                             :upstream    {:transforms [x1-id]}}))]
                (is (int? workspace-id))
                (testing "Can add new entities to workspace"
                  (is (=? {:contents {:transforms #(>= (count %) 2)}}
                          (mt/user-http-request :crowberto :post 200
                                                (str "ee/workspace/" workspace-id "/contents")
                                                {:add {:transforms [x2-id]}}))))

                (testing "Adding duplicate entity is a noop"
                  (is (=? {:contents {:transforms #(>= (count %) 2)}}
                          (mt/user-http-request :crowberto :post 200
                                                (str "ee/workspace/" workspace-id "/contents")
                                                {:add {:transforms [x1-id]}}))))

                (testing "Cannot add entities to archived workspace"
                  (t2/update! :model/Workspace workspace-id {:archived_at (java.time.OffsetDateTime/now)})
                  (is (= "Cannot add entities to an archived workspace"
                         (mt/user-http-request :crowberto :post 400
                                               (str "ee/workspace/" workspace-id "/contents")
                                               {:add {:transforms [x2-id]}}))))))))))))

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
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:workspaces :transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-model-cleanup [:model/Workspace :model/Transform :model/Collection]
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
                                             :target {:type   "table"
                                                      :name   table-name}}))))))))))
(deftest tables-endpoint-empty-ws-test
  (mt/test-driver
    :postgres
    (mt/with-model-cleanup [:model/Workspace]
      (let [user-id (mt/user->id :crowberto)
            ws (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                     {:name "My test ws"
                                      :creator_id user-id
                                      :database_id (mt/id)})]
        (is (= {:inputs []
                :outputs []}
               (mt/user-http-request :crowberto :get 200
                                     (str "ee/workspace/" (:id ws) "/tables"))))))))

(deftest tables-endpoint-transform-not-run-test
  (mt/test-driver
    :postgres
    (mt/with-model-cleanup [:model/Workspace :model/Transform :model/Collection]
      (let [mp (mt/metadata-provider)
            query (lib/native-query mp "select * from orders limit 10;")
            orig-schema "public"]
        (with-transform-cleanup! [orig-name "ws_tables_test"]
          (mt/with-temp [:model/Transform x1 {:source_type "native"
                                              :name "My X1"
                                              :source {:type "query"
                                                       :query query}
                                              :target {:type "table"
                                                       :database (mt/id)
                                                       :schema "public"
                                                       :name orig-name}}]
            (let [;; create the workspace
                  workspace (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                  {:name        "Test Workspace"
                                                   :database_id (mt/id)})
                 ;; add the transform
                  _ (mt/user-http-request :crowberto :post 200
                                          (str "ee/workspace/" (:id workspace) "/contents")
                                          {:add {:transforms [(:id x1)]}})
                 ;; get the tables
                  tables-result (mt/user-http-request :crowberto :get 200
                                                      (str "ee/workspace/" (:id workspace) "/tables"))]
              (testing "/tables returns expected results"
                (is (= {:inputs [{:id (mt/id :orders) :schema orig-schema :table "orders"}]
                        :outputs []}
                       tables-result))))))))))

(deftest tables-endpoint-test
  (mt/test-driver
    :postgres
    (mt/with-model-cleanup [:model/Workspace :model/Transform :model/Collection]
      (let [mp (mt/metadata-provider)
            query (lib/native-query mp "select * from orders limit 10;")
            orig-schema "public"]
        (with-transform-cleanup! [orig-name "ws_tables_test"]
          (mt/with-temp [:model/Transform x1 {:source_type "native"
                                              :name "My X1"
                                              :source {:type "query"
                                                       :query query}
                                              :target {:type "table"
                                                       :database (mt/id)
                                                       :schema "public"
                                                       :name orig-name}}]
            ;; create the target table
            (transforms.i/execute! x1 {:run-method :manual})
            (let [;; create the workspace
                  workspace (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                  {:name        "Test Workspace"
                                                   :database_id (mt/id)})
                  ;; add the transform
                  _ (mt/user-http-request :crowberto :post 200
                                          (str "ee/workspace/" (:id workspace) "/contents")
                                          {:add {:transforms [(:id x1)]}})
                 ;; get the tables
                  tables-result (mt/user-http-request :crowberto :get 200
                                                      (str "ee/workspace/" (:id workspace) "/tables"))
                  mirror-transform (t2/select-one :model/Transform :workspace_id (:id workspace))
                  mirror-table (t2/select-one :model/Table
                                              :schema (-> mirror-transform :target :schema)
                                              :name (-> mirror-transform :target :name))]
              (testing "/tables returns expected results"
                (is (=? {:inputs [{:id (mt/id :orders) :schema orig-schema :table "orders"}]
                         :outputs
                         [{:global {:schema orig-schema :table orig-name}
                           :workspace {:transform-id (:id mirror-transform)
                                       :table-id (:id mirror-table)}}]}
                        tables-result))))))))))

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
    (mt/with-premium-features #{:workspaces :dependencies :transforms}
      (mt/with-model-cleanup [:model/Dependency :model/Transform]
        (mt/with-temp [:model/Card card {:name          "Test Card"
                                         :database_id   (mt/id)
                                         :dataset_query (mt/mbql-query venues)}]
          (let [tx       (create-transform-with-card-source! card)
                response (mt/user-http-request :crowberto :post 400 "ee/workspace"
                                               {:name        "Card Dep Workspace"
                                                :database_id (mt/id)
                                                :upstream    {:transforms [(:id tx)]}})]
            (is (re-find #"Cannot add transforms that depend on saved questions" response))))))))

(deftest create-workspace-rejects-transitive-card-dependencies-test
  (testing "Cannot create workspace with transforms that transitively depend on cards"
    (mt/with-premium-features #{:workspaces :dependencies :transforms}
      (mt/with-model-cleanup [:model/Dependency :model/Transform]
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
              (is (re-find #"Cannot add transforms that depend on saved questions" response)))))))))

(deftest rename-workspace-test
  (search.tu/with-index-disabled
    (testing "POST /api/ee/workspace/:id/name updates the workspace name"
      (mt/with-model-cleanup [:model/Collection :model/Workspace]
        (let [workspace (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                              {:name        "Original Name"
                                               :database_id (mt/id)})
              response  (mt/user-http-request :crowberto :post 200
                                              (str "ee/workspace/" (:id workspace) "/name")
                                              {:name "Updated Name"})]
          (is (= "Updated Name"
                 (:name response)
                 (t2/select-one-fn :name :model/Workspace :id (:id workspace))))))))

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
    (mt/with-premium-features #{:workspaces :dependencies :transforms}
      (mt/with-model-cleanup [:model/Workspace :model/Dependency :model/Collection :model/Transform]
        (mt/with-temp [:model/Card card {:name          "Test Card"
                                         :database_id   (mt/id)
                                         :dataset_query (mt/mbql-query venues)}]
          (let [tx (create-transform-with-card-source! card)
                ;; Create a workspace without the card-dependent transform
                workspace-id (:id (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                        {:name        "Empty Workspace"
                                                         :database_id (mt/id)}))
                response     (mt/user-http-request :crowberto :post 400
                                                   (str "ee/workspace/" workspace-id "/contents")
                                                   {:add {:transforms [(:id tx)]}})]
            (is (re-find #"Cannot add transforms that depend on saved questions" response))))))))
