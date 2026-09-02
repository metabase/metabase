(ns metabase.metabot.tools.create-dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.create-dashboard :as create-dashboard]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]))

(defn- venues-query []
  (lib/query (mt/metadata-provider)
             (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(defn- chart-memory []
  (let [query (venues-query)]
    (atom {:state   {:queries {"q-1" query}
                     :charts  {"c-1" {:chart_id "c-1"
                                      :query_id "q-1"
                                      :queries  [query]
                                      :visualization_settings {:chart_type :bar}}}}
           :context {}})))

(defn- create! [memory args]
  (binding [shared/*memory-atom* memory]
    (create-dashboard/create-dashboard-tool args)))

(deftest create-dashboard-test
  (let [memory (chart-memory)
        result (create! memory
                        {:name        "Ops overview"
                         :description "Key ops charts."
                         :tiles       [{:chart_id "c-1" :title "Venues by price"}
                                       {:query_id "q-1" :title "All venues"}]})
        dashboard-id (get-in result [:structured-output :dashboard_id])]
    (testing "returns the generated dashboard as structured output"
      (is (string? dashboard-id))
      (is (= :dashboard (get-in result [:structured-output :result-type])))
      (is (= "Ops overview" (get-in result [:structured-output :name]))))
    (testing "stores the dashboard definition with computed grid positions in agent memory"
      (is (= {:dashboard_id dashboard-id
              :name         "Ops overview"
              :description  "Key ops charts."
              :tiles        [{:title "Venues by price" :row 0 :col 0 :size_x 12 :size_y 6 :chart_id "c-1"}
                             {:title "All venues" :row 0 :col 12 :size_x 12 :size_y 9 :query_id "q-1"}]}
             (get-in @memory [:state :dashboards dashboard-id])))
      (is (= (get-in @memory [:state :dashboards])
             (get-in @memory [:turn-state :dashboards]))))
    (testing "emits a generated_entity dashboard part embedding the full definition, not a url"
      (let [part (first (:data-parts result))
            data (:data part)]
        (is (= "generated_entity" (:data-type part)))
        (is (= {:type        "dashboard"
                :id          dashboard-id
                :title       "Ops overview"
                :description "Key ops charts."}
               (dissoc data :tiles)))
        (is (= [{:title "Venues by price" :display "bar" :row 0 :col 0 :size_x 12 :size_y 6 :chart_id "c-1"}
                {:title "All venues" :display "table" :row 0 :col 12 :size_x 12 :size_y 9}]
               (map #(dissoc % :query) (:tiles data))))
        (is (every? #(map? (:query %)) (:tiles data)))))
    (testing "tells the model the dashboard is not saved yet"
      (is (re-find #"not saved anywhere yet" (:output result))))))

(deftest create-dashboard-sizing-test
  (let [memory (chart-memory)
        state-tiles (fn [args]
                      (mapv #(select-keys % [:title :row :col :size_x :size_y])
                            (get-in (create! memory args) [:structured-output :tiles])))]
    (testing "tiles take their display type's default size and are autoplaced in order"
      (is (= [{:title "Bar" :row 0 :col 0 :size_x 12 :size_y 6}
              {:title "Table" :row 0 :col 12 :size_x 12 :size_y 9}]
             (state-tiles {:name  "Defaults"
                           :tiles [{:chart_id "c-1" :title "Bar"}
                                   {:query_id "q-1" :title "Table"}]}))))
    (testing "a coarse size hint overrides the default and later tiles flow around it"
      (is (= [{:title "Bar" :row 0 :col 0 :size_x 24 :size_y 9}
              {:title "Table" :row 9 :col 0 :size_x 12 :size_y 9}]
             (state-tiles {:name  "Hinted"
                           :tiles [{:chart_id "c-1" :title "Bar" :size "full"}
                                   {:query_id "q-1" :title "Table"}]}))))))

(deftest create-dashboard-saved-card-tile-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:name          "Saved venues"
                                     :display       :line
                                     :dataset_query (mt/mbql-query venues)}]
      (let [result (create! (chart-memory)
                            {:name  "Mixed"
                             :tiles [{:card_id (:id card) :title "Saved venues"}
                                     {:chart_id "c-1" :title "Venues by price"}]})
            dashboard-id (get-in result [:structured-output :dashboard_id])
            tiles        (get-in result [:data-parts 0 :data :tiles])]
        (testing "an existing saved question can be a tile, stored by its card id"
          (is (= {:title "Saved venues" :row 0 :col 0 :size_x 12 :size_y 6 :card_id (:id card)}
                 (first (get-in result [:structured-output :tiles])))))
        (testing "the entity tile embeds the card's query and display so it renders ad hoc"
          (is (= {:title "Saved venues" :display "line" :card_id (:id card)
                  :row 0 :col 0 :size_x 12 :size_y 6}
                 (dissoc (first tiles) :query)))
          (is (map? (:query (first tiles)))))
        (is (string? dashboard-id))))))

(deftest create-dashboard-unknown-card-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [result (create! (chart-memory)
                          {:name  "Broken"
                           :tiles [{:card_id Integer/MAX_VALUE :title "Missing"}]})]
      (is (nil? (:data-parts result)))
      (is (re-find #"No saved question found" (:output result))))))

(deftest create-dashboard-unknown-chart-test
  (let [result (create! (chart-memory)
                        {:name  "Broken"
                         :tiles [{:chart_id "nope" :title "Missing"}]})]
    (is (nil? (:data-parts result)))
    (is (re-find #"No generated chart found" (:output result)))))

(deftest create-dashboard-unknown-query-test
  (let [result (create! (chart-memory)
                        {:name  "Broken"
                         :tiles [{:query_id "nope" :title "Missing"}]})]
    (is (nil? (:data-parts result)))
    (is (re-find #"No query found" (:output result)))))

(deftest create-dashboard-ambiguous-tile-test
  (testing "a tile referencing both a chart and a query is rejected"
    (let [result (create! (chart-memory)
                          {:name  "Broken"
                           :tiles [{:chart_id "c-1" :query_id "q-1" :title "Both"}]})]
      (is (nil? (:data-parts result)))
      (is (re-find #"exactly one" (:output result)))))
  (testing "a tile referencing neither is rejected"
    (let [result (create! (chart-memory)
                          {:name  "Broken"
                           :tiles [{:title "Neither"}]})]
      (is (nil? (:data-parts result)))
      (is (re-find #"exactly one" (:output result))))))
