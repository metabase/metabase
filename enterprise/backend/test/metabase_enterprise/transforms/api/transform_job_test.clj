(ns metabase-enterprise.transforms.api.transform-job-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.models.transform-job]
   [metabase-enterprise.transforms.models.transform-tag]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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

(deftest list-jobs-test
  (testing "GET /api/ee/transform-job"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformJob job1 {:name "Job 1" :schedule "0 0 0 * * ?"}
                     :model/TransformJob job2 {:name "Job 2" :schedule "0 0 */4 * * ?"}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/transform-job")
              job-ids  (set (map :id response))]
          (is (contains? job-ids (:id job1)))
          (is (contains? job-ids (:id job2)))
          (is (every? #(or
                        (and (not= (:id %) (:id job1))
                             (not= (:id %) (:id job2)))
                        (nil? (:last_run %))) response)))))))

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
