(ns metabase-enterprise.remote-sync.content-read-isolation-test
  "Read-isolation coverage for remote-sync WORKSPACE scoping: `can-read?`/`can-write?` gating on content models that
  don't route through collection permissions (Segment, Measure, TransformTag, Action), and workspace-visibility
  filtering on the broad `GET` list endpoints for segments, measures, cards, and dashboards. A main-scope caller
  (`api/*current-workspace-id*` `nil`) must never see workspace-tagged content, and a workspace-scoped caller must
  never see main or other workspaces' content."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :test-users-personal-collections))

;;; ------------------------------------------------ can-read?/can-write? ----------------------------------------

(deftest segment-can-read-cross-workspace-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}]
      (binding [api/*current-workspace-id* (:id wt)]
        (mt/with-temp [:model/Segment wt-segment {:table_id (mt/id :venues) :name "wt segment"}]
          (testing "the workspace scope can read its own segment"
            (is (true? (mi/can-read? wt-segment))))
          (testing "the main scope cannot read a workspace segment"
            (binding [api/*current-workspace-id* nil]
              (is (false? (mi/can-read? wt-segment)))))))
      (mt/with-temp [:model/Segment main-segment {:table_id (mt/id :venues) :name "main segment"}]
        (testing "the main scope can read its own segment"
          (is (true? (mi/can-read? main-segment))))
        (testing "a workspace scope cannot read a main segment"
          (binding [api/*current-workspace-id* (:id wt)]
            (is (false? (mi/can-read? main-segment)))))))))

(deftest measure-can-read-cross-workspace-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}]
      (binding [api/*current-workspace-id* (:id wt)]
        (mt/with-temp [:model/Measure wt-measure {:table_id (mt/id :venues) :name "wt measure"}]
          (testing "the workspace scope can read its own measure"
            (is (true? (mi/can-read? wt-measure))))
          (testing "the main scope cannot read a workspace measure"
            (binding [api/*current-workspace-id* nil]
              (is (false? (mi/can-read? wt-measure)))))))
      (mt/with-temp [:model/Measure main-measure {:table_id (mt/id :venues) :name "main measure"}]
        (testing "the main scope can read its own measure"
          (is (true? (mi/can-read? main-measure))))
        (testing "a workspace scope cannot read a main measure"
          (binding [api/*current-workspace-id* (:id wt)]
            (is (false? (mi/can-read? main-measure)))))))))

(deftest transform-tag-can-read-write-cross-workspace-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}]
      (binding [api/*current-workspace-id* (:id wt)]
        (mt/with-temp [:model/TransformTag wt-tag {:name "wt tag"}]
          (testing "the workspace scope can read/write its own tag"
            (is (true? (mi/can-read? wt-tag)))
            (is (true? (mi/can-write? wt-tag))))
          (testing "the main scope cannot read/write a workspace tag"
            (binding [api/*current-workspace-id* nil]
              (is (false? (mi/can-read? wt-tag)))
              (is (false? (mi/can-write? wt-tag)))))))
      (mt/with-temp [:model/TransformTag main-tag {:name "main tag"}]
        (testing "the main scope can read/write its own tag"
          (is (true? (mi/can-read? main-tag)))
          (is (true? (mi/can-write? main-tag))))
        (testing "a workspace scope cannot read/write a main tag"
          (binding [api/*current-workspace-id* (:id wt)]
            (is (false? (mi/can-read? main-tag)))
            (is (false? (mi/can-write? main-tag)))))))))

(defn- action-instance
  "An in-memory :model/Action instance backed by a real Card (so `perms-objects-set` can resolve it), without going
  through the multi-table Action insert flow -- `can-read?`/`can-write?` for Action only ever look at `:model_id`
  and `:workspace_id` on the instance."
  [card-id workspace-id]
  (t2/instance :model/Action {:model_id card-id :workspace_id workspace-id}))

(deftest action-can-read-write-cross-workspace-test
  ;; Two distinct superusers, each with a *fixed* workspace scope for the whole test (one per `:workspace_id` on the
  ;; User row itself, resolved automatically by `with-current-user`): every user's own permission set always
  ;; includes readwrite on their personal collection, lazily creating it on first access. Checking the SAME user
  ;; from both scopes would need two personal collections (one per scope) for that one user, which the
  ;; `collection.personal_owner_id` unique index doesn't support yet -- unrelated to what this test covers, so we
  ;; sidestep it by keeping each user's scope constant.
  (mt/with-temp [:model/Workspace wt            {:branch (str (random-uuid))}
                 :model/Collection         wt-coll        {:name "wt action coll"}
                 :model/Collection         main-coll      {:name "main action coll"}
                 :model/User               wt-superuser   {:is_superuser true :workspace_id (:id wt)}
                 :model/User               main-superuser {:is_superuser true}]
    (mt/with-current-user (:id wt-superuser)
      (mt/with-temp [:model/Card wt-card {:type :model :collection_id (:id wt-coll) :dataset_query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}]
        (let [wt-action (action-instance (:id wt-card) (:id wt))]
          (testing "the workspace scope can read/write its own action"
            (is (true? (mi/can-read? wt-action)))
            (is (true? (mi/can-write? wt-action))))
          (mt/with-current-user (:id main-superuser)
            (testing "the main scope cannot read/write a workspace action"
              (is (false? (mi/can-read? wt-action)))
              (is (false? (mi/can-write? wt-action))))))))
    (mt/with-current-user (:id main-superuser)
      (mt/with-temp [:model/Card main-card {:type :model :collection_id (:id main-coll) :dataset_query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}]
        (let [main-action (action-instance (:id main-card) nil)]
          (testing "the main scope can read/write its own action"
            (is (true? (mi/can-read? main-action)))
            (is (true? (mi/can-write? main-action))))
          (mt/with-current-user (:id wt-superuser)
            (testing "a workspace scope cannot read/write a main action"
              (is (false? (mi/can-read? main-action)))
              (is (false? (mi/can-write? main-action))))))))))

;;; ------------------------------------------------- List endpoints ---------------------------------------------

(deftest segment-list-workspace-isolation-test
  (mt/with-full-data-perms-for-all-users!
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}
                   :model/User wt-user {:workspace_id (:id wt)}]
      (binding [api/*current-workspace-id* (:id wt)]
        (mt/with-temp [:model/Segment wt-segment {:table_id (mt/id :venues) :name "wt segment"}]
          (testing "GET /api/segment/ excludes workspace content from the main user"
            (is (not (contains? (into #{} (map :id) (mt/user-http-request :rasta :get 200 "segment/"))
                                (:id wt-segment)))))
          (testing "GET /api/segment/ includes workspace content for the workspace user"
            (is (contains? (into #{} (map :id) (mt/user-http-request wt-user :get 200 "segment/"))
                           (:id wt-segment))))))
      (mt/with-temp [:model/Segment main-segment {:table_id (mt/id :venues) :name "main segment"}]
        (testing "GET /api/segment/ includes main content for the main user"
          (is (contains? (into #{} (map :id) (mt/user-http-request :rasta :get 200 "segment/"))
                         (:id main-segment))))
        (testing "GET /api/segment/ excludes main content from the workspace user"
          (is (not (contains? (into #{} (map :id) (mt/user-http-request wt-user :get 200 "segment/"))
                              (:id main-segment)))))))))

(deftest measure-list-workspace-isolation-test
  (mt/with-full-data-perms-for-all-users!
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}
                   :model/User wt-user {:workspace_id (:id wt)}]
      (binding [api/*current-workspace-id* (:id wt)]
        (mt/with-temp [:model/Measure wt-measure {:table_id (mt/id :venues) :name "wt measure"}]
          (testing "GET /api/measure/ excludes workspace content from the main user"
            (is (not (contains? (into #{} (map :id) (mt/user-http-request :rasta :get 200 "measure/"))
                                (:id wt-measure)))))
          (testing "GET /api/measure/ includes workspace content for the workspace user"
            (is (contains? (into #{} (map :id) (mt/user-http-request wt-user :get 200 "measure/"))
                           (:id wt-measure))))))
      (mt/with-temp [:model/Measure main-measure {:table_id (mt/id :venues) :name "main measure"}]
        (testing "GET /api/measure/ includes main content for the main user"
          (is (contains? (into #{} (map :id) (mt/user-http-request :rasta :get 200 "measure/"))
                         (:id main-measure))))
        (testing "GET /api/measure/ excludes main content from the workspace user"
          (is (not (contains? (into #{} (map :id) (mt/user-http-request wt-user :get 200 "measure/"))
                              (:id main-measure)))))))))

(deftest card-list-workspace-isolation-test
  (mt/with-full-data-perms-for-all-users!
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}
                   :model/User wt-user {:workspace_id (:id wt)}]
      (binding [api/*current-workspace-id* (:id wt)]
        (mt/with-temp [:model/Card wt-card {:name "wt card"}]
          (testing "GET /api/card excludes workspace content from the main user"
            (is (not (contains? (into #{} (map :id) (mt/user-http-request :rasta :get 200 "card"))
                                (:id wt-card)))))
          (testing "GET /api/card includes workspace content for the workspace user"
            (is (contains? (into #{} (map :id) (mt/user-http-request wt-user :get 200 "card"))
                           (:id wt-card))))))
      (mt/with-temp [:model/Card main-card {:name "main card"}]
        (testing "GET /api/card includes main content for the main user"
          (is (contains? (into #{} (map :id) (mt/user-http-request :rasta :get 200 "card"))
                         (:id main-card))))
        (testing "GET /api/card excludes main content from the workspace user"
          (is (not (contains? (into #{} (map :id) (mt/user-http-request wt-user :get 200 "card"))
                              (:id main-card)))))))))

(deftest dashboard-list-workspace-isolation-test
  (mt/with-full-data-perms-for-all-users!
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}
                   :model/User wt-user {:workspace_id (:id wt)}]
      (binding [api/*current-workspace-id* (:id wt)]
        (mt/with-temp [:model/Dashboard wt-dash {:name "wt dashboard"}]
          (testing "GET /api/dashboard excludes workspace content from the main user"
            (is (not (contains? (into #{} (map :id) (mt/user-http-request :rasta :get 200 "dashboard"))
                                (:id wt-dash)))))
          (testing "GET /api/dashboard includes workspace content for the workspace user"
            (is (contains? (into #{} (map :id) (mt/user-http-request wt-user :get 200 "dashboard"))
                           (:id wt-dash))))))
      (mt/with-temp [:model/Dashboard main-dash {:name "main dashboard"}]
        (testing "GET /api/dashboard includes main content for the main user"
          (is (contains? (into #{} (map :id) (mt/user-http-request :rasta :get 200 "dashboard"))
                         (:id main-dash))))
        (testing "GET /api/dashboard excludes main content from the workspace user"
          (is (not (contains? (into #{} (map :id) (mt/user-http-request wt-user :get 200 "dashboard"))
                              (:id main-dash)))))))))
