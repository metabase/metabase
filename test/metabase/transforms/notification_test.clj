(ns metabase.transforms.notification-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.channel.urls :as urls]
   [metabase.notification.seed :as notification.seed]
   [metabase.test :as mt]
   [metabase.transforms.notification :as transforms.notification]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest failing-jobs-test
  (testing "only in-window cron failures/timeouts are summarized, one entry per job"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-model-cleanup [:model/TransformJobRun]
        (mt/with-temp [:model/TransformJob job-a {:name "job-a" :schedule "0 0 * * * ? *"}
                       :model/TransformJob job-b {:name "job-b" :schedule "0 0 * * * ? *"}]
          (let [start #t "2024-06-01T00:00:00Z"
                end   #t "2024-06-02T00:00:00Z"
                ins!  (fn [m] (t2/insert! :model/TransformJobRun (merge {:is_active nil} m)))]
            ;; job-a: two cron failures in window (11:00 is the latest)
            (ins! {:job_id (:id job-a) :run_method :cron :status :failed :start_time #t "2024-06-01T10:00:00Z" :message "first error"})
            (ins! {:job_id (:id job-a) :run_method :cron :status :failed :start_time #t "2024-06-01T11:00:00Z" :message "latest error"})
            ;; job-b: one cron timeout in window, earlier than job-a's first failure
            (ins! {:job_id (:id job-b) :run_method :cron :status :timeout :start_time #t "2024-06-01T09:00:00Z" :message "Timed out by metabase"})
            ;; excluded: manual run, runs before `start` and at/after `end` (exclusive), and a success
            (ins! {:job_id (:id job-a) :run_method :manual :status :failed :start_time #t "2024-06-01T11:00:00Z" :message "manual"})
            (ins! {:job_id (:id job-b) :run_method :cron :status :failed :start_time #t "2020-01-01T00:00:00Z" :message "ancient"})
            (ins! {:job_id (:id job-b) :run_method :cron :status :failed :start_time #t "2024-06-02T00:00:00Z" :message "at end (excluded)"})
            (ins! {:job_id (:id job-a) :run_method :cron :status :succeeded :start_time #t "2024-06-01T11:00:00Z"})
            (let [jobs    (transforms.notification/failing-jobs start end)
                  by-name (into {} (map (juxt :job_name identity)) jobs)]
              (is (= 2 (count jobs)))
              (testing "jobs are ordered by when they first failed (job-b 09:00 before job-a 10:00)"
                (is (= ["job-b" "job-a"] (map :job_name jobs))))
              (testing "job-a aggregates its two cron failures, latest error wins"
                (is (=? {:failure_count 2 :latest_error "latest error"} (by-name "job-a")))
                (is (some? (:first_failed (by-name "job-a"))))
                (is (= (urls/transform-job-url (:id job-a)) (:job_href (by-name "job-a")))))
              (testing "job-b reports its single timeout"
                (is (=? {:failure_count 1 :latest_error "Timed out by metabase"} (by-name "job-b")))))))))))

(deftest send-failure-digest-test
  (testing "the daily digest emails admins a summary of recent cron job failures"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-model-cleanup [:model/Notification
                              :model/TransformJobRun]
        (mt/with-fake-inbox
          (mt/fetch-user :crowberto)
          (notification.seed/seed-notification!)
          (mt/with-temp [:model/TransformJob job {:name "nightly-job" :schedule "0 0 * * * ? *"}]
            (testing "with no failures, nothing is sent"
              (transforms.notification/send-failure-digest!)
              (is (zero? (count @mt/inbox))))
            (testing "with a cron failure from yesterday, admins get the digest"
              ;; the digest covers the previous calendar day; subtracting one day keeps the same
              ;; wall-clock time, so it always lands within yesterday's window
              (t2/insert! :model/TransformJobRun {:job_id (:id job) :run_method :cron :status :failed
                                                  :message "boom" :is_active nil
                                                  :start_time (t/minus (t/offset-date-time) (t/days 1))})
              (transforms.notification/send-failure-digest!)
              ;; crowberto is a superuser and receives the admin digest
              (is (mt/received-email-subject? :crowberto #"Transform jobs that failed"))
              (is (mt/received-email-body? :crowberto #"nightly-job"))
              (is (mt/received-email-body? :crowberto #"boom")))))))))
