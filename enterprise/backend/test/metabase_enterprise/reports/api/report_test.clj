(ns metabase-enterprise.reports.api.report-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.reports.api.report :as report-api]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest post-report-basic-creation-test
  (testing "POST /api/ee/report/ - basic report creation"
    (mt/with-model-cleanup [:model/Report]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/report/" {:name "Report 1"
                                                                 :document "Doc 1"})
            report-row (t2/select-one :model/Report :id (:id result))
            report-doc-row (t2/select-one :model/ReportVersion :report_id (:id report-row))]
        (is (partial= {:name "Report 1" :document "Doc 1"} result))
        (is (pos? (:id result)))

        (is (partial= {:name "Report 1"} report-row))
        (is (partial=
             {:document           "Doc 1"
              :version_identifier 1}
             report-doc-row))))))

(deftest post-report-invalid-card-ids-test
  (testing "POST /api/ee/report/ - should reject invalid card-ids"
    (mt/with-model-cleanup [:model/Report]
      (testing "non-integer values"
        (mt/user-http-request :crowberto
                              :post 400 "ee/report/"
                              {:name "Report"
                               :document "Doc"
                               :card-ids ["invalid"]}))

      (testing "negative integers"
        (mt/user-http-request :crowberto
                              :post 400 "ee/report/"
                              {:name "Report"
                               :document "Doc"
                               :card-ids [-1 2]}))

      (testing "zero values"
        (mt/user-http-request :crowberto
                              :post 400 "ee/report/"
                              {:name "Report"
                               :document "Doc"
                               :card-ids [0 1]})))))

(deftest post-report-valid-card-association-test
  (testing "POST /api/ee/report/ - should associate valid :in_report cards with new report"
    (mt/with-model-cleanup [:model/Report]
      (mt/with-temp [:model/Card card1 {:name "Card 1"
                                        :type :in_report
                                        :dataset_query (mt/mbql-query venues)}
                     :model/Card card2 {:name "Card 2"
                                        :type :in_report
                                        :dataset_query (mt/mbql-query venues)}]
        (let [result (mt/user-http-request :crowberto
                                           :post 200 "ee/report/"
                                           {:name "Report with Valid Cards"
                                            :document "Doc with valid cards"
                                            :card-ids [(:id card1) (:id card2)]})
              updated-card1 (t2/select-one :model/Card :id (:id card1))
              updated-card2 (t2/select-one :model/Card :id (:id card2))]
          (is (pos? (:id result)))
          (is (= (:id result) (:report_document_id updated-card1)))
          (is (= (:id result) (:report_document_id updated-card2))))))))

(deftest post-report-nonexistent-card-ids-test
  (testing "POST /api/ee/report/ - should reject non-existent card-ids"
    (mt/with-model-cleanup [:model/Report]
      (let [non-existent-id 999999]
        (mt/user-http-request :crowberto
                              :post 404 "ee/report/"
                              {:name "Report with Missing Cards"
                               :document "Doc"
                               :card-ids [non-existent-id]})))))

(deftest post-report-wrong-card-type-test
  (testing "POST /api/ee/report/ - should reject cards with wrong type"
    (mt/with-model-cleanup [:model/Report :model/Card]
      (mt/with-temp [:model/Card wrong-type-card {:name "Wrong Type Card"
                                                  :type :question
                                                  :dataset_query (mt/mbql-query venues)}]
        (is (=? {:message #"The following cards cannot be used in reports because they have the wrong type:.*"}
                (mt/user-http-request :crowberto
                                      :post 400 "ee/report/"
                                      {:name "Report with Wrong Type Cards"
                                       :document "Doc"
                                       :card-ids [(:id wrong-type-card)]})))))))

(deftest post-report-nil-card-ids-test
  (testing "POST /api/ee/report/ - should error on nil card-ids"
    (mt/with-model-cleanup [:model/Report]
      (mt/user-http-request :crowberto
                            :post 400 "ee/report/"
                            {:name "Report with Nil Cards"
                             :document "Doc with nil cards"
                             :card-ids nil}))))

(deftest post-report-empty-card-ids-test
  (testing "POST /api/ee/report/ - should handle empty card-ids gracefully"
    (mt/with-model-cleanup [:model/Report]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/report/"
                                         {:name "Report with Empty Cards"
                                          :document "Doc with empty cards"
                                          :card-ids []})]
        (is (pos? (:id result)))))))

