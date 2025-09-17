(ns metabase-enterprise.transforms.api.transform-job-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.models.transform-job]
   [metabase-enterprise.transforms.models.transform-tag]
   [metabase-enterprise.transforms.schedule :as transforms.schedule]
   [metabase-enterprise.transforms.test-util :refer [parse-instant utc-timestamp]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest create-job-test
  (testing "POST /api/ee/transform-job"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformTag tag1 {:name "test-tag-1"}
                     :model/TransformTag tag2 {:name "test-tag-2"}]
        (testing "Creates job with valid data"
          (let [response (mt/user-http-request :crowberto :post 200 "ee/transform-job"
                                               {:name        "Test Job"
                                                :description "Test Description"
                                                :schedule    "0 0 0 * * ?"
                                                :tag_ids     [(:id tag1) (:id tag2)]})]
            (is (some? (:id response)))
            (is (= "Test Job" (:name response)))
            (is (= "Test Description" (:description response)))
            (is (= "0 0 0 * * ?" (:schedule response)))
            (is (= (set [(:id tag1) (:id tag2)]) (set (:tag_ids response))))))

        (testing "Validates cron expression"
          (let [response (mt/user-http-request :crowberto :post 400 "ee/transform-job"
                                               {:name     "Bad Cron Job"
                                                :schedule "invalid cron"})]
            (is (string? response))
            (is (re-find #"Invalid cron expression" response))))

        (testing "Validates tag IDs exist"
          (let [response (mt/user-http-request :crowberto :post 400 "ee/transform-job"
                                               {:name     "Job with bad tags"
                                                :schedule "0 0 0 * * ?"
                                                :tag_ids  [999999]})]
            (is (string? response))
            (is (re-find #"tag IDs do not exist" response))))))))

(deftest get-job-test
  (testing "GET /api/ee/transform-job/:id"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformTag tag {:name "test-tag"}
                     :model/TransformJob job {:name     "Test Job"
                                              :schedule "0 0 0 * * ?"}
                     :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}]
        (testing "Returns job with hydrated fields"
          (let [response (mt/user-http-request :crowberto :get 200 (str "ee/transform-job/" (:id job)))]
            (is (= (:id job) (:id response)))
            (is (= "Test Job" (:name response)))
            (is (= [(:id tag)] (:tag_ids response)))
            (is (nil? (:last_run response)))))

        (testing "Returns 404 for non-existent job"
          (mt/user-http-request :crowberto :get 404 "ee/transform-job/999999"))))))

(deftest get-job-transforms-test
  (testing "GET /api/ee/transform-job/:id/transforms"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform {transform1-id :id} {:name "tr1"}
                     :model/Transform {transform2-id :id} {:name "tr2"}
                     :model/Transform _transform3 {}
                     :model/TransformTag {tag-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform1-id :tag_id tag-id :position 0}
                     :model/TransformTransformTag _ {:transform_id transform2-id :tag_id tag-id :position 0}
                     :model/TransformJob {job-id :id} {}
                     :model/TransformJobTransformTag _ {:job_id job-id :tag_id tag-id :position 0}]
        (testing "Returns the transforms of the job"
          (let [response (mt/user-http-request :crowberto :get 200 (str "ee/transform-job/" job-id "/transforms"))]
            (is (=? [{:id transform1-id, :name "tr1"} {:id transform2-id, :name "tr2"}]
                    (sort-by :id response)))))

        (testing "Returns 404 for non-existent job"
          (mt/user-http-request :crowberto :get 404 "ee/transform-job/999999/transforms"))))))

(deftest list-jobs-test
  (testing "GET /api/ee/transform-job"
    (mt/with-premium-features #{:transforms}
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
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform-job")]
                (is (= our-job-ids (returned-job-ids response)))))
            (testing "filtering by transform_tag_ids"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform-job" :transform_tag_ids [t2-id])]
                (is (=? [{:schedule "0 0 0 * * ?"
                          :tag_ids [t2-id]
                          :name "Job 3"
                          :id j3-id}]
                        (returned-jobs response)))))
            (testing "filtering by last_run_start_time"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform-job" :last_run_start_time "2025-08-26~")]
                (is (= #{j2-id} (returned-job-ids response)))))
            (testing "filtering by last_run_end_time without scheduled job"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform-job" :next_run_start_time "2025-08-26~")]
                (is (= #{} (returned-job-ids response)))))
            (testing "filtering by last_run_end_time with scheduled job"
              (mt/with-temp-scheduler!
                (transforms.schedule/initialize-job! {:id j1-id, :schedule at-5-second-schedule})
                (try
                  (let [response (mt/user-http-request :crowberto :get 200 "ee/transform-job" :next_run_start_time "2025-08-27~")]
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
                    (transforms.schedule/delete-job! j1-id)))))))))))

(deftest update-job-test
  (testing "PUT /api/ee/transform-job/:id"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformTag tag1 {:name "tag-1"}
                     :model/TransformTag tag2 {:name "tag-2"}]
        (let [job (mt/user-http-request :crowberto :post 200 "ee/transform-job"
                                        {:name "Original" :schedule "0 0 0 * * ?"})]
          (testing "Updates job fields"
            (let [response (mt/user-http-request :crowberto :put 200 (str "ee/transform-job/" (:id job))
                                                 {:name        "Updated"
                                                  :description "New Description"
                                                  :schedule    "0 0 */2 * * ?"
                                                  :tag_ids     [(:id tag1) (:id tag2)]})]
              (is (= "Updated" (:name response)))
              (is (= "New Description" (:description response)))
              (is (= "0 0 */2 * * ?" (:schedule response)))
              (is (= (set [(:id tag1) (:id tag2)]) (set (:tag_ids response))))))

          (testing "Validates cron expression"
            (let [response (mt/user-http-request :crowberto :put 400 (str "ee/transform-job/" (:id job))
                                                 {:schedule "invalid"})]
              (is (string? response))
              (is (re-find #"Invalid cron expression" response)))))))))

(deftest delete-job-test
  (testing "DELETE /api/ee/transform-job/:id"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformJob job {:name "To Delete" :schedule "0 0 0 * * ?"}]
        (testing "Deletes job"
          (mt/user-http-request :crowberto :delete 204 (str "ee/transform-job/" (:id job)))
          (is (nil? (t2/select-one :model/TransformJob :id (:id job)))))

        (testing "Returns 404 for non-existent job"
          (mt/user-http-request :crowberto :delete 404 "ee/transform-job/999999"))))))

(deftest execute-job-test
  (testing "POST /api/ee/transform-job/:id/execute"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformJob job {:name "To Execute" :schedule "0 0 0 * * ?"}]
        (testing "Returns stub run response"
          (let [response (mt/user-http-request :crowberto :post 200 (str "ee/transform-job/" (:id job) "/run"))]
            (is (= "Job run started" (:message response)))
            (is (string? (:job_run_id response)))
            (is (re-matches #"stub-\d+-\d+" (:job_run_id response)))))))))

(deftest permissions-test
  (testing "All endpoints require superuser permissions"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformJob job {:name "Test" :schedule "0 0 0 * * ?"}]
        (mt/user-http-request :rasta :post 403 "ee/transform-job"
                              {:name "New" :schedule "0 0 0 * * ?"})
        (mt/user-http-request :rasta :get 403 "ee/transform-job")
        (mt/user-http-request :rasta :get 403 (str "ee/transform-job/" (:id job)))
        (mt/user-http-request :rasta :put 403 (str "ee/transform-job/" (:id job))
                              {:name "Updated"})
        (mt/user-http-request :rasta :delete 403 (str "ee/transform-job/" (:id job)))
        (mt/user-http-request :rasta :post 403 (str "ee/transform-job/" (:id job) "/run"))))))
