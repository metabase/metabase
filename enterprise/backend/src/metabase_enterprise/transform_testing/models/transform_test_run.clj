(ns metabase-enterprise.transform-testing.models.transform-test-run
  (:require
   [metabase-enterprise.transform-testing.db :as transform-testing.db]
   [metabase.audit-app.core :as audit-app]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTestRun [_model] :transform_test_run)

(derive :model/TransformTestRun :metabase/model)

(defmethod audit-app/model-details :model/TransformTestRun
  [transform-test-run _event-type]
  (select-keys transform-test-run [:transform_test_id :status]))

(t2/deftransforms :model/TransformTestRun
  {:status mi/transform-keyword})

(methodical/defmethod t2/batched-hydrate [:model/TransformTestRun :initiated_by_user]
  "Add the user who started each run, or nil."
  [_model _k runs]
  (let [user-ids (into #{} (keep :initiated_by) runs)
        id->user (when (seq user-ids) (transform-testing.db/users-by-id user-ids))]
    (for [run runs]
      (assoc run :initiated_by_user (get id->user (:initiated_by run))))))
