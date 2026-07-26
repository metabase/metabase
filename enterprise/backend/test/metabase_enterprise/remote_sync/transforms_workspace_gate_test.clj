(ns metabase-enterprise.remote-sync.transforms-workspace-gate-test
  "Running a transform, creating a transform job, and running a transform job now are all forbidden while the caller is
  scoped to a remote-sync workspace. The scope is bound from the user's `workspace_id` (see
  `metabase.request.session/do-with-current-user`), so these tests set `workspace_id` on the calling user and assert
  the endpoints reject the request with a 400 before doing any work."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.models.transform]
   [metabase.transforms.models.transform-job]
   [metabase.transforms.models.transform-tag]))

(set! *warn-on-reflection* true)

(deftest transforms-blocked-in-workspace-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temp [:model/Workspace   wt  {:branch (str (random-uuid))}
                   :model/Transform    {transform-id :id} {}
                   :model/TransformTag {tag-id :id} {:name (str "gate-tag-" (random-uuid))}
                   :model/TransformJob {job-id :id} {:name (str "gate-job-" (random-uuid)) :schedule "0 0 0 * * ?"}
                   :model/TransformJobTransformTag _ {:job_id job-id :tag_id tag-id :position 0}]
      (testing "outside a workspace, creating a job is allowed (control: the gate is what blocks it below)"
        (is (some? (:id (mt/user-http-request :crowberto :post 200 "transform-job"
                                              {:name     (str "main-job-" (random-uuid))
                                               :schedule "0 0 0 * * ?"})))))
      (mt/with-temp-vals-in-db :model/User (mt/user->id :crowberto) {:workspace_id (:id wt)}
        (testing "POST /api/transform/:id/run is blocked in a workspace"
          (is (re-find #"Transforms cannot be run in a workspace"
                       (mt/user-http-request :crowberto :post 400 (format "transform/%d/run" transform-id)))))
        (testing "POST /api/transform/:id/run-dag is blocked in a workspace"
          (is (re-find #"Transforms cannot be run in a workspace"
                       (mt/user-http-request :crowberto :post 400 (format "transform/%d/run-dag" transform-id)
                                             {:direction "downstream"}))))
        (testing "POST /api/transform-job (create) is blocked in a workspace"
          (is (re-find #"Transforms cannot be run in a workspace"
                       (mt/user-http-request :crowberto :post 400 "transform-job"
                                             {:name     (str "ws-job-" (random-uuid))
                                              :schedule "0 0 0 * * ?"}))))
        (testing "POST /api/transform-job/:job-id/run is blocked in a workspace"
          (is (re-find #"Transforms cannot be run in a workspace"
                       (mt/user-http-request :crowberto :post 400 (format "transform-job/%d/run" job-id)))))))))
