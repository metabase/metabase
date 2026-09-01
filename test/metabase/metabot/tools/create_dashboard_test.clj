(ns metabase.metabot.tools.create-dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.create-dashboard :as create-dashboard]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]))

(defn- tile [title width height]
  {:title title :width width :height height})

(defn- positions [tiles]
  (mapv #(select-keys % [:title :row :col :size_x :size_y])
        (create-dashboard/layout-tiles tiles)))

(deftest layout-single-tile-stretches-to-full-width-test
  (is (= [{:title "a" :row 0 :col 0 :size_x 24 :size_y 6}]
         (positions [(tile "a" 12 6)]))))

(deftest layout-fills-a-row-side-by-side-test
  (is (= [{:title "a" :row 0 :col 0 :size_x 12 :size_y 6}
          {:title "b" :row 0 :col 12 :size_x 12 :size_y 6}]
         (positions [(tile "a" 12 6) (tile "b" 12 6)]))))

(deftest layout-stretch-preserves-relative-widths-test
  (is (= [{:title "a" :row 0 :col 0 :size_x 16 :size_y 6}
          {:title "b" :row 0 :col 16 :size_x 8 :size_y 6}]
         (positions [(tile "a" 12 6) (tile "b" 6 6)]))))

(deftest layout-wraps-to-a-new-row-test
  (is (= [{:title "a" :row 0 :col 0 :size_x 12 :size_y 6}
          {:title "b" :row 0 :col 12 :size_x 12 :size_y 6}
          {:title "c" :row 6 :col 0 :size_x 24 :size_y 9}]
         (positions [(tile "a" 12 6) (tile "b" 12 6) (tile "c" 24 9)]))))

(deftest layout-rows-advance-by-tallest-tile-test
  (is (= [{:title "a" :row 0 :col 0 :size_x 12 :size_y 9}
          {:title "b" :row 0 :col 12 :size_x 12 :size_y 4}
          {:title "c" :row 9 :col 0 :size_x 24 :size_y 6}]
         (positions [(tile "a" 12 9) (tile "b" 12 4) (tile "c" 12 6)]))))

(deftest layout-clamps-tiny-hints-test
  (is (= [{:title "a" :row 0 :col 0 :size_x 12 :size_y 3}
          {:title "b" :row 0 :col 12 :size_x 12 :size_y 3}]
         (positions [(tile "a" 1 1) (tile "b" 1 1)]))))

(deftest layout-preserves-order-test
  (is (= ["a" "b" "c" "d"]
         (map :title (create-dashboard/layout-tiles
                      [(tile "a" 6 3) (tile "b" 6 3) (tile "c" 6 3) (tile "d" 6 3)])))))

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
                         :tiles       [{:chart_id "c-1" :title "Venues by price" :width 12 :height 6}
                                       {:query_id "q-1" :title "All venues" :width 12 :height 9}]})
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

(deftest create-dashboard-saved-card-tile-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:name          "Saved venues"
                                     :display       :line
                                     :dataset_query (mt/mbql-query venues)}]
      (let [result (create! (chart-memory)
                            {:name  "Mixed"
                             :tiles [{:card_id (:id card) :title "Saved venues" :width 12 :height 6}
                                     {:chart_id "c-1" :title "Venues by price" :width 12 :height 6}]})
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
                           :tiles [{:card_id Integer/MAX_VALUE :title "Missing" :width 12 :height 6}]})]
      (is (nil? (:data-parts result)))
      (is (re-find #"No saved question found" (:output result))))))

(deftest create-dashboard-unknown-chart-test
  (let [result (create! (chart-memory)
                        {:name  "Broken"
                         :tiles [{:chart_id "nope" :title "Missing" :width 12 :height 6}]})]
    (is (nil? (:data-parts result)))
    (is (re-find #"No generated chart found" (:output result)))))

(deftest create-dashboard-unknown-query-test
  (let [result (create! (chart-memory)
                        {:name  "Broken"
                         :tiles [{:query_id "nope" :title "Missing" :width 12 :height 6}]})]
    (is (nil? (:data-parts result)))
    (is (re-find #"No query found" (:output result)))))

(deftest create-dashboard-ambiguous-tile-test
  (testing "a tile referencing both a chart and a query is rejected"
    (let [result (create! (chart-memory)
                          {:name  "Broken"
                           :tiles [{:chart_id "c-1" :query_id "q-1" :title "Both" :width 12 :height 6}]})]
      (is (nil? (:data-parts result)))
      (is (re-find #"exactly one" (:output result)))))
  (testing "a tile referencing neither is rejected"
    (let [result (create! (chart-memory)
                          {:name  "Broken"
                           :tiles [{:title "Neither" :width 12 :height 6}]})]
      (is (nil? (:data-parts result)))
      (is (re-find #"exactly one" (:output result))))))
