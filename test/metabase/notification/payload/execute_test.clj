(ns metabase.notification.payload.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private expected-result-keys
  "The only top-level keys that should appear in a notification result."
  #{:status :row_count :database_id :error :data :notification/truncated? :data.rows-file-size})

(def ^:private expected-data-keys
  "The only keys that should appear in the :data sub-map of a notification result."
  #{:cols :rows :viz-settings :results_metadata :insights})

(deftest execute-card-result-structure-test
  (testing "execute-card returns only the expected keys in :result (no :json_query or other QP internals)"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (let [part   (notification.payload.execute/execute-card (mt/user->id :rasta) card-id)
            result (:result part)]
        (is (= :card (:type part)))
        (is (= expected-result-keys (set (keys result)))
            "Result should only contain notification-safe keys")
        (is (= expected-data-keys (set (keys (:data result))))
            ":data should only contain notification-safe sub-keys")
        (is (not (contains? result :json_query))
            ":json_query must not leak into notification results")
        (is (= :completed (:status result)))
        (is (pos? (:row_count result)))))))

(deftest execute-dashboard-subscription-card-result-structure-test
  (testing "execute-dashboard-subscription-card returns only the expected keys in :result"
    (mt/with-temp [:model/Card      {card-id :id} {:dataset_query (mt/mbql-query venues)}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {_dc-id :id
                                         :as dashcard} {:dashboard_id dash-id
                                                        :card_id      card-id}]
      (mt/with-current-user (mt/user->id :rasta)
        (let [part   (notification.payload.execute/execute-dashboard-subscription-card dashcard [])
              result (:result part)]
          (is (= :card (:type part)))
          (is (= expected-result-keys (set (keys result)))
              "Result should only contain notification-safe keys")
          (is (= expected-data-keys (set (keys (:data result))))
              ":data should only contain notification-safe sub-keys")
          (is (not (contains? result :json_query))
              ":json_query must not leak into notification results")
          (is (= :completed (:status result)))
          (is (pos? (:row_count result))))))))
