(ns metabase.notification.payload.execute-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.notification.payload.execute-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.notification.payload.temp-storage :as temp-storage]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
                                dash-id (mt/user->id :rasta) [] {:spill-budget budget}))]
        (is (= 4 (count parts)) "all four cards render")
        (is (some spilled-part? parts)
            "with a shared budget the cumulative cells across tabs cross the cap, so a later card spills to disk")
        ;; clean up any temp files we created
        (doseq [p parts] (temp-storage/cleanup! (-> p :result :data :rows)))))))

(deftest execute-dashboard-with-stored-parameter-declarations-test
  (testing "subscription cards run with the dashboard's full stored parameter declarations and save their last used values"
    (mt/test-helpers-set-global-values!
      (mt/with-temporary-setting-values [synchronous-batch-updates            true
                                         dashboards-save-last-used-parameters true]
        (let [mp        (mt/metadata-provider)
              price     (lib.metadata/field mp (mt/id :venues :price))
              query     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                            (lib/aggregate (lib/count)))
              parameter {:id                "_PRICE_"
                         :name              "Price"
                         :slug              "price"
                         :type              :number/=
                         :sectionId         "number"
                         :required          false
                         :isMultiSelect     true
                         :values_query_type :list
                         :value             [4]}]
          (mt/with-temp [:model/Card          {card-id :id} {:dataset_query query}
                         :model/Dashboard     {dash-id :id} {:parameters [(dissoc parameter :value)]}
                         :model/DashboardCard _             {:dashboard_id       dash-id
                                                             :card_id            card-id
                                                             :parameter_mappings [{:parameter_id "_PRICE_"
                                                                                   :card_id      card-id
                                                                                   :target       [:dimension (lib/->legacy-MBQL-ref (lib/ref price))]}]}]
            (let [part (first (card-parts (notification.payload.execute/execute-dashboard
                                           dash-id (mt/user->id :rasta) [parameter])))]
              (is (= (mt/rows (qp/process-query (lib/filter query (lib/= price 4))))
                     (-> part :result :data :rows)))
              (is (= [4]
                     (t2/select-one-fn :value :model/UserParameterValue
                                       :user_id      (mt/user->id :rasta)
                                       :dashboard_id dash-id
                                       :parameter_id "_PRICE_"))))))))))

(defn- statements-of-execute-dashboard!
  "The app-DB statements of [[notification.payload.execute/execute-dashboard]] for a Dashboard with `n-dashcards`
  DashboardCards and `n-series` series Cards on its first one, the query execution itself stubbed."
  [n-dashcards n-series]
  (mt/with-model-cleanup [:model/DashboardCardSeries :model/DashboardCard :model/Dashboard :model/Card]
    (let [mp         (mt/metadata-provider)
          query      (lib/query mp (lib.metadata/table mp (mt/id :venues)))
          card-ids   (mapv :id (t2/insert-returning-instances!
                                :model/Card
                                (for [i (range (+ n-dashcards n-series))]
                                  {:name          (str "execute-dashboard count card " i)
                                   :dataset_query query
                                   :display       :table
                                   :visualization_settings {}
                                   :database_id   (mt/id)
                                   :creator_id    (mt/user->id :rasta)})))
          dash-id    (:id (first (t2/insert-returning-instances! :model/Dashboard
                                                                 [{:name       "execute-dashboard count"
                                                                   :creator_id (mt/user->id :rasta)}])))
          dashcards  (t2/insert-returning-instances! :model/DashboardCard
                                                     (for [i (range n-dashcards)]
                                                       {:dashboard_id dash-id :card_id (card-ids i) :row (* 4 i) :col 0 :size_x 4 :size_y 4 :visualization_settings {}}))]
      (t2/insert! :model/DashboardCardSeries
                  (for [i (range n-series)]
                    {:dashboardcard_id (:id (first dashcards)) :card_id (card-ids (+ n-dashcards i)) :position i}))
      (mt/with-dynamic-fn-redefs [qp.dashboard/process-query-for-dashcard
                                  (constantly {:status :completed :row_count 1 :data {:rows [[1]] :cols []}})]
        (let [run! #(notification.payload.execute/execute-dashboard dash-id (mt/user->id :rasta) [])]
          (run!)
          (t2/with-call-count [call-count]
            (run!)
            (call-count)))))))

(deftest execute-dashboard-statements-do-not-grow-test
  (testing "reads of execute-dashboard do not grow with the number of dashcards"
    (is (= (statements-of-execute-dashboard! 2 0) (statements-of-execute-dashboard! 6 0))))
  (testing "reads of execute-dashboard do not grow with the number of series of a dashcard"
    (is (= (statements-of-execute-dashboard! 2 2) (statements-of-execute-dashboard! 2 6)))))
