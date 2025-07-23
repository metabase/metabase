(ns metabase-enterprise.reports.api.run-test
  "Tests for the report run API endpoints"
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.middleware.cache.impl :as impl]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn with-reports-feature
  "Test fixture that enables the :reports premium feature for the duration of the test."
  [test-fn]
  (mt/with-premium-features #{:reports}
    (test-fn)))

(use-fixtures :each with-reports-feature)

(defn- deserialize-results
  "Deserialize the results stored in ReportRunCardData"
  [^bytes serialized-bytes]
  (when serialized-bytes
    (let [results (atom [])]
      (impl/with-reducible-deserialized-results [[metadata reducible-rows] (ByteArrayInputStream. serialized-bytes)]
        (when metadata
          (swap! results conj {:metadata metadata})
          (when reducible-rows
            (reduce (fn [acc row]
                      (swap! results conj row)
                      acc)
                    nil
                    reducible-rows))))
      @results)))

(deftest create-report-run-test
  (testing "POST /api/ee/report/:report-id/version/:report-version-id/run"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id report-id}
                   :model/Card {card-id :id} {:name "Test Card"
                                              :dataset_query (mt/mbql-query orders)
                                              :report_document_version_id version-id}]

      (testing "should create a new report run with in-progress status and save card data"
        (mt/user-http-request :crowberto
                              :post 200
                              (format "ee/report/%d/version/%d/run" report-id version-id))
        ;; Verify run was created
        (let [runs (t2/select :model/ReportRun :version_id version-id)]
          (is (= 1 (count runs)))
          (is (= :finished (:status (first runs))))
          (is (= (mt/user->id :crowberto) (:user_id (first runs))))

          ;; Verify card data was saved
          (let [run-id (:id (first runs))
                card-data (t2/select-one :model/ReportRunCardData
                                         :run_id run-id
                                         :card_id card-id)]
            (is (some? card-data))
            (is (some? (:data card-data)))
            (is (instance? (Class/forName "[B") (:data card-data)))

            ;; Verify we can deserialize the results
            (let [deserialized (deserialize-results (:data card-data))]
              (is (seq deserialized))
              (is (= 3 (:cache-version (:metadata (first deserialized)))))
              (is (some? (:last-ran (:metadata (first deserialized)))))))))

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

(deftest run-report-with-regular-cards-test
  (testing "POST /api/ee/report/:report-id/version/:report-version-id/run with regular cards"
    (mt/dataset test-data
      (mt/with-temp [:model/Report {report-id :id} {:name "Test Report with Regular Cards"}
                     :model/ReportVersion {version-id :id} {:report_id report-id}
                     :model/Card {card-id :id}
                     {:name "Regular Card"
                      :display :table
                      :dataset_query (mt/mbql-query orders
                                       {:aggregation [[:count]]
                                        :limit 1})
                      :report_document_version_id version-id}]
        ;; Run the report
        (let [response (mt/user-http-request :crowberto
                                             :post 200
                                             (format "ee/report/%d/version/%d/run" report-id version-id))]
          ;; Verify the run completed successfully
          (is (= "finished" (:status response)))
          ;; Verify a run was created
          (let [runs (t2/select :model/ReportRun :version_id version-id)]
            (is (= 1 (count runs)))
            (is (= :finished (:status (first runs))))

            ;; Verify card data was saved
            (let [run-id (:id (first runs))
                  card-data (t2/select-one :model/ReportRunCardData
                                           :run_id run-id
                                           :card_id card-id)]
              (is (some? card-data))
              (is (some? (:data card-data)))

              ;; Verify the results contain expected data
              (let [deserialized (deserialize-results (:data card-data))]
                (is (seq deserialized))
                ;; Should have metadata, rows, and final metadata
                (is (>= (count deserialized) 2))))))))))

