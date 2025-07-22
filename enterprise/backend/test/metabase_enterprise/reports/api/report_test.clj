(ns metabase-enterprise.reports.api.report-test
  (:require
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
                   :model/ReportVersion {version-id :id} {:report_id          report-id
                                                          :document           "Initial Doc"
                                                          :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (testing "should get an existing report"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/report/%s" report-id))]
          (is (partial= {:name     "Test Report"
                         :document "Initial Doc"
                         :version  1} result))
          result))))
  (testing "should return 404 for non-existent report"
    (mt/user-http-request :crowberto
                          :get 404 "ee/report/99999")))
