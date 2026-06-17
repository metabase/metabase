(ns metabase.transforms-rest.api.transform-job-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-job]
   [metabase.transforms.models.transform-run]
   [metabase.transforms.models.transform-tag]
   [metabase.transforms.schedule :as transforms.schedule]
   [metabase.transforms.test-util :refer [parse-instant
                                          utc-timestamp]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest create-job-test
  (testing "POST /api/transform-job"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/TransformTag tag1 {:name "test-tag-1"}
                       :model/TransformTag tag2 {:name "test-tag-2"}]
          (testing "Creates job with valid data"
            (let [response (mt/user-http-request :lucky :post 200 "transform-job"
                                                 {:name            "Test Job"
                                                  :description     "Test Description"
                                                  :schedule        "0 0 0 * * ?"
                                                  :ui_display_type "cron/builder"
                                                  :tag_ids         [(:id tag1) (:id tag2)]})]
              (is (some? (:id response)))
              (is (= "Test Job" (:name response)))
              (is (= "Test Description" (:description response)))
              (is (= "0 0 0 * * ?" (:schedule response)))
              (is (= "cron/builder" (:ui_display_type response)))
              (is (= (set [(:id tag1) (:id tag2)]) (set (:tag_ids response))))))
          (testing "Validates cron expression"
            (let [response (mt/user-http-request :lucky :post 400 "transform-job"
                                                 {:name     "Bad Cron Job"
                                                  :schedule "invalid cron"})]
              (is (string? response))
              (is (re-find #"Invalid cron expression" response))))
          (testing "Validates tag IDs exist"
            (let [response (mt/user-http-request :lucky :post 400 "transform-job"
                                                 {:name     "Job with bad tags"
                                                  :schedule "0 0 0 * * ?"
                                                  :tag_ids  [999999]})]
              (is (string? response))
              (is (re-find #"tag IDs do not exist" response)))))))))

(deftest get-job-test
  (testing "GET /api/transform-job/:id"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/TransformTag tag {:name "test-tag"}
                       :model/TransformJob job {:name     "Test Job"
                                                :schedule "0 0 0 * * ?"}
                       :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}]
          (testing "Returns job with hydrated fields"
            (let [response (mt/user-http-request :lucky :get 200 (str "transform-job/" (:id job)))]
              (is (= (:id job) (:id response)))
              (is (= "Test Job" (:name response)))
              (is (= [(:id tag)] (:tag_ids response)))
              (is (true? (:active response)))
              (is (nil? (:last_run response)))))
          (testing "Returns 404 for non-existent job"
            (mt/user-http-request :lucky :get 404 "transform-job/999999")))))))

(deftest get-job-transforms-test
  (testing "GET /api/transform-job/:id/transforms"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (let [lucky-id (mt/user->id :lucky)]
          (mt/with-temp [:model/Transform {transform1-id :id} {:name "tr1" :creator_id lucky-id}
                         :model/Transform {transform2-id :id} {:name "tr2" :creator_id lucky-id}
                         :model/Transform _transform3 {}
                         :model/TransformTag {tag-id :id} {}
                         :model/TransformTransformTag _ {:transform_id transform1-id :tag_id tag-id :position 0}
                         :model/TransformTransformTag _ {:transform_id transform2-id :tag_id tag-id :position 0}
                         :model/TransformJob {job-id :id} {}
                         :model/TransformJobTransformTag _ {:job_id job-id :tag_id tag-id :position 0}]
            (testing "Returns the transforms of the job"
              (let [response (mt/user-http-request :lucky :get 200 (str "transform-job/" job-id "/transforms"))]
                (is (=? [{:id transform1-id, :name "tr1"} {:id transform2-id, :name "tr2"}]
                        (sort-by :id response)))
                (testing "Response hydrates creator"
                  (is (every? #(map? (:creator %)) response))
                  (is (every? #(= lucky-id (get-in % [:creator :id])) response)))))
            (testing "Returns 404 for non-existent job"
              (mt/user-http-request :lucky :get 404 "transform-job/999999/transforms"))))))))

(deftest list-jobs-test
  (testing "GET /api/transform-job"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (let [at-5-second-schedule "5 * * * * ?"]
          (mt/with-temp [:model/TransformTag {t1-id :id} {:name "test-tag"}
                         :model/TransformTag {t2-id :id} {:name "second test-tag"}
                         :model/TransformJob {j1-id :id} {:name "Job 1" :schedule at-5-second-schedule}
                         :model/TransformJob {j2-id :id} {:name "Job 2" :schedule "0 0 0 * * ?"}
                         :model/TransformJob {j3-id :id} {:name "Job 3" :schedule "0 0 0 * * ?"}
                         :model/TransformJobTransformTag _ {:job_id j1-id :tag_id t1-id :position 0}
                         :model/TransformJobTransformTag _ {:job_id j2-id :tag_id t1-id :position 1}
                         :model/TransformJobTransformTag _ {:job_id j3-id :tag_id t2-id :position 0}
                         :model/TransformJobRun _ {:job_id j1-id :status "timeout" :run_method "cron"
                                                   :start_time (parse-instant "2025-08-25T10:12:11")
                                                   :end_time (parse-instant "2025-08-26T10:52:17")}
                         :model/TransformJobRun _ {:job_id j2-id :status "started" :run_method "manual"
                                                   :start_time (parse-instant "2025-08-26T10:12:11")
                                                   :end_time nil
                                                   :is_active true}]
            (let [our-job-ids #{j1-id j2-id j3-id}
                  returned-jobs (fn [response] (into [] (filter (comp our-job-ids :id)) response))
                  returned-job-ids (fn [response] (into #{} (keep (comp our-job-ids :id)) response))]
              (testing "listing without filtering"
                (let [response (mt/user-http-request :lucky :get 200 "transform-job")]
                  (is (= our-job-ids (returned-job-ids response)))))
              (testing "filtering by tag_ids"
                (let [response (mt/user-http-request :lucky :get 200 "transform-job" :tag-ids [t2-id])]
                  (is (=? [{:schedule "0 0 0 * * ?"
                            :tag_ids [t2-id]
                            :name "Job 3"
                            :id j3-id}]
                          (returned-jobs response)))))
              (testing "filtering by last_run_start_time"
                (let [response (mt/user-http-request :lucky :get 200 "transform-job" :last-run-start-time "2025-08-26~")]
                  (is (= #{j2-id} (returned-job-ids response)))))
              (testing "filtering by last_run_statuses"
                (let [response (mt/user-http-request :lucky :get 200 "transform-job" :last-run-statuses ["started" "succeeded"])]
                  (is (= #{j2-id} (returned-job-ids response)))))
              (testing "filtering by last_run_end_time without scheduled job"
                (let [response (mt/user-http-request :lucky :get 200 "transform-job" :next-run-start-time "2025-08-26~")]
                  (is (= #{} (returned-job-ids response)))))
              (testing "filtering by last_run_end_time with scheduled job"
                (mt/with-temp-scheduler!
                  (transforms.schedule/initialize-job! {:id j1-id, :schedule at-5-second-schedule})
                  (try
                    (let [response (mt/user-http-request :lucky :get 200 "transform-job" :next-run-start-time "2025-08-27~")]
                      (is (=? [{:id j1-id
                                :last_run {:job_id j1-id
                                           :run_method "cron"
                                           :start_time (utc-timestamp "2025-08-25T10:12:11")
                                           :end_time (utc-timestamp "2025-08-26T10:52:17")}
                                :name "Job 1"
                                :next_run {:start_time #"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ"}
                                :schedule at-5-second-schedule
                                :tag_ids [t1-id]}]
                              (returned-jobs response))))
                    (finally
                      (transforms.schedule/delete-job! j1-id))))))))))))

(deftest update-job-test
  (testing "PUT /api/transform-job/:id"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/TransformTag tag1 {:name "tag-1"}
                       :model/TransformTag tag2 {:name "tag-2"}]
          (let [job (mt/user-http-request :lucky :post 200 "transform-job"
                                          {:name "Original" :schedule "0 0 0 * * ?"})]
            (testing "Updates job fields"
              (let [response (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                                   {:name        "Updated"
                                                    :description "New Description"
                                                    :schedule    "0 0 */2 * * ?"
                                                    :tag_ids     [(:id tag1) (:id tag2)]})]
                (is (= "Updated" (:name response)))
                (is (= "New Description" (:description response)))
                (is (= "0 0 */2 * * ?" (:schedule response)))
                (is (= (set [(:id tag1) (:id tag2)]) (set (:tag_ids response))))))
            (testing "Validates cron expression"
              (let [response (mt/user-http-request :lucky :put 400 (str "transform-job/" (:id job))
                                                   {:schedule "invalid"})]
                (is (string? response))
                (is (re-find #"Invalid cron expression" response))))))))))

(deftest update-job-active-test
  (testing "PUT /api/transform-job/:id can toggle the active flag"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/TransformJob job {:name "Toggle Me" :schedule "0 0 0 * * ?"}]
          (testing "Defaults to true"
            (is (true? (:active (mt/user-http-request :lucky :get 200 (str "transform-job/" (:id job)))))))
          (testing "Can be set to false"
            (let [response (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                                 {:active false})]
              (is (false? (:active response))))
            (is (false? (:active (mt/user-http-request :lucky :get 200 (str "transform-job/" (:id job))))))
            (is (false? (t2/select-one-fn :active :model/TransformJob :id (:id job)))))
          (testing "Can be set back to true"
            (let [response (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                                 {:active true})]
              (is (true? (:active response))))
            (is (true? (:active (mt/user-http-request :lucky :get 200 (str "transform-job/" (:id job))))))
            (is (true? (t2/select-one-fn :active :model/TransformJob :id (:id job))))))))))

(deftest update-all-jobs-active-test
  (testing "PUT /api/transform-job/active flips every job's active flag"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/TransformJob job-1 {:name "Job 1" :schedule "0 0 0 * * ?"}
                     :model/TransformJob job-2 {:name "Job 2" :schedule "0 0 0 * * ?" :active false}
                     :model/TransformJob job-3 {:name "Job 3" :schedule "0 0 0 * * ?"}]
        (let [job-ids       [(:id job-1) (:id job-2) (:id job-3)]
              active-by-id  (fn [] (t2/select-fn->fn :id :active :model/TransformJob :id [:in job-ids]))]
          (testing "Deactivates all jobs"
            (let [pending (t2/count :model/TransformJob :active true)]
              (is (=? {:updated pending :failed zero?}
                      (mt/user-http-request :crowberto :put 200 "transform-job/active" {:active false}))))
            (is (every? false? (vals (active-by-id)))))
          (testing "Reactivates all jobs"
            (let [pending (t2/count :model/TransformJob :active false)]
              (is (=? {:updated pending :failed zero?}
                      (mt/user-http-request :crowberto :put 200 "transform-job/active" {:active true}))))
            (is (every? true? (vals (active-by-id))))))))))

(deftest update-all-jobs-active-counts-test
  (testing "PUT /api/transform-job/active reports :failed for jobs whose flip raises"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/TransformJob _       {:name "OK" :schedule "0 0 0 * * ?"}
                     :model/TransformJob job-bad {:name "Boom" :schedule "0 0 0 * * ?"}]
        (let [orig (mt/original-fn #'transforms.schedule/delete-trigger!)]
          (mt/with-dynamic-fn-redefs [transforms.schedule/delete-trigger!
                                      (fn [job-id]
                                        (if (= job-id (:id job-bad))
                                          (throw (ex-info "boom" {}))
                                          (orig job-id)))]
            (is (=? {:updated #(<= 1 %)
                     :failed  #(<= 1 %)}
                    (mt/user-http-request :crowberto :put 200 "transform-job/active" {:active false})))))))))

(deftest update-all-jobs-active-permissions-test
  (testing "PUT /api/transform-job/active requires superuser"
    (mt/with-premium-features #{:transforms-basic}
      (mt/user-http-request :rasta :put 403 "transform-job/active" {:active false}))
    (testing "data analysts are also rejected"
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/with-premium-features #{:transforms-basic}
          (mt/user-http-request :lucky :put 403 "transform-job/active" {:active false}))))))

(deftest active-trigger-lifecycle-test
  (testing "PUT /api/transform-job/:id syncs the Quartz trigger with :active"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp-scheduler!
          (mt/with-temp [:model/TransformJob job {:name "Triggered" :schedule "0 0 0 * * ?"}]
            ;; with-temp doesn't run the API's create handler, so seed the trigger ourselves to
            ;; mirror the post-create state.
            (transforms.schedule/initialize-job! job)
            (try
              (testing "Deactivating removes the trigger"
                (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                      {:active false})
                (is (nil? (transforms.schedule/existing-trigger (:id job)))))
              (testing "Reactivating recreates the trigger from the stored schedule"
                (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                      {:active true})
                (is (some? (transforms.schedule/existing-trigger (:id job)))))
              (testing "Schedule edits on an inactive job do not resurrect the trigger"
                (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                      {:active false})
                (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                      {:schedule "0 0 1 * * ?"})
                (is (nil? (transforms.schedule/existing-trigger (:id job))))
                (testing "but the new schedule is persisted in the DB"
                  (is (= "0 0 1 * * ?" (t2/select-one-fn :schedule :model/TransformJob :id (:id job)))))
                (testing "and reactivating builds a trigger using the updated schedule"
                  (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                        {:active true})
                  (is (= "0 0 1 * * ?" (:schedule (transforms.schedule/existing-trigger (:id job)))))))
              (finally
                (transforms.schedule/delete-job! (:id job))))))))))

(deftest active-bulk-trigger-lifecycle-test
  (testing "PUT /api/transform-job/active syncs every job's Quartz trigger"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp-scheduler!
        (mt/with-temp [:model/TransformJob job-1 {:name "Bulk 1" :schedule "0 0 0 * * ?"}
                       :model/TransformJob job-2 {:name "Bulk 2" :schedule "0 0 0 * * ?"}]
          (let [job-ids [(:id job-1) (:id job-2)]]
            (run! transforms.schedule/initialize-job! [job-1 job-2])
            (try
              (testing "Bulk deactivate clears triggers for all flipped jobs"
                (mt/user-http-request :crowberto :put 200 "transform-job/active" {:active false})
                (is (every? nil? (map transforms.schedule/existing-trigger job-ids))))
              (testing "Bulk activate rebuilds triggers"
                (mt/user-http-request :crowberto :put 200 "transform-job/active" {:active true})
                (is (every? some? (map transforms.schedule/existing-trigger job-ids))))
              (finally
                (run! transforms.schedule/delete-job! job-ids)))))))))

(deftest update-job-remove-tags-test
  (testing "PUT /api/transform-job/:id"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (testing "should be able to remove all tags from a job"
          (mt/with-temp [:model/TransformTag tag {}
                         :model/TransformJob job {}
                         :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}]
            (let [response (mt/user-http-request :lucky :put 200 (str "transform-job/" (:id job))
                                                 {:tag_ids []})]
              (is (= [] (:tag_ids response))))))))))

(deftest delete-job-test
  (testing "DELETE /api/transform-job/:id"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/TransformJob job {:name "To Delete" :schedule "0 0 0 * * ?"}]
          (testing "Deletes job"
            (mt/user-http-request :lucky :delete 204 (str "transform-job/" (:id job)))
            (is (nil? (t2/select-one :model/TransformJob :id (:id job)))))
          (testing "Returns 404 for non-existent job"
            (mt/user-http-request :lucky :delete 404 "transform-job/999999")))))))

(deftest execute-job-test
  (testing "POST /api/transform-job/:id/execute"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/TransformJob job {:name "To Execute" :schedule "0 0 0 * * ?"}]
          (testing "Returns stub run response"
            (let [response (mt/user-http-request :lucky :post 200 (str "transform-job/" (:id job) "/run"))]
              (is (= "Job run started" (:message response)))
              (is (string? (:job_run_id response)))
              (is (re-matches #"stub-\d+-\d+" (:job_run_id response))))))))))

(deftest permissions-test
  (testing "All endpoints require transform permissions"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/TransformJob job {:name "Test" :schedule "0 0 0 * * ?"}]
        (mt/user-http-request :rasta :post 403 "transform-job"
                              {:name "New" :schedule "0 0 0 * * ?"})
        (mt/user-http-request :rasta :get 403 "transform-job")
        (mt/user-http-request :rasta :get 403 (str "transform-job/" (:id job)))
        (mt/user-http-request :rasta :put 403 (str "transform-job/" (:id job))
                              {:name "Updated"})
        (mt/user-http-request :rasta :delete 403 (str "transform-job/" (:id job)))
        (mt/user-http-request :rasta :post 403 (str "transform-job/" (:id job) "/run"))))))

;;; +------------------------------------------------------------------------------------------------------------------+
;;; |                                       GET /api/transform-job/:job-id/runs                                        |
;;; +------------------------------------------------------------------------------------------------------------------+

(deftest get-job-runs-test
  (testing "GET /api/transform-job/:job-id/runs"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/TransformJob {job-id :id} {:name "Run History Job" :schedule "0 0 0 * * ?"}
                       :model/TransformJobRun {r1-id :id} {:job_id     job-id
                                                           :status     "succeeded"
                                                           :run_method "cron"
                                                           :start_time (parse-instant "2025-09-01T10:00:00")
                                                           :end_time   (parse-instant "2025-09-01T10:05:00")}
                       :model/TransformJobRun {r2-id :id} {:job_id     job-id
                                                           :status     "failed"
                                                           :run_method "manual"
                                                           :start_time (parse-instant "2025-09-02T10:00:00")
                                                           :end_time   (parse-instant "2025-09-02T10:01:00")
                                                           :message    "Something broke"}
                       :model/TransformJobRun _           {:job_id     job-id
                                                           :status     "started"
                                                           :run_method "cron"
                                                           :start_time (parse-instant "2025-09-03T10:00:00")
                                                           :is_active  true}]
          (testing "returns paginated runs for a job"
            (let [response (mt/user-http-request :lucky :get 200 (str "transform-job/" job-id "/runs"))
                  ids      (into #{} (map :id) (:data response))]
              (is (contains? ids r1-id))
              (is (contains? ids r2-id))
              (is (= 3 (:total response)))
              (is (= 3 (count (:data response))))
              (is (pos? (:limit response)))
              (is (integer? (:offset response)))))
          (testing "filters by status"
            (let [response (mt/user-http-request :lucky :get 200
                                                 (str "transform-job/" job-id "/runs")
                                                 :status "failed")]
              (is (= [r2-id] (map :id (:data response))))
              (is (= 1 (:total response)))))
          (testing "filters by run-method"
            (let [response (mt/user-http-request :lucky :get 200
                                                 (str "transform-job/" job-id "/runs")
                                                 :run-method "manual")]
              (is (= [r2-id] (map :id (:data response))))
              (is (= 1 (:total response)))))
          (testing "filters by start-time"
            (let [response (mt/user-http-request :lucky :get 200
                                                 (str "transform-job/" job-id "/runs")
                                                 :start-time "2025-09-01")]
              (is (= [r1-id] (map :id (:data response))))
              (is (= 1 (:total response)))))
          (testing "sorts by start_time asc"
            (let [response (mt/user-http-request :lucky :get 200
                                                 (str "transform-job/" job-id "/runs")
                                                 :sort-column "start_time"
                                                 :sort-direction "asc")]
              (is (= r1-id (-> response :data first :id)))))
          (testing "response shape"
            (let [run (first (filter #(= r1-id (:id %))
                                     (:data (mt/user-http-request :lucky :get 200
                                                                  (str "transform-job/" job-id "/runs")))))]
              (is (= job-id (:job_id run)))
              (is (= "cron" (:run_method run)))
              (is (= "succeeded" (:status run)))
              (is (= (utc-timestamp "2025-09-01T10:00:00") (:start_time run)))
              (is (= (utc-timestamp "2025-09-01T10:05:00") (:end_time run)))))
          (testing "returns 404 for non-existent job"
            (mt/user-http-request :lucky :get 404 "transform-job/999999/runs"))
          (testing "does not return runs from other jobs"
            (mt/with-temp [:model/TransformJob {other-job-id :id} {:name "Other Job" :schedule "0 0 0 * * ?"}
                           :model/TransformJobRun _ {:job_id     other-job-id
                                                     :status     "succeeded"
                                                     :run_method "cron"
                                                     :start_time (parse-instant "2025-09-04T10:00:00")}]
              (let [response (mt/user-http-request :lucky :get 200
                                                   (str "transform-job/" job-id "/runs"))]
                (is (every? #(= job-id (:job_id %)) (:data response)))))))))))

(deftest get-job-runs-requires-auth-test
  (testing "GET /api/transform-job/:job-id/runs requires data-analyst role"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/TransformJob {job-id :id} {:name "Auth Test" :schedule "0 0 0 * * ?"}]
        (mt/user-http-request :rasta :get 403 (str "transform-job/" job-id "/runs"))))))

;;; +------------------------------------------------------------------------------------------------------------------+
;;; |                               GET /api/transform-job/:job-id/runs/:run-id/transform-runs                         |
;;; +------------------------------------------------------------------------------------------------------------------+

(deftest get-job-run-transform-runs-test
  (testing "GET /api/transform-job/:job-id/runs/:run-id/transform-runs"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (let [lucky-id (mt/user->id :lucky)]
          (mt/with-temp [:model/TransformJob {job-id :id} {:name "Drill-down Job" :schedule "0 0 0 * * ?"}
                         :model/TransformJobRun {run-id :id} {:job_id     job-id
                                                              :status     "failed"
                                                              :run_method "cron"
                                                              :start_time (parse-instant "2025-09-01T10:00:00")}
                         :model/Transform {t1-id :id} {:name "TR1" :creator_id lucky-id}
                         :model/Transform {t2-id :id} {:name "TR2" :creator_id lucky-id}
                         :model/TransformRun {tr1-id :id} {:transform_id   t1-id
                                                           :job_run_id     run-id
                                                           :status         "succeeded"
                                                           :run_method     "cron"
                                                           :transform_name "TR1"
                                                           :start_time     (parse-instant "2025-09-01T10:00:00")
                                                           :end_time       (parse-instant "2025-09-01T10:02:00")}
                         :model/TransformRun {tr2-id :id} {:transform_id   t2-id
                                                           :job_run_id     run-id
                                                           :status         "failed"
                                                           :run_method     "cron"
                                                           :transform_name "TR2"
                                                           :start_time     (parse-instant "2025-09-01T10:02:00")
                                                           :end_time       (parse-instant "2025-09-01T10:03:00")
                                                           :message        "Query failed"}
                         :model/TransformRun _ {:transform_id   t1-id
                                                :job_run_id     nil
                                                :status         "succeeded"
                                                :run_method     "manual"
                                                :transform_name "TR1"
                                                :start_time     (parse-instant "2025-08-01T10:00:00")}]
            (testing "returns transform runs for the job run"
              (let [response (mt/user-http-request :lucky :get 200
                                                   (str "transform-job/" job-id "/runs/" run-id "/transform-runs"))]
                (is (= #{tr1-id tr2-id} (into #{} (map :id) response)))
                (is (= 2 (count response)))))
            (testing "response shape"
              (let [response (mt/user-http-request :lucky :get 200
                                                   (str "transform-job/" job-id "/runs/" run-id "/transform-runs"))
                    tr1      (first (filter #(= tr1-id (:id %)) response))]
                (is (= t1-id (:transform_id tr1)))
                (is (= run-id (:job_run_id tr1)))
                (is (= "cron" (:run_method tr1)))
                (is (= "succeeded" (:status tr1)))
                (is (= "TR1" (:transform_name tr1)))))
            (testing "orders by start_time ascending"
              (let [response (mt/user-http-request :lucky :get 200
                                                   (str "transform-job/" job-id "/runs/" run-id "/transform-runs"))]
                (is (= [tr1-id tr2-id] (map :id response)))))
            (testing "does not include transform runs from other job runs"
              (mt/with-temp [:model/TransformJobRun {other-run-id :id} {:job_id     job-id
                                                                        :status     "succeeded"
                                                                        :run_method "cron"
                                                                        :start_time (parse-instant "2025-09-02T10:00:00")}
                             :model/TransformRun _ {:transform_id   t1-id
                                                    :job_run_id     other-run-id
                                                    :status         "succeeded"
                                                    :run_method     "cron"
                                                    :transform_name "TR1"
                                                    :start_time     (parse-instant "2025-09-02T10:00:00")}]
                (let [response (mt/user-http-request :lucky :get 200
                                                     (str "transform-job/" job-id "/runs/" run-id "/transform-runs"))]
                  (is (every? #(= run-id (:job_run_id %)) response)))))
            (testing "returns 404 for non-existent job"
              (mt/user-http-request :lucky :get 404
                                    (str "transform-job/999999/runs/" run-id "/transform-runs")))
            (testing "returns 404 for non-existent run"
              (mt/user-http-request :lucky :get 404
                                    (str "transform-job/" job-id "/runs/999999/transform-runs")))
            (testing "returns 404 when run does not belong to job"
              (mt/with-temp [:model/TransformJob {other-job-id :id} {:name "Other" :schedule "0 0 0 * * ?"}]
                (mt/user-http-request :lucky :get 404
                                      (str "transform-job/" other-job-id "/runs/" run-id "/transform-runs"))))))))))

(deftest get-job-run-transform-runs-requires-auth-test
  (testing "GET /api/transform-job/:job-id/runs/:run-id/transform-runs requires data-analyst role"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/TransformJob {job-id :id} {:name "Auth Test" :schedule "0 0 0 * * ?"}
                     :model/TransformJobRun {run-id :id} {:job_id     job-id
                                                          :status     "succeeded"
                                                          :run_method "cron"
                                                          :start_time (parse-instant "2025-09-01T10:00:00")}]
        (mt/user-http-request :rasta :get 403
                              (str "transform-job/" job-id "/runs/" run-id "/transform-runs"))))))
