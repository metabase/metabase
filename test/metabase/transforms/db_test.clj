(ns metabase.transforms.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.db :as transforms.db]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private injection "x' OR '1'='1")

(def ^:private no-run-filters
  {:started-at-start  nil
   :started-at-end    nil
   :ended-at-start    nil
   :ended-at-end      nil
   :run-methods       nil
   :transform-ids     nil
   :transform-tag-ids nil
   :statuses          nil
   :user-id           nil})

(defn- run-ids [filters]
  (into #{} (map :id) (transforms.db/paged-runs filters :start-time :asc {} {} {} 50 0)))

(deftest paged-runs-where-binds-request-values-test
  (mt/with-temp [:model/Transform    {t1 :id} {}
                 :model/Transform    {t2 :id} {}
                 :model/TransformRun {r1 :id} {:transform_id t1 :status "succeeded" :run_method "cron"
                                               :start_time #t "2025-09-01T10:00:00Z"
                                               :end_time   #t "2025-09-01T10:05:00Z"}
                 :model/TransformRun {r2 :id} {:transform_id t2 :status "failed" :run_method "manual"
                                               :start_time #t "2025-09-03T10:00:00Z"
                                               :end_time   #t "2025-09-03T10:05:00Z"}]
    (let [mine #{r1 r2}
          ids  (fn [filters] (into #{} (filter mine) (run-ids (merge no-run-filters filters))))
          n    (fn [filters] (transforms.db/paged-run-count (merge no-run-filters filters)))]
      (testing "SQL-looking strings match only as data"
        (is (= #{} (ids {:run-methods [injection]})))
        (is (= #{} (ids {:statuses [injection]})))
        (is (zero? (n {:run-methods [injection]})))
        (is (zero? (n {:statuses [injection]}))))
      (testing "real filters still match"
        (is (= #{r1} (ids {:run-methods ["cron"]})))
        (is (= #{r2} (ids {:statuses ["failed"]})))
        (is (= #{r1} (ids {:transform-ids [t1]})))
        (is (= #{r2} (ids {:transform-ids #{t2}})))
        (is (= #{r2} (ids {:started-at-start #t "2025-09-02T00:00:00Z"})))
        (is (= #{r1} (ids {:started-at-end #t "2025-09-02T00:00:00Z"})))
        (is (= #{r2} (ids {:ended-at-start #t "2025-09-02T00:00:00Z"})))
        (is (= #{r1} (ids {:ended-at-end #t "2025-09-02T00:00:00Z"})))
        (is (= 1 (n {:run-methods ["manual"] :started-at-start #t "2025-09-02T00:00:00Z"})))))))

(deftest paged-runs-where-user-and-tag-filters-test
  (mt/with-temp [:model/Transform    {t1 :id} {}
                 :model/Transform    {t2 :id} {}
                 :model/TransformTag {tag :id} {}
                 :model/TransformTransformTag _ {:transform_id t1 :tag_id tag :position 0}
                 :model/TransformRun {r1 :id} {:transform_id t1 :status "succeeded" :run_method "cron"
                                               :start_time #t "2025-09-01T10:00:00Z"
                                               :user_id (mt/user->id :rasta)}
                 :model/TransformRun {r2 :id} {:transform_id t2 :status "succeeded" :run_method "cron"
                                               :start_time #t "2025-09-01T11:00:00Z"
                                               :user_id (mt/user->id :crowberto)}]
    (let [mine #{r1 r2}
          ids  (fn [filters] (into #{} (filter mine) (run-ids (merge no-run-filters filters))))]
      (is (= #{r1} (ids {:user-id (mt/user->id :rasta)})))
      (is (= #{r2} (ids {:user-id (mt/user->id :crowberto)})))
      (is (= #{r1} (ids {:transform-tag-ids [tag]})))
      (is (= #{r1} (ids {:transform-tag-ids [tag] :statuses [injection "succeeded"]}))))))

(deftest job-run-where-binds-request-values-test
  (mt/with-temp [:model/TransformJob    {j1 :id} {:name "Job 1" :schedule "0 0 0 * * ?"}
                 :model/TransformJob    {j2 :id} {:name "Job 2" :schedule "0 0 0 * * ?"}
                 :model/TransformJobRun {r1 :id} {:job_id j1 :status "succeeded" :run_method "cron"
                                                  :start_time #t "2025-09-01T10:00:00Z"}
                 :model/TransformJobRun {r2 :id} {:job_id j1 :status "failed" :run_method "manual"
                                                  :start_time #t "2025-09-03T10:00:00Z"}
                 :model/TransformJobRun _ {:job_id j2 :status "succeeded" :run_method "cron"
                                           :start_time #t "2025-09-01T10:00:00Z"}]
    (let [ids   (fn [status run-method start end]
                  (into #{} (map :id) (transforms.db/job-runs j1 status run-method start end :start_time :asc 50 0)))
          total (fn [status run-method start end]
                  (transforms.db/job-run-count j1 status run-method start end))]
      (testing "SQL-looking strings match only as data"
        (is (= #{} (ids injection nil nil nil)))
        (is (= #{} (ids nil injection nil nil)))
        (is (zero? (total injection nil nil nil)))
        (is (zero? (total nil injection nil nil))))
      (testing "real filters still match"
        (is (= #{r1 r2} (ids nil nil nil nil)))
        (is (= #{r2} (ids "failed" nil nil nil)))
        (is (= #{r1} (ids nil "cron" nil nil)))
        (is (= #{r2} (ids nil nil #t "2025-09-02T00:00:00Z" nil)))
        (is (= #{r1} (ids nil nil nil #t "2025-09-02T00:00:00Z")))
        (is (= 1 (total "succeeded" "cron" #t "2025-09-01T00:00:00Z" #t "2025-09-02T00:00:00Z")))
        (is (= 2 (total nil nil nil nil)))))))

(deftest root-run-summaries-binds-request-values-test
  (mt/with-temp [:model/Transform    {t1 :id} {}
                 :model/Transform    {t2 :id} {}
                 :model/TransformRun {r1 :id} {:transform_id t1 :status "succeeded" :run_method "cron"
                                               :start_time #t "2025-09-01T10:00:00Z"
                                               :end_time   #t "2025-09-01T10:05:00Z"}
                 :model/TransformRun {r2 :id} {:transform_id t2 :status "failed" :run_method "manual"
                                               :start_time #t "2025-09-03T10:00:00Z"
                                               :end_time   #t "2025-09-03T10:05:00Z"}]
    (let [mine  #{r1 r2}
          page  (fn [statuses run-methods start end ended-start ended-end transform-ids]
                  (into #{}
                        (comp (filter #(= "transform" (:run_type %))) (map :entity_id) (filter #{t1 t2}))
                        (transforms.db/root-run-summaries-page [:transform] statuses run-methods start end
                                                               ended-start ended-end transform-ids
                                                               :start_time :asc 200 0)))
          total (fn [statuses run-methods transform-ids]
                  (transforms.db/root-run-summaries-count [:transform] statuses run-methods nil nil nil nil
                                                          transform-ids))]
      (is (seq mine))
      (testing "SQL-looking strings match only as data"
        (is (= #{} (page [injection] nil nil nil nil nil nil)))
        (is (= #{} (page nil [injection] nil nil nil nil nil)))
        (is (zero? (total [injection] nil nil)))
        (is (zero? (total nil [injection] nil))))
      (testing "real filters still match"
        (is (= #{t1 t2} (page nil nil nil nil nil nil nil)))
        (is (= #{t2} (page ["failed"] nil nil nil nil nil nil)))
        (is (= #{t1} (page nil ["cron"] nil nil nil nil nil)))
        (is (= #{t2} (page nil nil #t "2025-09-02T00:00:00Z" nil nil nil nil)))
        (is (= #{t1} (page nil nil nil #t "2025-09-02T00:00:00Z" nil nil nil)))
        (is (= #{t2} (page nil nil nil nil #t "2025-09-02T00:00:00Z" nil nil)))
        (is (= #{t1} (page nil nil nil nil nil #t "2025-09-02T00:00:00Z" nil)))
        (is (= #{t1} (page nil nil nil nil nil nil [t1])))
        (is (= 1 (total ["failed"] ["manual"] [t2])))))))
