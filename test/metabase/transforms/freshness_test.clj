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
(def ^:private weekend-cron "0 0 2 ? * SAT,SUN *")

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
  ;; pinned to a Wednesday at 10:30 (local) so cron fire boundaries are deterministic: the hourly
  ;; cron last fired at 10:00, the daily one at midnight, the weekend one on Sunday at 02:00
  (let [now (t/offset-date-time 2025 6 18 10 30)]
    (testing "nil/empty input"
      (is (nil? (freshness/fresh-dep-ids now nil)))
      (is (nil? (freshness/fresh-dep-ids now #{}))))
    (testing "a daily-scheduled dep is fresh while no daily fire has come due since its last success"
      (mt/with-temp [:model/TransformTag          tag   {:name "daily-tag"}
                     :model/TransformJob          job   {:name "daily-job" :schedule daily-cron}
                     :model/TransformJobTransformTag _   {:job_id (:id job) :tag_id (:id tag) :position 0}
                     :model/Transform             fresh {:name "fresh-daily"}
                     :model/TransformTransformTag _      {:transform_id (:id fresh) :tag_id (:id tag) :position 0}
                     :model/Transform             stale {:name "stale-daily"}
                     :model/TransformTransformTag _      {:transform_id (:id stale) :tag_id (:id tag) :position 0}]
        ;; 08:30 — after today's midnight fire → fresh; two days ago → two midnights have passed → stale
        (insert-succeeded-run! (:id fresh) (t/minus now (t/hours 2)))
        (insert-succeeded-run! (:id stale) (t/minus now (t/days 2)))
        (is (= #{(:id fresh)}
               (freshness/fresh-dep-ids now #{(:id fresh) (:id stale)})))))
    (testing "with multiple schedules, any one firing since the last success makes the dep stale"
      (mt/with-temp [:model/TransformTag          hourly-tag {:name "hourly-tag"}
                     :model/TransformTag          daily-tag  {:name "daily-tag-2"}
                     :model/TransformJob          hourly-job {:name "hourly-job" :schedule hourly-cron}
                     :model/TransformJob          daily-job  {:name "daily-job-2" :schedule daily-cron}
                     :model/TransformJobTransformTag _        {:job_id (:id hourly-job) :tag_id (:id hourly-tag) :position 0}
                     :model/TransformJobTransformTag _        {:job_id (:id daily-job) :tag_id (:id daily-tag) :position 0}
                     :model/Transform             t          {:name "hourly-and-daily"}
                     :model/TransformTransformTag _           {:transform_id (:id t) :tag_id (:id hourly-tag) :position 0}
                     :model/TransformTransformTag _           {:transform_id (:id t) :tag_id (:id daily-tag) :position 1}]
        (testing "a success 2h ago (08:30): the hourly job has fired since (09:00, 10:00), the daily one hasn't"
          (insert-succeeded-run! (:id t) (t/minus now (t/hours 2)))
          (is (= #{} (freshness/fresh-dep-ids now #{(:id t)}))))
        (testing "a success 25m ago (10:05): no schedule has fired since"
          (insert-succeeded-run! (:id t) (t/minus now (t/minutes 25)))
          (is (= #{(:id t)} (freshness/fresh-dep-ids now #{(:id t)}))))))
    (testing "an irregular weekend-only schedule stays fresh all week off a Sunday success"
      (mt/with-temp [:model/TransformTag          tag   {:name "weekend-tag"}
                     :model/TransformJob          job   {:name "weekend-job" :schedule weekend-cron}
                     :model/TransformJobTransformTag _   {:job_id (:id job) :tag_id (:id tag) :position 0}
                     :model/Transform             fresh {:name "fresh-weekend"}
                     :model/TransformTransformTag _      {:transform_id (:id fresh) :tag_id (:id tag) :position 0}
                     :model/Transform             stale {:name "stale-weekend"}
                     :model/TransformTransformTag _      {:transform_id (:id stale) :tag_id (:id tag) :position 0}]
        ;; Sunday 02:30, just after the weekend job's last fire; next fire is Saturday → fresh on Wednesday
        (insert-succeeded-run! (:id fresh) (t/minus now (t/days 3) (t/hours 8)))
        ;; last Thursday: both weekend fires have come due since → stale
        (insert-succeeded-run! (:id stale) (t/minus now (t/days 6)))
        (is (= #{(:id fresh)}
               (freshness/fresh-dep-ids now #{(:id fresh) (:id stale)})))))
    (testing "a dep with no active scheduling job is fresh once it has succeeded at least once"
      (mt/with-temp [:model/TransformTag          tag   {:name "unscheduled-tag"}
                     :model/Transform             ran   {:name "unscheduled-ran"}
                     :model/TransformTransformTag _      {:transform_id (:id ran) :tag_id (:id tag) :position 0}
                     :model/Transform             never {:name "unscheduled-never"}
                     :model/TransformTransformTag _      {:transform_id (:id never) :tag_id (:id tag) :position 0}]
        ;; old success — would be stale under any cadence, but there is no cadence asking to refresh it
        (insert-succeeded-run! (:id ran) (t/minus now (t/days 365)))
        (is (= #{(:id ran)}
               (freshness/fresh-dep-ids now #{(:id ran) (:id never)}))
            "the one that has run is skipped; the one that never has is not")))
    (testing "an inactive job does not establish a cadence (so the dep is fresh once it has run)"
      (mt/with-temp [:model/TransformTag          tag {:name "inactive-tag"}
                     :model/TransformJob          job {:name "inactive-job" :schedule daily-cron :active false}
                     :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}
                     :model/Transform             t   {:name "inactively-scheduled"}
                     :model/TransformTransformTag _   {:transform_id (:id t) :tag_id (:id tag) :position 0}]
        ;; the daily schedule would have fired since, but the only job is inactive → treated as unscheduled
        (insert-succeeded-run! (:id t) (t/minus now (t/days 2)))
        (is (= #{(:id t)} (freshness/fresh-dep-ids now #{(:id t)})))))
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
