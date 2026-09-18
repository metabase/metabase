(ns metabase-enterprise.transform-testing.models.transform-test-run
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTestRun [_model] :transform_test_run)

(derive :model/TransformTestRun :metabase/model)

(t2/deftransforms :model/TransformTestRun
  {:status mi/transform-keyword})