(deftest run-report-with-pivot-cards-test
  (testing "POST /api/ee/report/:report-id/version/:report-version-id/run with pivot cards"
    (mt/dataset test-data
      (mt/with-temp [:model/Report {report-id :id} {:name "Test Report with Pivot Cards"}
                     :model/ReportVersion {version-id :id} {:report_id report-id}
                     :model/Card {pivot-card-id :id}
                     {:name "Pivot Card"
                      :display :pivot
                      :dataset_query (mt/mbql-query orders
                                       {:aggregation [[:count]]
                                        :breakout [$product_id->products.category
                                                   $user_id->people.source]
                                        :limit 5})
                      :visualization_settings {:pivot_table.column_split
                                               {:rows ["CATEGORY"]
                                                :columns ["SOURCE"]
                                                :values ["count"]}}
                      :report_document_version_id version-id}]
        ;; Run the report
        (let [response (mt/user-http-request :crowberto
                                             :post 200
                                             (format "ee/report/%d/version/%d/run" report-id version-id))]
          ;; Verify the run completed successfully
          (is (= "finished" (:status response)))
          ;; Verify a run was created
          (let [runs (t2/select :model/ReportRun :version_id version-id)]
            (is (= 1 (count runs)))
            (is (= :finished (:status (first runs))))

            ;; Verify pivot card data was saved
            (let [run-id (:id (first runs))
                  card-data (t2/select-one :model/ReportRunCardData
                                           :run_id run-id
                                           :card_id pivot-card-id)]
              (is (some? card-data))
              (is (some? (:data card-data)))

              ;; Verify the pivot results
              (let [deserialized (deserialize-results (:data card-data))]
                (is (seq deserialized))
                (is (>= (count deserialized) 2))))))))))

(deftest run-report-with-mixed-card-types-test
  (testing "POST /api/ee/report/:report-id/version/:report-version-id/run with multiple mixed card types"
    (mt/dataset test-data
      (mt/with-temp [:model/Report {report-id :id} {:name "Test Report with Mixed Cards"}
                     :model/ReportVersion {version-id :id} {:report_id report-id}
                     :model/Card {regular-card-id :id}
                     {:name "Regular Card"
                      :display :table
                      :dataset_query (mt/mbql-query products
                                       {:aggregation [[:count]]
                                        :breakout [$category]
                                        :limit 2})
                      :report_document_version_id version-id}
                     :model/Card {pivot-card-id :id}
                     {:name "Pivot Card"
                      :display :pivot
                      :dataset_query (mt/mbql-query orders
                                       {:aggregation [[:sum $subtotal]]
                                        :breakout [$product_id->products.category
                                                   $created_at]
                                        :limit 10})
                      :visualization_settings {:pivot_table.column_split
                                               {:rows ["CATEGORY"]
                                                :columns ["CREATED_AT"]
                                                :values ["sum"]}}
                      :report_document_version_id version-id}
                     :model/Card {another-regular-card-id :id}
                     {:name "Another Regular Card"
                      :display :bar
                      :dataset_query (mt/mbql-query reviews
                                       {:aggregation [[:avg $rating]]
                                        :breakout [$product_id->products.category]
                                        :limit 3})
                      :report_document_version_id version-id}]
        ;; Run the report with all three cards
        (let [response (mt/user-http-request :crowberto
                                             :post 200
                                             (format "ee/report/%d/version/%d/run" report-id version-id))]
          ;; Verify the run completed successfully
          (is (= "finished" (:status response)))
          ;; Verify a run was created
          (let [runs (t2/select :model/ReportRun :version_id version-id)]
            (is (= 1 (count runs)))
            (is (= :finished (:status (first runs))))

            ;; Verify all three cards have saved data
            (let [run-id (:id (first runs))
                  all-card-data (t2/select :model/ReportRunCardData :run_id run-id)]
              (is (= 3 (count all-card-data)))

              ;; Verify each card's data
              (doseq [card-data all-card-data]
                (is (some? (:data card-data)))
                (is (instance? (Class/forName "[B") (:data card-data)))

                ;; Verify we can deserialize each result
                (let [deserialized (deserialize-results (:data card-data))]
                  (is (seq deserialized))
                  (is (>= (count deserialized) 2))))))

          ;; All cards should have been processed without errors
          (is (= 3 (count (t2/select :model/Card :report_document_version_id version-id)))))))))

