(ns metabase.metabot.tools.charts.edit-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.tools.charts :as tools.charts]
   [metabase.metabot.tools.charts.edit :as edit-chart]
   [metabase.metabot.tools.construct :as tools.construct]
   [metabase.metabot.tools.resources :as tools.resources]
   [metabase.metabot.tools.shared :as tools.shared]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]))

(deftest edit-chart-test
  (testing "edits a chart's visualization type"
    (let [mp (mt/metadata-provider)
          charts-state {"chart-abc" {:chart-id "chart-abc"
                                     :queries [(lib/native-query mp "SELECT * FROM orders")]
                                     :chart-type :bar}}
          {:keys [result]} (edit-chart/edit-chart
                            {:chart-id "chart-abc"
                             :new-chart-type :line
                             :charts-state charts-state})]
      (is (contains? result :chart-id))
      (is (string? (:chart-id result)))
      ;; New chart should have a different ID
      (is (not= "chart-abc" (:chart-id result)))
      (is (= :line (:chart-type result)))
      (is (str/includes? (:chart-content result) "<chart"))
      (is (str/includes? (:chart-content result) "line"))
      (is (str/starts-with? (:chart-link result) "metabase://chart/"))
      (is (contains? result :instructions))))

  (testing "edits chart to various types"
    (let [mp (mt/metadata-provider)
          charts-state {"chart-456" {:chart-id "chart-456"
                                     :queries [(lib/native-query mp "SELECT * FROM orders")]}}]
      (doseq [new-type [:pie :table :scatter :area :sunburst]]
        (let [{:keys [result]} (edit-chart/edit-chart
                                {:chart-id "chart-456"
                                 :new-chart-type new-type
                                 :charts-state charts-state})]
          (is (= new-type (:chart-type result))
              (str "New chart type " new-type " should be set correctly"))))))

  (testing "throws error for invalid chart type"
    (let [charts-state {"chart-789" {:chart-id "chart-789"}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid chart type"
           (edit-chart/edit-chart
            {:chart-id "chart-789"
             :new-chart-type :invalid-type
             :charts-state charts-state})))))

  (testing "throws error when chart not found"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"issues accessing the chart data"
         (edit-chart/edit-chart
          {:chart-id "nonexistent"
           :new-chart-type :bar
           :charts-state {}})))))

(deftest edit-chart-of-constructed-query-test
  (mt/with-current-user (test.users/user->id :crowberto)
    (let [table-fields-uri (str "metabase://table/" (mt/id :products) "/fields")

          {[{{table :structured-output} :content}] :resources}
          (tools.resources/read-resource-tool {:uris [table-fields-uri]})

          ;; (1) construct a query
          construct-result (tools.construct/construct-notebook-query-tool
                            {:query
                             {:query_type "aggregate"
                              :source {:table_id (:id table)}
                              :aggregations [{:function "count"}]
                              :filters []
                              :group_by [{:field_id (some (fn [{:keys [display_name field_id]}]
                                                            (when (= "Category" display_name)
                                                              field_id))
                                                          (:fields table))}]
                              :limit nil
                              :visualization {:chart_type "bar"}}})
          query-id (get-in construct-result [:structured-output :query-id])
          query (get-in construct-result [:structured-output :query])
          chart-id (get-in construct-result [:structured-output :chart-id])]
      (binding [tools.shared/*memory-atom* (atom nil)]
        ;; (2) fetch the construction result into memory _as done in agent/loop-step_
        (swap! tools.shared/*memory-atom* #'agent/update-memory [{:type :tool-output
                                                                  :result construct-result}])
        (is (contains? (tools.shared/current-charts-state) chart-id))
        (is (contains? (tools.shared/current-queries-state) query-id))
        (testing "Edit chart can handle charts created using construct-notebook-query-tool"
          ;; (3) call the edit-chart-tool which uses the shared memory
          (let [edit-result (tools.charts/edit-chart-tool {:chart_id chart-id
                                                           :new_viz_settings {:chart_type "pie"}})
                new-chart-id (get-in edit-result [:structured-output :chart-id])
                new-chart-in-memory (get (tools.shared/current-charts-state) new-chart-id)]
            (is (= :pie
                   (get-in new-chart-in-memory [:visualization_settings :chart_type])))
            (is (= query
                   (get-in new-chart-in-memory [:queries 0])))))))))
