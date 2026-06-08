(ns metabase.transforms.freshness-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.transforms.freshness :as freshness]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private hourly-cron "0 0 * * * ? *")
(def ^:private daily-cron "0 0 0 * * ? *")

(defn- insert-succeeded-run!
  "Insert a succeeded transform run completing at `end-time`."
  [transform-id end-time]
  (t2/insert-returning-instance! :model/TransformRun
                                 {:transform_id transform-id
                                  :run_method   :cron
                                  :status       :succeeded
                                  :is_active    nil
                                  :end_time     end-time}))

(deftest fresh-dep-ids-test
  (let [now (t/offset-date-time)]
    (testing "nil/empty input"
      (is (nil? (freshness/fresh-dep-ids now nil)))
      (is (nil? (freshness/fresh-dep-ids now #{}))))
    (testing "a daily-scheduled dep is fresh when its last success is within a day, stale otherwise"
      (mt/with-temp [:model/TransformTag          tag   {:name "daily-tag"}
                     :model/TransformJob          job   {:name "daily-job" :schedule daily-cron}
                     :model/TransformJobTransformTag _   {:job_id (:id job) :tag_id (:id tag) :position 0}
                     :model/Transform             fresh {:name "fresh-daily"}
                     :model/TransformTransformTag _      {:transform_id (:id fresh) :tag_id (:id tag) :position 0}
                     :model/Transform             stale {:name "stale-daily"}
                     :model/TransformTransformTag _      {:transform_id (:id stale) :tag_id (:id tag) :position 0}]
        (insert-succeeded-run! (:id fresh) (t/minus now (t/hours 2)))
        (insert-succeeded-run! (:id stale) (t/minus now (t/days 2)))
        (is (= #{(:id fresh)}
               (freshness/fresh-dep-ids now #{(:id fresh) (:id stale)})))))
    (testing "the shortest schedule wins: a dep run by both an hourly and a daily job uses the 1h window"
      (mt/with-temp [:model/TransformTag          hourly-tag {:name "hourly-tag"}
                     :model/TransformTag          daily-tag  {:name "daily-tag-2"}
                     :model/TransformJob          hourly-job {:name "hourly-job" :schedule hourly-cron}
                     :model/TransformJob          daily-job  {:name "daily-job-2" :schedule daily-cron}
                     :model/TransformJobTransformTag _        {:job_id (:id hourly-job) :tag_id (:id hourly-tag) :position 0}
                     :model/TransformJobTransformTag _        {:job_id (:id daily-job) :tag_id (:id daily-tag) :position 0}
                     :model/Transform             t          {:name "hourly-and-daily"}
                     :model/TransformTransformTag _           {:transform_id (:id t) :tag_id (:id hourly-tag) :position 0}
                     :model/TransformTransformTag _           {:transform_id (:id t) :tag_id (:id daily-tag) :position 1}]
        (testing "a success 2h ago is within the daily window but not the (shorter) hourly one"
          (insert-succeeded-run! (:id t) (t/minus now (t/hours 2)))
          (is (= #{} (freshness/fresh-dep-ids now #{(:id t)}))))
        (testing "a success 30m ago is within the hourly window"
          (insert-succeeded-run! (:id t) (t/minus now (t/minutes 30)))
          (is (= #{(:id t)} (freshness/fresh-dep-ids now #{(:id t)}))))))
    (testing "a dep with a tag but no scheduling job is never skipped, even with a recent success"
      (mt/with-temp [:model/TransformTag          tag {:name "unscheduled-tag"}
                     :model/Transform             t   {:name "unscheduled-dep"}
                     :model/TransformTransformTag _   {:transform_id (:id t) :tag_id (:id tag) :position 0}]
        (insert-succeeded-run! (:id t) (t/minus now (t/minutes 1)))
        (is (= #{} (freshness/fresh-dep-ids now #{(:id t)})))))
    (testing "a scheduled dep with no successful run is not skipped"
      (mt/with-temp [:model/TransformTag          tag {:name "daily-tag-3"}
                     :model/TransformJob          job {:name "daily-job-3" :schedule daily-cron}
                     :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}
                     :model/Transform             t   {:name "never-succeeded"}
                     :model/TransformTransformTag _   {:transform_id (:id t) :tag_id (:id tag) :position 0}]
        (testing "no runs at all"
          (is (= #{} (freshness/fresh-dep-ids now #{(:id t)}))))
        (testing "only a failed run does not count as fresh"
          (t2/insert! :model/TransformRun {:transform_id (:id t)
                                           :run_method   :cron
                                           :status       :failed
                                           :is_active    nil
                                           :end_time     (t/minus now (t/minutes 1))})
          (is (= #{} (freshness/fresh-dep-ids now #{(:id t)}))))))))