(deftest error-handling-test
  (testing "POST /api/ee/report/:report-id/version/:report-version-id/run handles errors gracefully"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id report-id}
                   ;; Create a card with an invalid query that will fail
                   :model/Card {card-id :id} {:name "Bad Card"
                                              :report_document_version_id version-id}]

      (testing "should mark run as errored when query execution fails"
        (mt/user-http-request :crowberto
                              :post 200
                              (format "ee/report/%d/version/%d/run" report-id version-id))
        ;; Verify run was created with error status
        (let [runs (t2/select :model/ReportRun :version_id version-id)]
          (is (= 1 (count runs)))
          (is (= :errored (:status (first runs))))
          (is (= (mt/user->id :crowberto) (:user_id (first runs))))

          ;; Verify no card data was saved for the failed query
          (let [run-id (:id (first runs))
                card-data (t2/select :model/ReportRunCardData :run_id run-id)]
            (is (empty? card-data))))))))

(deftest get-card-data-for-run-test
  (testing "GET /api/ee/report/:report-id/version/:report-version-id/run/:run-id/card/:card-id"
    (mt/dataset test-data
      (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                     :model/ReportVersion {version-id :id} {:report_id report-id}
                     :model/Card {card-id :id} {:name "Test Card"
                                                :display :table
                                                :dataset_query (mt/mbql-query products
                                                                 {:aggregation [[:count]]
                                                                  :breakout [$category]
                                                                  :limit 3})
                                                :report_document_version_id version-id}]

        (testing "should return 404 when no run exists"
          (mt/user-http-request :crowberto
                                :get 404
                                (format "ee/report/%d/version/%d/run/99999/card/%d"
                                        report-id version-id card-id)))

        ;; Run the report to create data
        (let [run-response (mt/user-http-request :crowberto
                                                 :post 200
                                                 (format "ee/report/%d/version/%d/run"
                                                         report-id version-id))
              run-id (:id run-response)]

          (testing "should return the saved card data"
            (let [response (mt/user-http-request :crowberto
                                                 :get 200
                                                 (format "ee/report/%d/version/%d/run/%d/card/%d"
                                                         report-id version-id run-id card-id))]
              ;; Verify the response has the expected structure
              (is (map? response))
              (is (contains? response :data))
              (is (contains? (:data response) :rows))
              (is (contains? (:data response) :cols))
              ;; Should have 3 rows based on our limit
              (is (<= (count (get-in response [:data :rows])) 3))
              ;; Each row should have category and count
              (is (every? #(= 2 (count %)) (get-in response [:data :rows])))))

          (testing "should return 404 for non-existent card"
            (mt/user-http-request :crowberto
                                  :get 404
                                  (format "ee/report/%d/version/%d/run/%d/card/99999"
                                          report-id version-id run-id)))

          (testing "should return 404 when card doesn't belong to version"
            (mt/with-temp [:model/Card {other-card-id :id} {:name "Other Card"
                                                            :dataset_query (mt/mbql-query orders
                                                                             {:limit 1})}]
              (mt/user-http-request :crowberto
                                    :get 404
                                    (format "ee/report/%d/version/%d/run/%d/card/%d"
                                            report-id version-id run-id other-card-id)))))))))

(deftest get-card-data-for-latest-run-test
  (testing "GET /api/ee/report/:report-id/version/:report-version-id/run/latest/card/:card-id"
    (mt/dataset test-data
      (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                     :model/ReportVersion {version-id :id} {:report_id report-id}
                     :model/Card {card-id :id} {:name "Test Card"
                                                :display :table
                                                :dataset_query (mt/mbql-query reviews
                                                                 {:aggregation [[:avg $rating]]
                                                                  :breakout [$product_id->products.category]
                                                                  :limit 5})
                                                :report_document_version_id version-id}]

        (testing "should return 404 when no runs exist"
          (mt/user-http-request :crowberto
                                :get 404
                                (format "ee/report/%d/version/%d/run/latest/card/%d"
                                        report-id version-id card-id)))

        ;; Run the report multiple times
        (mt/user-http-request :crowberto
                              :post 200
                              (format "ee/report/%d/version/%d/run"
                                      report-id version-id))
        (let [run2-response (mt/user-http-request :crowberto
                                                  :post 200
                                                  (format "ee/report/%d/version/%d/run"
                                                          report-id version-id))
              run2-id (:id run2-response)]

          (testing "should return data from the most recent run"
            (let [response (mt/user-http-request :crowberto
                                                 :get 200
                                                 (format "ee/report/%d/version/%d/run/latest/card/%d"
                                                         report-id version-id card-id))]
              ;; Verify the response structure
              (is (map? response))
              (is (contains? response :data))
              (is (contains? (:data response) :rows))
              (is (contains? (:data response) :cols))

              ;; Verify it's actually from the latest run by comparing with direct access
              (let [direct-response (mt/user-http-request :crowberto
                                                          :get 200
                                                          (format "ee/report/%d/version/%d/run/%d/card/%d"
                                                                  report-id version-id run2-id card-id))]
                (is (= response direct-response)))))

          (testing "should return 404 for non-existent card"
            (mt/user-http-request :crowberto
                                  :get 404
                                  (format "ee/report/%d/version/%d/run/latest/card/99999"
                                          report-id version-id)))

          (testing "should return 404 when card doesn't belong to version"
            (mt/with-temp [:model/Card {other-card-id :id} {:name "Other Card"
                                                            :dataset_query (mt/mbql-query orders
                                                                             {:limit 1})}]
              (mt/user-http-request :crowberto
                                    :get 404
                                    (format "ee/report/%d/version/%d/run/latest/card/%d"
                                            report-id version-id other-card-id)))))))))

(deftest get-card-data-with-pivot-test
  (testing "GET endpoints should handle pivot card data correctly"
    (mt/dataset test-data
      (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                     :model/ReportVersion {version-id :id} {:report_id report-id}
                     :model/Card {pivot-card-id :id} {:name "Pivot Card"
                                                      :display :pivot
                                                      :dataset_query (mt/mbql-query orders
                                                                       {:aggregation [[:sum $subtotal]]
                                                                        :breakout [$product_id->products.category
                                                                                   $created_at]
                                                                        :limit 10})
                                                      :visualization_settings {:pivot_table.column_split
                                                                               {:rows ["CATEGORY"]
                                                                                :columns ["CREATED_AT"]
                                                                                :values ["sum"]}}
                                                      :report_document_version_id version-id}]

        ;; Run the report
        (let [run-response (mt/user-http-request :crowberto
                                                 :post 200
                                                 (format "ee/report/%d/version/%d/run"
                                                         report-id version-id))
              run-id (:id run-response)]

          (testing "should return pivot card data for specific run"
            (let [response #p (mt/user-http-request :crowberto
                                                    :get 200
                                                    (format "ee/report/%d/version/%d/run/%d/card/%d"
                                                            report-id version-id run-id pivot-card-id))]
              ;; Verify pivot data structure
              (is (map? response))
              (is (contains? response :data))
              (is (contains? (:data response) :rows))
              (is (contains? (:data response) :cols))
              ;; Pivot queries typically have specific column structure
              (is (seq (get-in response [:data :rows])))
              (is (seq (get-in response [:data :cols])))))

          (testing "should return pivot card data for latest run"
            (let [response (mt/user-http-request :crowberto
                                                 :get 200
                                                 (format "ee/report/%d/version/%d/run/latest/card/%d"
                                                         report-id version-id pivot-card-id))]
              ;; Verify pivot data structure
              (is (map? response))
              (is (contains? response :data))
              (is (contains? (:data response) :rows))
              (is (contains? (:data response) :cols)))))))))