(deftest post-report-transaction-rollback-test
  (testing "POST /api/ee/report/ - transaction rollback when card update fails"
    (mt/with-model-cleanup [:model/Report :model/Card]
            ;; This test ensures that if card updates fail, the entire transaction is rolled back
      (mt/with-temp [:model/Card card {:name "Test Card"
                                       :type :in_report
                                       :dataset_query (mt/mbql-query venues)}]
              ;; Create a scenario where card update might fail by using a mixed set of valid and invalid cards
        (let [invalid-card-id 999999
              initial-reports-count (t2/count :model/Report)]
          (mt/user-http-request :crowberto
                                :post 404 "ee/report/"
                                {:name "Report That Should Rollback"
                                 :document "Doc"
                                 :card-ids [(:id card) invalid-card-id]})
                ;; Verify no new report was created due to rollback
          (is (= initial-reports-count (t2/count :model/Report)))
                ;; Verify the valid card wasn't updated
          (let [unchanged-card (t2/select-one :model/Card :id (:id card))]
            (is (nil? (:report_document_id unchanged-card)))))))))

(deftest put-report-basic-update-test
  (testing "PUT /api/ee/report/id - basic report update"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id}
                   {:report_id          report-id
                    :document           "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/report/%s" report-id) {:name "Report 2" :document "Doc 2"})]
        (is (partial= {:name     "Report 2"
                       :document "Doc 2"
                       :version 2} result))))))

(deftest put-report-associate-valid-cards-test
  (testing "PUT /api/ee/report/id - should associate valid :in_report cards with existing report"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id}
                   {:report_id report-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card card1 {:name "Card 1"
                                          :type :in_report
                                          :dataset_query (mt/mbql-query venues)}
                       :model/Card card2 {:name "Card 2"
                                          :type :in_report
                                          :dataset_query (mt/mbql-query venues)}]
          (let [result (mt/user-http-request :crowberto
                                             :put 200 (format "ee/report/%s" report-id)
                                             {:name "Updated Report with Cards"
                                              :document "Updated doc with cards"
                                              :card-ids [(:id card1) (:id card2)]})
                updated-card1 (t2/select-one :model/Card :id (:id card1))
                updated-card2 (t2/select-one :model/Card :id (:id card2))]
            (is (= report-id (:id result)))
            (is (= report-id (:report_document_id updated-card1)))
            (is (= report-id (:report_document_id updated-card2)))))))))

(deftest put-report-clear-existing-card-associations-test
  (testing "PUT /api/ee/report/id - should clear existing card associations when updating with new cards"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id}
                   {:report_id report-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card old-card {:name "Old Card"
                                             :type :in_report
                                             :report_document_id report-id
                                             :dataset_query (mt/mbql-query venues)}
                       :model/Card new-card {:name "New Card"
                                             :type :in_report
                                             :dataset_query (mt/mbql-query venues)}]
          (mt/user-http-request :crowberto
                                :put 200 (format "ee/report/%s" report-id)
                                {:card-ids [(:id new-card)]})
          (let [updated-old-card (t2/select-one :model/Card :id (:id old-card))
                updated-new-card (t2/select-one :model/Card :id (:id new-card))]
            (is (= report-id (:report_document_id updated-old-card)))
            (is (= report-id (:report_document_id updated-new-card)))))))))

