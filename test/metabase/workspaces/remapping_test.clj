(ns metabase.workspaces.remapping-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [metabase.workspaces.test-util :as workspaces.tu]
   [toucan2.core :as t2]))

(deftest remapping-test
  (mt/with-temp [:model/Workspace ws   {:branch "CoW overlay"}
                 :model/User      user {:workspace_id (:id ws)}]
    (t2/insert! :model/WorkspaceEntityRemapping
                {:workspace_id     (:id ws)
                 :entity_type      :model/Card
                 :source_entity_id 111
                 :target_entity_id 222})
    (mt/with-premium-features #{:workspaces}
      (testing "with an active workspace"
        (mt/with-current-user (:id user)
          (is (= (:id ws) (workspaces/current-workspace-id)))
          (testing "mapped IDs are remapped in both directions"
            (is (= 222 (workspaces/remapped-entity-id :model/Card 111)))
            (is (= 111 (workspaces/source-entity-id :model/Card 222))))
          (testing "unmapped IDs pass through"
            (is (= 333 (workspaces/remapped-entity-id :model/Card 333)))
            (is (= 333 (workspaces/source-entity-id :model/Card 333))))
          (testing "entity types do not collide"
            (is (= 111 (workspaces/remapped-entity-id :model/Dashboard 111)))
            (is (= 222 (workspaces/source-entity-id :model/Segment 222))))))
      (testing "without an active workspace both directions are identity"
        (mt/with-current-user (mt/user->id :rasta)
          (is (nil? (workspaces/current-workspace-id)))
          (is (= 111 (workspaces/remapped-entity-id :model/Card 111)))
          (is (= 222 (workspaces/source-entity-id :model/Card 222))))))
    (testing "without the :workspaces feature remapping is disabled even with an active workspace"
      (mt/with-premium-features #{}
        (mt/with-current-user (:id user)
          (is (= 111 (workspaces/remapped-entity-id :model/Card 111)))
          (is (= 222 (workspaces/source-entity-id :model/Card 222))))))))

(deftest check-workspace-enabled-test
  (mt/with-temp [:model/Workspace ws   {:branch "CoW overlay"}
                 :model/User      user {:workspace_id (:id ws)}]
    (testing "no exception with an active workspace"
      (mt/with-current-user (:id user)
        (is (workspaces/check-workspace-enabled))))
    (testing "400 without an active workspace"
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"active workspace"
                              (workspaces/check-workspace-enabled)))))))

(deftest with-current-workspace-id-test
  (mt/with-temp [:model/Workspace ws {:branch "CoW overlay"}]
    (t2/insert! :model/WorkspaceEntityRemapping
                {:workspace_id     (:id ws)
                 :entity_type      :model/Card
                 :source_entity_id 444
                 :target_entity_id 555})
    (testing "forces a workspace context without a current user"
      (workspaces.tu/with-current-workspace-id (:id ws)
        (is (= 555 (workspaces/remapped-entity-id :model/Card 444)))
        (is (= 444 (workspaces/source-entity-id :model/Card 555)))))))
