(ns metabase.notification.payload.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.notification.payload.temp-storage :as temp-storage]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private expected-top-level-keys
  "The only top-level keys that should appear in a notification result."
  #{:status :row_count :database_id :error :data :notification/truncated? :data.rows-file-size})

(def ^:private expected-data-keys
  "The only keys that should appear in the :data sub-map of a notification result."
  #{:cols :rows :viz-settings :results_metadata :insights :results_timezone
    :format-rows? :pivot-export-options})

(defn- check-result-structure
  [result]
  (is (every? expected-top-level-keys (keys result))
      "Result should only contain expected top-level keys")
  (is (not (contains? result :json_query))
      ":json_query must not leak into notification results")
  (is (every? expected-data-keys (keys (:data result)))
      ":data should only contain expected keys")
  (is (not (contains? (:data result) :native_form))
      ":native_form must not leak into notification results")
  (is (= :completed (:status result)))
  (is (pos? (:row_count result))))

(deftest execute-card-result-structure-test
  (testing "execute-card returns only the expected keys"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (let [part   (notification.payload.execute/execute-card (mt/user->id :rasta) card-id)
            result (:result part)]
        (is (= :card (:type part)))
        (check-result-structure result)))))

(deftest execute-dashboard-subscription-card-result-structure-test
  (testing "execute-dashboard-subscription-card returns only the expected keys"
    (mt/with-temp [:model/Card      {card-id :id} {:dataset_query (mt/mbql-query venues)}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {_dc-id :id
                                         :as dashcard} {:dashboard_id dash-id
                                                        :card_id      card-id}]
      (mt/with-current-user (mt/user->id :rasta)
        (let [part   (notification.payload.execute/execute-dashboard-subscription-card dashcard [])
              result (:result part)]
          (is (= :card (:type part)))
          (check-result-structure result))))))

(defn- card-parts [parts]
  (filter #(= :card (:type %)) parts))

(deftest body-only-cards-use-display-limit-test
  (testing "cards not selected for attachment get the interactive display limit; attached cards keep the attachment limit (GDGT-2773)"
    (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/mbql-query orders)}
                   :model/Dashboard     {dash-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
      (let [row-count (fn [opts]
                        (let [part (first (card-parts (notification.payload.execute/execute-dashboard
                                                       dash-id (mt/user->id :rasta) [] opts)))]
                          (temp-storage/cleanup! (-> part :result :data :rows))
                          (-> part :result :row_count)))]
        (is (= 2000 (row-count nil)))
        (is (< 2000 (row-count {:attached-card-ids #{card-id}})))))))

(deftest attached-card-series-uses-display-limit-test
  (testing "additional series are display-only even when the primary card is attached"
    (mt/with-temp [:model/Card                {card-id :id}        {:dataset_query (mt/mbql-query orders)}
                   :model/Card                {series-card-id :id} {:dataset_query (mt/mbql-query orders)}
                   :model/Dashboard           {dash-id :id}        {}
                   :model/DashboardCard       {dashcard-id :id}    {:dashboard_id dash-id :card_id card-id}
                   :model/DashboardCardSeries _                    {:dashboardcard_id dashcard-id
                                                                    :card_id          series-card-id
                                                                    :position         0}]
      (let [part          (first (card-parts (notification.payload.execute/execute-dashboard
                                              dash-id (mt/user->id :rasta) []
                                              {:attached-card-ids #{card-id}})))
            series-result (-> part :dashcard :series-results first)]
        (is (< 2000 (-> part :result :row_count)) "attached primary card keeps the attachment limit")
        (is (= 2000 (-> series-result :result :row_count)) "display-only series gets the interactive limit")
        (temp-storage/cleanup! (-> part :result :data :rows))
        (temp-storage/cleanup! (-> series-result :result :data :rows))))))