(deftest put-report-reject-nonexistent-card-ids-test
  (testing "PUT /api/ee/report/id - should reject non-existent card-ids"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id}
                   {:report_id report-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (let [non-existent-id 999999]
        (is (=? {:message #"The following card IDs do not exist.*"}
                (mt/user-http-request :crowberto
                                      :put 404 (format "ee/report/%s" report-id)
                                      {:name "Report with Missing Cards"
                                       :document "Doc"
                                       :card-ids [non-existent-id]})))))))

(deftest put-report-reject-wrong-card-type-test
  (testing "PUT /api/ee/report/id - should reject cards with wrong type"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id}
                   {:report_id report-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card wrong-type-card {:name "Wrong Type Card"
                                                    :type :question
                                                    :dataset_query (mt/mbql-query venues)}]
          (is (=? {:message #"The following cards cannot be used in reports.*"}
                  (mt/user-http-request :crowberto
                                        :put 400 (format "ee/report/%s" report-id)
                                        {:name "Report with Wrong Type Cards"
                                         :document "Doc"
                                         :card-ids [(:id wrong-type-card)]}))))))))

(deftest put-report-handle-empty-card-ids-test
  (testing "PUT /api/ee/report/id - should handle empty card-ids gracefully"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id}
                   {:report_id report-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/report/%s" report-id)
                                         {:name "Report with Empty Cards"
                                          :document "Doc with empty cards"
                                          :card-ids []})]
        (is (= report-id (:id result)))))))

(deftest put-report-transaction-rollback-test
  (testing "PUT /api/ee/report/id - transaction rollback when card update fails"
    (mt/with-temp [:model/Report {report-id :id} {:name "Test Report"}
                   :model/ReportVersion {version-id :id}
                   {:report_id report-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      (let [initial-report (t2/select-one :model/Report :id report-id)
            invalid-card-id 999999
            initial-versions-count (t2/count :model/ReportVersion :report_id report-id)]
        (mt/user-http-request :crowberto
                              :put 404 (format "ee/report/%s" report-id)
                              {:name "Report That Should Rollback"
                               :document "Doc that should rollback"
                               :card-ids [invalid-card-id]})
              ;; Verify no new report version was created due to rollback
        (is (= initial-versions-count (t2/count :model/ReportVersion :report_id report-id)))
              ;; Verify the report name wasn't updated
        (let [unchanged-report (t2/select-one :model/Report :id report-id)]
          (is (= (:name initial-report) (:name unchanged-report))))))))

(deftest put-report-nonexistent-report-test
  (testing "PUT /api/ee/report/id - should return 404 for non-existent report"
    (mt/user-http-request :crowberto
                          :put 404 "ee/report/99999" {:name "Non-existent Report" :document "Doc"})))

(deftest put-report-with-no-perms-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Report {report-id :id} {:collection_id coll-id}
                 :model/ReportVersion {version-id :id} {:report_id          report-id
                                                        :document           "Doc 1"
                                                        :version_identifier 1}]
    (t2/update! :model/Report report-id {:current_version_id version-id})
    (mt/with-non-admin-groups-no-collection-perms coll-id
      (mt/user-http-request :rasta :put 403 (str "ee/report/" report-id)
                            {:name "Meow"}))))

(deftest post-report-with-no-perms-test
  (mt/with-temp [:model/Collection {coll-id :id} {}]
    (mt/with-non-admin-groups-no-collection-perms coll-id
      (mt/user-http-request :rasta :post 403 "ee/report/"
                            {:name "Foo"
                             :document "Bar"
                             :collection_id coll-id}))))

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
                                           :get 200 (format "ee/report/%s/versions" report-id))]
          (is (partial= [{:document "Doc 1" :version 1 :content_type "text/markdown" :parent_version_id nil}
                         {:document "Doc 2" :version 2 :content_type "text/markdown" :parent_version_id v1}
                         {:document "Doc 3" :version 3 :content_type "text/markdown" :parent_version_id v2}] result))
          result))
      (testing "should return 404 for non-existent report"
        (mt/user-http-request :crowberto
                              :get 404 "ee/report/99999/versions")))))

