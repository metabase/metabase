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

(deftest snapshot-endpoint-basic-test
  (testing "POST /api/ee/report/snapshot creates a new card and takes a snapshot"
    (mt/with-temp [:model/Collection collection {}]
      (let [query {:database (mt/id)
                   :type :query
                   :query {:source-table (mt/id :venues)
                           :limit 5}}
            response (mt/user-http-request :crowberto :post 200
                                           "ee/report/snapshot"
                                           {:name "Test Snapshot Card"
                                            :display "table"
                                            :dataset_query query
                                            :visualization_settings {}
                                            :collection_id (:id collection)})]
        (is (contains? response :snapshot_id))
        (is (contains? response :card_id))
        (is (pos-int? (:snapshot_id response)))
        (is (pos-int? (:card_id response)))

        ;; Verify card was created
        (let [card (t2/select-one :model/Card :id (:card_id response))]
          (is (some? card))
          (is (= :in_report (:type card)))
          (is (= "Test Snapshot Card" (:name card)))
          (is (= (:id collection) (:collection_id card))))

        ;; Verify snapshot data was created
        (let [snapshot (t2/select-one :model/ReportRunCardData :id (:snapshot_id response))]
          (is (some? snapshot))
          (is (= (:card_id response) (:card_id snapshot)))
          (is (= (mt/user->id :crowberto) (:user_id snapshot)))
          (is (some? (:data snapshot))))))))

(deftest snapshot-endpoint-existing-card-test
  (testing "POST /api/ee/report/snapshot with existing card-id"
    (mt/with-temp [:model/Card card {:name "Existing Card"
                                     :dataset_query {:database (mt/id)
                                                     :type :query
                                                     :query {:source-table (mt/id :venues)
                                                             :limit 5}}
                                     :display "table"
                                     :visualization_settings {}}]
      (let [response (mt/user-http-request :crowberto :post 200
                                           "ee/report/snapshot"
                                           {:card_id (:id card)})]
        (is (contains? response :snapshot_id))
        (is (= (:id card) (:card_id response)))))))

(deftest snapshot-endpoint-validation-test
  (testing "POST /api/ee/report/snapshot validates input schema"
    (testing "missing required fields"
      (mt/user-http-request :crowberto :post 400
                            "ee/report/snapshot"
                            {:name "Missing fields"}))

    (testing "invalid field types"
      (mt/user-http-request :crowberto :post 400
                            "ee/report/snapshot"
                            {:name ""
                             :display "table"
                             :dataset_query {}
                             :visualization_settings {}}))))

(deftest get-snapshot-endpoint-test
  (testing "GET /api/ee/report/snapshot/:snapshot-id"
    (mt/with-temp [:model/Card card {:name "Test Card"
                                     :dataset_query (mt/mbql-query venues)
                                     :display "table"
                                     :visualization_settings {}}
                   :model/Report report {:name "Test Report"}
                   :model/ReportVersion _ {:report_id (:id report)}]
      (mt/with-model-cleanup [:model/ReportRunCardData]
        (let [snapshot-response (mt/user-http-request :crowberto :post 200
                                                      "ee/report/snapshot"
                                                      {:card_id (:id card)})
              snapshot-id (:snapshot_id snapshot-response)]

          ;; Update the report_id in the snapshot
          (t2/update! :model/ReportRunCardData :id snapshot-id {:report_id (:id report)})

          (testing "successfully retrieves snapshot data"
            (let [response (mt/user-http-request :crowberto :get 202
                                                 (format "ee/report/snapshot/%d" snapshot-id))]
              (is (map? response))
              (is (= 100 (-> response :data :rows count)))))

          (testing "returns 404 for non-existent snapshot"
            (mt/user-http-request :crowberto :get 404
                                  (format "ee/report/snapshot/%d" Integer/MAX_VALUE))))))))

(deftest snapshot-data-serialization-test
  (testing "Snapshot data is correctly serialized and deserialized"
    (mt/with-temp [:model/Collection collection {}]
      (let [query {:database (mt/id)
                   :type :query
                   :query {:source-table (mt/id :venues)
                           :limit 3
                           :order-by [[:asc [:field (mt/id :venues :id) nil]]]}}
            response (mt/user-http-request :crowberto :post 200
                                           "ee/report/snapshot"
                                           {:name "Serialization Test"
                                            :display "table"
                                            :dataset_query query
                                            :visualization_settings {}
                                            :collection_id (:id collection)})]

        (let [snapshot (t2/select-one :model/ReportRunCardData :id (:snapshot_id response))
              deserialized (deserialize-results (:data snapshot))]
          (is (seq deserialized))
          ;; First item should be metadata
          (let [metadata-item (first deserialized)]
            (is (contains? metadata-item :metadata))
            (let [metadata (:metadata metadata-item)]
              (is (contains? metadata :cache-version))
              (is (contains? metadata :last-ran))
              (is (= 3 (:cache-version metadata)))))

          ;; The first three are rows and the last is the final result
          (let [rows (rest deserialized)]
            (is (= 4 (count rows)))
            (is (every? vector? (take 3 rows)))))))))
