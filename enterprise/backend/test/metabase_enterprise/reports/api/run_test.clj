(ns metabase-enterprise.reports.api.run-test
  "Tests for the report run API endpoints"
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn with-reports-feature
  "Test fixture that enables the :reports premium feature for the duration of the test."
  [test-fn]
  (mt/with-premium-features #{:reports}
    (test-fn)))

(use-fixtures :each with-reports-feature)

(deftest create-report-run-test
  (testing "POST /api/ee/report/:report-id/version/:report-version-id/run"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Field {field-id :id} {:table_id table-id
                                                :name "field"}
                   :model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id report-id}
                   :model/Card {card-id :id} {:name "Test Card"
                                              :dataset_query {:database db-id
                                                              :type :query
                                                              :query {:source-table table-id}}
                                              :report_document_version_id version-id}]

      (testing "should create a new report run with in-progress status"
        (mt/user-http-request :crowberto
                              :post 200
                              (format "ee/report/%d/version/%d/run" report-id version-id))
        ;; Verify run was created
        (let [runs (t2/select :model/ReportRun :version_id version-id)]
          (is (= 1 (count runs)))
          (is (= "in-progress" (:status (first runs))))
          (is (= (mt/user->id :crowberto) (:user_id (first runs))))))

      (testing "should return 404 for non-existent report version"
        (mt/user-http-request :crowberto
                              :post 404
                              (format "ee/report/%d/version/99999/run" report-id))))))

(deftest get-all-runs-test
  (testing "GET /api/ee/report/:report-id/version/:report-version-id/run"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id report-id}
                   :model/ReportRun {run-id-1 :id} {:version_id version-id
                                                    :status :finished
                                                    :user_id (mt/user->id :crowberto)}
                   :model/ReportRun {run-id-2 :id} {:version_id version-id
                                                    :status :in-progress
                                                    :user_id (mt/user->id :rasta)}]

      (testing "should return all runs for a report version"
        (let [response (mt/user-http-request :crowberto
                                             :get 200
                                             (format "ee/report/%d/version/%d/run" report-id version-id))]
          (is (= 2 (count (:data response))))
          ;; Should be ordered by created_at desc
          (is (= run-id-2 (:id (first (:data response)))))
          (is (= run-id-1 (:id (second (:data response)))))
          ;; Should include user info
          (is (= "Crowberto" (:first_name (:user (second (:data response))))))
          (is (= "Rasta" (:first_name (:user (first (:data response))))))))

      (testing "should return 404 for non-existent report version"
        (mt/user-http-request :crowberto
                              :get 404
                              (format "ee/report/%d/version/99999/run" report-id))))))

(deftest get-single-run-test
  (testing "GET /api/ee/report/:report-id/version/:report-version-id/run/:run-id"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id report-id}
                   :model/ReportRun {run-id :id} {:version_id version-id
                                                  :status :finished
                                                  :user_id (mt/user->id :crowberto)}]

      (testing "should return a single run with user info"
        (let [response (mt/user-http-request :crowberto
                                             :get 200
                                             (format "ee/report/%d/version/%d/run/%d" report-id version-id run-id))]
          (is (= run-id (:id response)))
          (is (= "finished" (:status response)))
          (is (= "Crowberto" (:first_name (:user response))))
          (is (= "crowberto@metabase.com" (:email (:user response))))))

      (testing "should return 404 for non-existent run"
        (mt/user-http-request :crowberto
                              :get 404
                              (format "ee/report/%d/version/%d/run/99999" report-id version-id)))

      (testing "should return 404 for run that doesn't belong to the version"
        (mt/with-temp [:model/ReportVersion {other-version-id :id} {:report_id report-id}
                       :model/ReportRun {other-run-id :id} {:version_id other-version-id
                                                            :status :finished
                                                            :user_id (mt/user->id :crowberto)}]
          (mt/user-http-request :crowberto
                                :get 404
                                (format "ee/report/%d/version/%d/run/%d" report-id version-id other-run-id)))))))

(deftest get-latest-run-test
  (testing "GET /api/ee/report/:report-id/version/:report-version-id/run/latest"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id report-id}]

      (testing "should return 404 when no runs exist"
        (mt/user-http-request :crowberto
                              :get 404
                              (format "ee/report/%d/version/%d/run/latest" report-id version-id)))

      (testing "should return the most recent run"
        (mt/with-temp [:model/ReportRun {old-run-id :id} {:version_id version-id
                                                          :status :finished
                                                          :user_id (mt/user->id :crowberto)
                                                          :created_at #t "2024-01-01T10:00:00"}
                       :model/ReportRun {newer-run-id :id} {:version_id version-id
                                                            :status :failed
                                                            :user_id (mt/user->id :rasta)
                                                            :created_at #t "2024-01-01T11:00:00"}
                       :model/ReportRun {latest-run-id :id} {:version_id version-id
                                                             :status :in-progress
                                                             :user_id (mt/user->id :crowberto)
                                                             :created_at #t "2024-01-01T12:00:00"}]
          (let [response (mt/user-http-request :crowberto
                                               :get 200
                                               (format "ee/report/%d/version/%d/run/latest" report-id version-id))]
            (is (= latest-run-id (:id response)))
            (is (= "in-progress" (:status response)))
            (is (= "Crowberto" (:first_name (:user response))))
            (is (= "crowberto@metabase.com" (:email (:user response)))))))

      (testing "should return 404 for non-existent report version"
        (mt/user-http-request :crowberto
                              :get 404
                              (format "ee/report/%d/version/99999/run/latest" report-id))))))
