(ns metabase.transforms.models.transform-schedule-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-schedule :as transform-schedule]))

(deftest schedules-for-transforms-test
  (testing "returns the schedules of the active jobs that run a transform via shared tags"
    (mt/with-temp [:model/TransformTag          tag      {}
                   :model/TransformJob          active   {:schedule "0 0 * * * ? *" :active true}
                   :model/TransformJob          inactive {:schedule "0 0 0 * * ? *" :active false}
                   :model/TransformJobTransformTag _      {:job_id (:id active) :tag_id (:id tag) :position 0}
                   :model/TransformJobTransformTag _      {:job_id (:id inactive) :tag_id (:id tag) :position 1}
                   :model/Transform             t        {}
                   :model/TransformTransformTag _         {:transform_id (:id t) :tag_id (:id tag) :position 0}
                   :model/Transform             untagged {}]
      (is (= {(:id t) #{"0 0 * * * ? *"}}
             (transform-schedule/schedules-for-transforms #{(:id t)}))
          "only the active job's schedule is included")
      (is (= {} (transform-schedule/schedules-for-transforms #{(:id untagged)}))
          "a transform with no scheduling job is absent"))))
