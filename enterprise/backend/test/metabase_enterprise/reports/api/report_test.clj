(ns metabase-enterprise.reports.api.report-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest post-report-test
  (testing "POST /api/ee/report/"
    (mt/with-temp-test-data []
      (testing "should create a new report"
        (let [result (mt/user-http-request :crowberto
                                           :post 200 "ee/report/" {:name "Report 1" :document "Doc 1"})
              report-row (t2/select-one :model/Report :id (:id result))
              report-doc-row (t2/select-one :model/ReportVersion :report_id (:id report-row))]
          (is (partial= {:name "Report 1" :document "Doc 1"} result))
          (is (pos? (:id result)))

          (is (partial= {:name "Report 1"} report-row))
          (is (partial=
               {:document           "Doc 1"
                :version_identifier 1}
               report-doc-row)))))))

(deftest put-report-test
  (testing "PUT /api/ee/report/id"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id          report-id
                                                          :document           "Initial Doc"
                                                          :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (testing "should update an existing report"
        (let [result (mt/user-http-request :crowberto
                                           :put 200 (format "ee/report/%s" report-id) {:name "Report 2" :document "Doc 2"})]
          (is (partial= {:name     "Report 2"
                         :document "Doc 2"
                         :version  2} result))
          result))))
  (testing "should return 404 for non-existent report"
    (mt/user-http-request :crowberto
                          :put 404 "ee/report/99999" {:name "Non-existent Report" :document "Doc"})))

(deftest get-report-test
  (testing "GET /api/ee/report/id"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {} {:report_id          report-id
                                            :document           "Doc 1"
                                            :version_identifier 1}
                   :model/ReportVersion {version-id :id} {:report_id          report-id
                                                          :document           "Doc 2"
                                                          :version_identifier 2}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (testing "should get the latest version when no version specified"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/report/%s" report-id))]
          (is (partial= {:name     "Test Report"
                         :document "Doc 2"
                         :version  2} result))
          result))
      (testing "should get the 1st version when specified"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/report/%s?version=1" report-id))]
          (is (partial= {:name     "Test Report"
                         :document "Doc 1"
                         :version  1} result))
          result))
      (testing "should get the 2nd version when specified"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/report/%s?version=2" report-id))]
          (is (partial= {:name     "Test Report"
                         :document "Doc 2"
                         :version  2} result))
          result))
      (testing "should return 404 for non-existent report"
        (mt/user-http-request :crowberto
                              :get 404 "ee/report/99999"))
      (testing "should return 404 for non-existent report versions"
        (mt/user-http-request :crowberto
                              :get 404 (format "ee/report/%s?version=3" report-id))))))

(deftest get-reports-test
  (testing "GET /api/ee/report"
    (mt/with-temp [:model/Report {report1-id :id} {:name "Report 1"}
                   :model/Report {report2-id :id} {:name "Report 2"}
                   :model/ReportVersion {version1-id :id} {:report_id          report1-id
                                                           :document           "Initial Doc 1"
                                                           :version_identifier 1}
                   :model/ReportVersion {version2-id :id} {:report_id          report2-id
                                                           :document           "Initial Doc 2"
                                                           :version_identifier 1}]
      (t2/update! :model/Report report1-id {:current_version_id version1-id})
      (t2/update! :model/Report report2-id {:current_version_id version2-id})

      (testing "should get existing reports"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 "ee/report/")]
          (is (set/subset? #{"Report 1" "Report 2"} (set (map :name result))))
          (is (set/subset? #{"Initial Doc 1" "Initial Doc 2"} (set (map :document result))))
          result))))
  (testing "should return 404 for non-existent report"
    (mt/user-http-request :crowberto
                          :get 404 "ee/report/99999")))

(deftest get-report-versions-test
  (testing "GET /api/ee/report/:id/versions"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {v1 :id} {:report_id          report-id
                                                  :document           "Doc 1"
                                                  :version_identifier 1
                                                  :parent_version_id  nil}
                   :model/ReportVersion {v2 :id} {:report_id          report-id
                                                  :document           "Doc 2"
                                                  :version_identifier 2
                                                  :parent_version_id  v1}
                   :model/ReportVersion {latest-version-id :id} {:report_id          report-id
                                                                 :document           "Doc 3"
                                                                 :version_identifier 3
                                                                 :parent_version_id  v2}]
      (t2/update! :model/Report report-id {:current_version_id latest-version-id})

      (testing "should get all versions of a report"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (str "ee/report/%s/versions" report-id))]
          (is (partial= [{:document "Doc 1" :version 1 :content_type "text/markdown" :parent_version_id nil}
                         {:document "Doc 2" :version 2 :content_type "text/markdown" :parent_version_id v1}
                         {:document "Doc 3" :version 3 :content_type "text/markdown" :parent_version_id v2}] result))
          result))
      (testing "should return 404 for non-existent report"
        (mt/user-http-request :crowberto
                              :get 404 "ee/report/99999/versions")))))
