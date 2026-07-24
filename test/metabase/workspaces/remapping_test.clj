(ns metabase.workspaces.remapping-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(deftest remapping-test
  (mt/with-temp [:model/Workspace ws   {:name "CoW overlay"}
                 :model/User      user {:workspace_id (:id ws)}]
    (t2/insert! :model/WorkspaceEntityRemapping
                {:workspace_id     (:id ws)
                 :entity_type      :model/Card
                 :source_entity_id 111
                 :target_entity_id 222})
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
        (is (= 222 (workspaces/source-entity-id :model/Card 222)))))))

(deftest check-workspace-enabled-test
  (mt/with-temp [:model/Workspace ws   {:name "CoW overlay"}
                 :model/User      user {:workspace_id (:id ws)}]
    (testing "no exception with an active workspace"
      (mt/with-current-user (:id user)
        (is (workspaces/check-workspace-enabled))))
    (testing "400 without an active workspace"
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"active workspace"
                              (workspaces/check-workspace-enabled)))))))