(deftest validate-cards-for-report-test
  (testing "validate-cards-for-report function"
    (let [validate-cards #'report-api/validate-cards-for-report]

      (testing "should pass with empty card list"
        (is (nil? (validate-cards []))))

      (testing "should pass with nil card list"
        (is (nil? (validate-cards nil))))

      (testing "should pass with valid :in_report cards"
        (mt/with-temp [:model/Card card1 {:name "Valid Card 1"
                                          :dataset_query (mt/mbql-query venues)
                                          :display :table
                                          :visualization_settings {}
                                          :type :in_report}
                       :model/Card card2 {:name "Valid Card 2"
                                          :dataset_query (mt/mbql-query venues)
                                          :display :table
                                          :visualization_settings {}
                                          :type :in_report}]
          (let [result (validate-cards [(:id card1) (:id card2)])]
            (is (= 2 (count result)))
            (is (every? #(= :in_report (:type %)) result))
            (is (= #{(:id card1) (:id card2)} (set (map :id result)))))))

      (testing "should fail with non-existent card ids"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"The following card IDs do not exist: \[999999\].*"
             (validate-cards [999999])))

        (let [ex (try (validate-cards [999999 888888])
                      (catch Exception e e))]
          (is (= 404 (:status-code (ex-data ex))))
          (is (= [999999 888888] (:missing-card-ids (ex-data ex))))))

      (testing "should fail with cards that don't have :in_report type"
        (mt/with-temp [:model/Card question-card {:name "Question Card"
                                                  :dataset_query (mt/mbql-query venues)
                                                  :display :table
                                                  :visualization_settings {}
                                                  :type :question}
                       :model/Card model-card {:name "Model Card"
                                               :dataset_query (mt/mbql-query venues)
                                               :display :table
                                               :visualization_settings {}
                                               :type :model}]
          (testing "single invalid card"
            (let [ex (try (validate-cards [(:id question-card)])
                          (catch Exception e e))]
              (is (= 400 (:status-code (ex-data ex))))
              (is (= [(:id question-card)] (mapv :id (:invalid-cards (ex-data ex)))))
              (is (= [:question] (mapv :type (:invalid-cards (ex-data ex)))))))

          (testing "multiple invalid cards"
            (let [ex (try (validate-cards [(:id question-card) (:id model-card)])
                          (catch Exception e e))]
              (is (= 400 (:status-code (ex-data ex))))
              (is (= #{(:id question-card) (:id model-card)}
                     (set (mapv :id (:invalid-cards (ex-data ex))))))))))

      (testing "should fail with mix of valid and invalid cards"
        (mt/with-temp [:model/Card valid-card {:name "Valid Card"
                                               :dataset_query (mt/mbql-query venues)
                                               :display :table
                                               :visualization_settings {}
                                               :type :in_report}
                       :model/Card invalid-card {:name "Invalid Card"
                                                 :dataset_query (mt/mbql-query venues)
                                                 :display :table
                                                 :visualization_settings {}
                                                 :type :question}]
          (let [ex (try (validate-cards [(:id valid-card) (:id invalid-card)])
                        (catch Exception e e))]
            (is (= 400 (:status-code (ex-data ex))))
            (is (= [(:id invalid-card)] (mapv :id (:invalid-cards (ex-data ex)))))))

        (testing "should handle partial missing cards"
          (mt/with-temp [:model/Card existing-card {:name "Existing Card"
                                                    :dataset_query (mt/mbql-query venues)
                                                    :display :table
                                                    :visualization_settings {}
                                                    :type :in_report}]
            (let [ex (try (validate-cards [(:id existing-card) 999999])
                          (catch Exception e e))]
              (is (= 404 (:status-code (ex-data ex))))
              (is (= [999999] (:missing-card-ids (ex-data ex)))))))))))

(deftest report-collection-sync-integration-test
  (testing "End-to-end collection synchronization through API"
    (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                   :model/Collection {new-collection-id :id} {:name "New Collection"}
                   :model/Report {report-id :id} {:collection_id old-collection-id :name "Integration Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id report-id
                                                          :document "Integration test doc"
                                                          :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      ;; Create cards associated with the report
      (mt/with-temp [:model/Card {card1-id :id} {:name "Integration Card 1"
                                                 :type :in_report
                                                 :report_document_id report-id
                                                 :collection_id old-collection-id
                                                 :dataset_query (mt/mbql-query venues)}
                     :model/Card {card2-id :id} {:name "Integration Card 2"
                                                 :type :in_report
                                                 :report_document_id report-id
                                                 :collection_id old-collection-id
                                                 :dataset_query (mt/mbql-query venues)}
                     ;; This card should NOT be affected (different type)
                     :model/Card {other-card-id :id} {:name "Other Card"
                                                      :type :question
                                                      :collection_id old-collection-id
                                                      :dataset_query (mt/mbql-query venues)}]

        (testing "PUT /api/ee/report/:id with collection change syncs cards"
          ;; Update report through API to move to new collection
          (let [response (mt/user-http-request :crowberto
                                               :put 200 (format "ee/report/%s" report-id)
                                               {:collection_id new-collection-id})]
            (is (= new-collection-id (:collection_id response)))

            ;; Verify report was moved
            (is (= new-collection-id (:collection_id (t2/select-one :model/Report :id report-id))))

            ;; Verify associated cards were moved
            (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card1-id))))
            (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card2-id))))

            ;; Verify other card was NOT moved
            (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id other-card-id))))))

        (testing "Moving to root collection (nil) works"
          (let [response (mt/user-http-request :crowberto
                                               :put 200 (format "ee/report/%s" report-id)
                                               {:collection_id nil})]
            (is (nil? (:collection_id response)))

            ;; Verify all associated cards moved to root
            (is (nil? (:collection_id (t2/select-one :model/Card :id card1-id))))
            (is (nil? (:collection_id (t2/select-one :model/Card :id card2-id))))

            ;; Other card should still be in old collection
            (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id other-card-id))))))))))

