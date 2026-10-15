(ns metabase-enterprise.transform-testing.models.transform-test-run
  (:require
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
