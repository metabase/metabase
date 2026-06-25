(ns metabase.notification.payload.execute-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.notification.payload.execute-test]}}}}}}
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

(defn- spilled-part? [part]
  (temp-storage/streaming-temp-file? (-> part :result :data :rows)))

(deftest tabbed-dashboard-shares-one-spill-budget-test
  (testing "the resident-memory budget is shared across a multi-tab dashboard, so cards in different tabs collectively
            count toward the spill cap (otherwise many small cards across tabs could exhaust memory)"
    ;; Each card selects exactly 3 fields with a :limit of 100 -> exactly 300 cells per card (deterministic, not
    ;; dependent on the seeded table's shape). Two cards per tab = 600 cells, under the 1000-cell cap WITHIN a tab,
    ;; so nothing would spill if each tab had its own budget. Across both tabs the shared running total reaches 1200,
    ;; crossing the cap, so a SHARED budget forces the later cards to spill.
    (mt/with-temp [:model/Card        {card-id :id} {:dataset_query (mt/mbql-query venues
                                                                      {:fields [$id $name $price]
                                                                       :limit  100})}
                   :model/Dashboard   {dash-id :id} {}
                   :model/DashboardTab {tab1 :id}   {:dashboard_id dash-id :name "Tab 1" :position 0}
                   :model/DashboardTab {tab2 :id}   {:dashboard_id dash-id :name "Tab 2" :position 1}
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id tab1 :card_id card-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id tab1 :card_id card-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id tab2 :card_id card-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id tab2 :card_id card-id}]
      (let [budget (temp-storage/make-resident-budget {:per-card 100000 :resident-cap 1000 :floor 100})
            parts  (card-parts (notification.payload.execute/execute-dashboard
                                dash-id (mt/user->id :rasta) [] budget))]
        (is (= 4 (count parts)) "all four cards render")
        (is (some spilled-part? parts)
            "with a shared budget the cumulative cells across tabs cross the cap, so a later card spills to disk")
        ;; clean up any temp files we created
        (doseq [p parts] (temp-storage/cleanup! (-> p :result :data :rows)))))))