(deftest api-permission-edge-cases-test
  (testing "API permission validation edge cases"
    (mt/with-temp [:model/User {user-id :id} {:first_name "Test" :last_name "User" :email "test@integration.com"}
                   :model/Collection {collection1-id :id} {:name "Permission Collection 1"}
                   :model/Collection {collection2-id :id} {:name "Permission Collection 2"}
                   :model/Report {report-id :id} {:collection_id collection1-id :name "Permission Test Report"}
                   :model/ReportVersion {version-id :id} {:report_id report-id
                                                          :document "Permission test doc"
                                                          :version_identifier 1}]
      (t2/update! :model/Report report-id {:current_version_id version-id})

      ;; Create cards in the original collection
      (mt/with-temp [:model/Card {card-id :id} {:name "Permission Test Card"
                                                :type :in_report
                                                :report_document_id report-id
                                                :collection_id collection1-id
                                                :dataset_query (mt/mbql-query venues)}]

        (testing "regular user without permissions cannot move report"
          ;; Should fail with 403
          (mt/user-http-request user-id
                                :put 403 (format "ee/report/%s" report-id)
                                {:collection_id collection2-id})

          ;; Verify nothing changed
          (is (= collection1-id (:collection_id (t2/select-one :model/Report :id report-id))))
          (is (= collection1-id (:collection_id (t2/select-one :model/Card :id card-id)))))

        (testing "moving to non-existent collection fails gracefully"
          (mt/user-http-request :crowberto
                                :put 400 (format "ee/report/%s" report-id)
                                {:collection_id 99999})

          ;; Verify nothing changed
          (is (= collection1-id (:collection_id (t2/select-one :model/Report :id report-id))))
          (is (= collection1-id (:collection_id (t2/select-one :model/Card :id card-id)))))))))
