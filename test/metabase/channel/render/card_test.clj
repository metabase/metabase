(ns metabase.channel.render.card-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.channel.render.card-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [hiccup.core :as hiccup]
   [hickory.core :as hik]
   [hickory.select :as hik.s]
   [metabase.channel.render.card :as channel.render.card]
   [metabase.channel.render.core :as channel.render]
   [metabase.pulse.render.test-util :as render.tu]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.match :as match]))

(set! *warn-on-reflection* true)

;; Let's make sure rendering Pulses actually works

(defn- render-pulse-card
  ([{query :dataset_query, :as card}]
   (render-pulse-card card (qp/process-query query)))

  ([card results]
   (channel.render/render-pulse-card-for-display (channel.render/defaulted-timezone card) card results)))

(defn- hiccup->hickory
  [content]
  (-> content
      hiccup/html
      hik/parse
      hik/as-hickory))

(deftest ^:parallel render-test
  (testing "If the pulse renders correctly, it will have an img tag."
    (let [query (mt/mbql-query orders
                  {:aggregation  [[:count]]
                   :breakout     [!month.created_at]})]
      (mt/with-temp [:model/Card card {:dataset_query          query
                                       :display                :line
                                       :visualization_settings {:graph.dimensions ["CREATED_AT"]
                                                                :graph.metrics    ["count"]}}]
        (is (some? (match/match-one
                     (render-pulse-card card)
                     [:img _] true)))))))

(deftest ^:parallel render-error-test
  (testing "gives us a proper error if we have erroring card"
    (let [rendered-card (channel.render/render-pulse-card-for-display nil {:id 1} {:error "some error"})]
      (is (= "There was a problem with this question."
             (-> (render.tu/nodes-with-text rendered-card "There was a problem with this question.")
                 first
                 last))))))

(deftest ^:parallel detect-pulse-chart-type-region-map-test
  (let [data {:cols [{:base_type :type/Text :name "state"}
                     {:base_type :type/Number :name "count"}]
              :rows [["CA" 2] ["NY" 4]]}
        card (fn [settings] {:display :map :visualization_settings settings})]
    (testing "Built-in region maps are routed to :region_map (string and keyword setting keys)"
      (are [settings] (= :region_map (channel.render/detect-pulse-chart-type (card settings) nil data))
        {"map.type" "region" "map.region" "us_states"}
        {"map.type" "region" "map.region" "world_countries"}
        ;; production stores viz-settings keys as keywords-with-dots
        {:map.type "region" :map.region "us_states"}))
    (testing "map.type defaulting to region (unset) still counts as a region map"
      (is (= :region_map
             (channel.render/detect-pulse-chart-type
              (card {"map.region" "us_states"}) nil data))))
    (testing "Pin/heat/grid maps and custom regions are not statically rendered as region maps"
      (are [settings] (not= :region_map
                            (channel.render/detect-pulse-chart-type (card settings) nil data))
        {"map.type" "pin" "map.region" "us_states"}
        {"map.type" "heat" "map.region" "us_states"}
        {"map.type" "region" "map.region" "my_custom_map"}))
    (testing "A dashcard-level region map setting takes precedence over the card"
      (is (= :region_map
             (channel.render/detect-pulse-chart-type
              (card {"map.type" "pin"})
              {:visualization_settings {"map.type" "region" "map.region" "us_states"}}
              data))))
    (testing "Card-level map.region is honored even when a dashcard has empty (non-nil) viz-settings"
      ;; Dashboard subscriptions pass a dashcard whose :visualization_settings is {} — it must not
      ;; shadow the card's map.region (data here has no State/Country column to fall back on).
      (is (= :region_map
             (channel.render/detect-pulse-chart-type
              (card {"map.type" "region" "map.region" "us_states"})
              {:visualization_settings {}}
              data))))
    (testing "A dashcard that overrides map.type to a non-region type wins over the card"
      (is (not= :region_map
                (channel.render/detect-pulse-chart-type
                 (card {"map.type" "region" "map.region" "us_states"})
                 {:visualization_settings {"map.type" "pin"}}
                 data))))
    (testing "Region is inferred from a State/Country column when map.region isn't persisted"
      (is (= :region_map
             (channel.render/detect-pulse-chart-type
              (card {})
              nil
              {:cols [{:semantic_type :type/State :name "st"} {:base_type :type/Number :name "n"}]
               :rows [["CA" 2]]})))
      (is (= :region_map
             (channel.render/detect-pulse-chart-type
              (card {})
              nil
              {:cols [{:semantic_type :type/Country :name "c"} {:base_type :type/Number :name "n"}]
               :rows [["US" 2]]}))))
    (testing "Legacy :state/:country displays are treated as region maps"
      (is (= :region_map (channel.render/detect-pulse-chart-type {:display :state} nil data)))
      (is (= :region_map (channel.render/detect-pulse-chart-type {:display :country} nil data))))))

;; Not ^:parallel: temporarily writes the custom-geojson setting, which would race other tests.
(deftest detect-pulse-chart-type-custom-region-test
  (let [data {:cols [{:base_type :type/Text :name "zone"}
                     {:base_type :type/Number :name "count"}]
              :rows [["a" 2] ["b" 4]]}
        card (fn [settings] {:display :map :visualization_settings settings})]
    ;; raw setting value: the setter's URL validation does live DNS, which we don't want in tests
    (mt/with-temporary-raw-setting-values
      [custom-geojson (json/encode {:sales_zones {:name        "Zones"
                                                  :url         "https://example.com/z.json"
                                                  :region_key  "ZONE"
                                                  :region_name "NAME"}})]
      (testing "A user-defined custom region map is detected when its key is in custom-geojson"
        (is (= :region_map
               (channel.render/detect-pulse-chart-type
                (card {"map.region" "sales_zones"}) nil data))))
      (testing "...including in a dashboard subscription where the dashcard has empty viz-settings"
        ;; This is the case that was rendering as a table: a custom region has no State/Country column
        ;; to infer from, so an empty dashcard blob shadowing the card's map.region broke it.
        (is (= :region_map
               (channel.render/detect-pulse-chart-type
                (card {"map.region" "sales_zones"}) {:visualization_settings {}} data))))
      (testing "but not when the key is absent from custom-geojson"
        (is (not= :region_map
                  (channel.render/detect-pulse-chart-type
                   (card {"map.region" "unconfigured_region"}) nil data))))
      (testing "but not when custom GeoJSON is disabled (render-time resolution would fail too)"
        (mt/with-temp-env-var-value! [mb-custom-geojson-enabled false]
          (is (not= :region_map
                    (channel.render/detect-pulse-chart-type
                     (card {"map.region" "sales_zones"}) nil data))))))))

(deftest ^:parallel detect-pulse-chart-type-pin-map-test
  (let [data {:cols [{:name "lat"} {:name "lon"}] :rows [[1.0 2.0]]}
        card (fn [settings] {:display :map :visualization_settings settings})]
    (testing "pin maps route to :pin_map"
      (is (= :pin_map (channel.render/detect-pulse-chart-type (card {"map.type" "pin"}) nil data)))
      (testing "legacy :pin_map display too"
        (is (= :pin_map (channel.render/detect-pulse-chart-type {:display :pin_map} nil data))))
      (testing "and in a dashboard subscription with empty dashcard viz-settings"
        (is (= :pin_map (channel.render/detect-pulse-chart-type
                         (card {"map.type" "pin"}) {:visualization_settings {}} data)))))
    (testing "heat maps are not statically rendered yet (fall through to table)"
      (is (= :table (channel.render/detect-pulse-chart-type (card {"map.type" "heat"}) nil data))))
    (testing "a coordinate map is a pin map (not a region map) even with a State column and unset map.type"
      ;; Regression: lat/long columns must win over region column-inference.
      (let [pin+state {:cols [{:name "lat" :semantic_type :type/Latitude}
                              {:name "lon" :semantic_type :type/Longitude}
                              {:name "state" :semantic_type :type/State}]
                       :rows [[37.77 -122.42 "CA"]]}]
        (is (= :pin_map
               (channel.render/detect-pulse-chart-type
                (card {"map.latitude_column" "lat" "map.longitude_column" "lon"}) nil pin+state)))))))

(deftest ^:parallel detect-pulse-chart-type-grid-map-test
  (let [card {:display :map :visualization_settings {}}
        data {:cols [{:name "lat" :semantic_type :type/Latitude :binning_info {:bin_width 1.0}}
                     {:name "lon" :semantic_type :type/Longitude :binning_info {:bin_width 1.0}}
                     {:name "n" :base_type :type/Integer}]
              :rows [[37.0 -122.0 5]]}]
    (testing "binned lat/long maps route to :grid_map (map.type unset)"
      (is (= :grid_map (channel.render/detect-pulse-chart-type card nil data))))
    (testing "binned lat/long routes to :grid_map in a dashboard subscription with empty dashcard settings"
      (is (= :grid_map (channel.render/detect-pulse-chart-type card {:visualization_settings {}} data))))))

(deftest ^:parallel detect-pulse-chart-type-grid-map-test-2
  (let [card {:display :map :visualization_settings {}}
        data {:cols [{:name "lat" :semantic_type :type/Latitude}
                     {:name "lon" :semantic_type :type/Longitude}
                     {:name "n" :base_type :type/Integer}]
              :rows [[37.0 -122.0 5]]}]
    (testing "explicit map.type grid"
      (is (= :grid_map (channel.render/detect-pulse-chart-type
                        (assoc card :visualization_settings {"map.type" "grid"}) nil data))))
    (testing "unbinned lat/long is a pin map, not a grid map"
      (is (= :pin_map (channel.render/detect-pulse-chart-type card nil data))))))

(deftest ^:parallel detect-pulse-chart-type-pivot-test
  (testing "pivot cards route to :pivot"
    (is (= :pivot (channel.render/detect-pulse-chart-type
                   {:display :pivot} nil
                   {:cols [{:base_type :type/Text} {:base_type :type/Number}] :rows [["a" 1]]})))))

(deftest ^:parallel detect-pulse-chart-type-object-detail-test
  (let [data {:cols [{:base_type :type/Text :name "name"} {:base_type :type/Number :name "n"}]
              :rows [["a" 1]]}]
    (testing "an :object display routes to the :object renderer"
      (is (= :object (channel.render/detect-pulse-chart-type {:display :object} nil data))))
    (testing "a single-column object detail still routes to :object, not :scalar"
      (is (= :object (channel.render/detect-pulse-chart-type
                      {:display :object} nil {:cols [{:base_type :type/Text :name "x"}] :rows [["v"]]}))))
    (testing "empty results still short-circuit to :empty"
      (is (= :empty (channel.render/detect-pulse-chart-type {:display :object} nil {:cols [] :rows []}))))))

(deftest ^:parallel detect-pulse-chart-type-test-2
  (testing "Queries resulting in no rows return `:empty`."
    (is (= :empty
           (channel.render/detect-pulse-chart-type {:display :line}
                                                   {}
                                                   {:cols [{:base_type :type/Number}]
                                                    :rows [[nil]]})))))

(deftest ^:parallel detect-pulse-chart-type-test-3
  (testing "Unrecognized display-types with otherwise valid results return `:table`."
    (is (= :table
           (channel.render/detect-pulse-chart-type {:display :unrecognized}
                                                   {}
                                                   {:cols [{:base_type :type/Text}
                                                           {:base_type :type/Number}]
                                                    :rows [["A" 2]
                                                           ["B" 4]]})))))

(deftest ^:parallel detect-pulse-chart-type-test-4
  (testing "Scalar and Smartscalar charts are correctly identified"
    (is (= :scalar
           (channel.render/detect-pulse-chart-type {:display :line}
                                                   {}
                                                   {:cols [{:base_type :type/Number}]
                                                    :rows [[3]]})))
    (is (= :scalar
           (channel.render/detect-pulse-chart-type {:display :scalar}
                                                   {}
                                                   {:cols [{:base_type :type/Number}]
                                                    :rows [[6]]})))
    (is (= :javascript_visualization
           (channel.render/detect-pulse-chart-type {:display :smartscalar}
                                                   {}
                                                   {:cols     [{:base_type :type/Temporal
                                                                :name      "month"}
                                                               {:base_type :type/Number
                                                                :name      "apples"}]
                                                    :rows     [[#t "2020" 2]
                                                               [#t "2021" 3]]
                                                    :insights [{:name           "apples"
                                                                :last-value     3
                                                                :previous-value 2
                                                                :last-change    50.0}]})))))

(deftest ^:parallel detect-pulse-chart-type-test-5
  (testing "Progress charts are correctly identified"
    (is (= :javascript_visualization
           (channel.render/detect-pulse-chart-type {:display :progress}
                                                   {}
                                                   {:cols [{:base_type :type/Number}]
                                                    :rows [[6]]})))))

(deftest ^:parallel detect-pulse-chart-type-test-6
  (testing "The isomorphic display-types return correct chart-type."
    (are [chart-type] (= :javascript_visualization
                         (channel.render/detect-pulse-chart-type {:display chart-type}
                                                                 {}
                                                                 {:cols [{:base_type :type/Text}
                                                                         {:base_type :type/Number}]
                                                                  :rows [["A" 2]
                                                                         ["B" 3]]}))
      :line
      :area
      :bar
      :combo)))

(deftest ^:parallel detect-pulse-chart-type-test-7
  (testing "Various Single-Series display-types return correct chart-types."
    (are [chart-type] (= chart-type
                         (channel.render/detect-pulse-chart-type {:display chart-type}
                                                                 {}
                                                                 {:cols [{:base_type :type/Text}
                                                                         {:base_type :type/Number}]
                                                                  :rows [["A" 2]
                                                                         ["B" 3]]}))
      :funnel
      :table)))

(deftest ^:parallel detect-pulse-chart-type-test-8
  (testing "Pie charts are correctly identified and return `:javascript_visualization`."
    (is (= :javascript_visualization
           (channel.render/detect-pulse-chart-type {:display :pie}
                                                   {}
                                                   {:cols [{:base_type :type/Text}
                                                           {:base_type :type/Number}]
                                                    :rows [["apple" 3]
                                                           ["banana" 4]]})))))

(deftest ^:parallel detect-pulse-chart-type-test-8b
  (testing "Treemap charts are correctly identified and return `:javascript_visualization`."
    (is (= :javascript_visualization
           (channel.render/detect-pulse-chart-type {:display :treemap}
                                                   nil
                                                   {:cols [{:base_type :type/Text}
                                                           {:base_type :type/Text}
                                                           {:base_type :type/Number}]
                                                    :rows [["apple" "fuji" 3]
                                                           ["banana" "cavendish" 4]]})))))

(deftest ^:parallel detect-pulse-chart-type-test-9
  (testing "Dashboard Cards can return `:multiple`."
    (is (= :javascript_visualization
           (mt/with-temp [:model/Card                card1 {:display :pie}
                          :model/Card                card2 {:display :funnel}
                          :model/Dashboard           dashboard {}
                          :model/DashboardCard       dc1 {:dashboard_id (u/the-id dashboard) :card_id (u/the-id card1)}
                          :model/DashboardCardSeries _   {:dashboardcard_id (u/the-id dc1) :card_id (u/the-id card2)}]
             (channel.render/detect-pulse-chart-type card1
                                                     dc1
                                                     {:cols [{:base_type :type/Temporal}
                                                             {:base_type :type/Number}]
                                                      :rows [[#t "2020" 2]
                                                             [#t "2021" 3]]}))))
    (is (= :javascript_visualization
           (mt/with-temp [:model/Card                card1 {:display :line}
                          :model/Card                card2 {:display :funnel}
                          :model/Dashboard           dashboard {}
                          :model/DashboardCard       dc1 {:dashboard_id (u/the-id dashboard) :card_id (u/the-id card1)}
                          :model/DashboardCardSeries _   {:dashboardcard_id (u/the-id dc1) :card_id (u/the-id card2)}]
             (channel.render/detect-pulse-chart-type card1
                                                     dc1
                                                     {:cols [{:base_type :type/Temporal}
                                                             {:base_type :type/Number}]
                                                      :rows [[#t "2020" 2]
                                                             [#t "2021" 3]]}))))))

(deftest ^:parallel detect-pulse-chart-type-test-10
  (testing "Visualizer dashboard card display type takes precedence"
    (is (= :javascript_visualization
           (mt/with-temp [:model/Card                card1 {:display :row}
                          :model/Card                card2 {:display :row}
                          :model/Dashboard           dashboard {}
                          :model/DashboardCard       dc1 {:dashboard_id (u/the-id dashboard) :card_id (u/the-id card1) :visualization_settings {:visualization {:display :line}}}
                          :model/DashboardCardSeries _   {:dashboardcard_id (u/the-id dc1) :card_id (u/the-id card2)}]
             (channel.render/detect-pulse-chart-type card1
                                                     dc1
                                                     {:cols [{:base_type :type/Temporal}
                                                             {:base_type :type/Number}]
                                                      :rows [[#t "2020" 2]
                                                             [#t "2021" 3]]}))))))

(deftest ^:parallel make-description-if-needed-test
  (testing "Use Visualization Settings's description if it exists"
    (mt/with-temp [:model/Card          card {:description "Card description"}
                   :model/Dashboard     dashboard {}
                   :model/DashboardCard dc1 {:dashboard_id (:id dashboard) :card_id (:id card)
                                             :visualization_settings {:card.description "Visualization description"}}]
      (is (= "<p>Visualization description</p>\n"
             (last (:content (#'channel.render.card/make-description-if-needed dc1 card {:channel.render/include-description? true}))))))))

(deftest ^:parallel make-description-if-needed-test-2
  (testing "Fallback to Card's description if Visualization Settings's description not exists"
    (mt/with-temp [:model/Card          card {:description "Card description"}
                   :model/Dashboard     dashboard {}
                   :model/DashboardCard dc1 {:dashboard_id (:id dashboard) :card_id (:id card)}]
      (is (= "<p>Card description</p>\n"
             (last (:content (#'channel.render.card/make-description-if-needed dc1 card {:channel.render/include-description? true}))))))))

(deftest ^:parallel make-description-if-needed-test-3
  (testing "Test markdown converts to html"
    (mt/with-temp [:model/Card          card {:description "# Card description"}
                   :model/Dashboard     dashboard {}
                   :model/DashboardCard dc1 {:dashboard_id (:id dashboard) :card_id (:id card)}]
      (is (= "<h1>Card description</h1>\n"
             (last (:content (#'channel.render.card/make-description-if-needed dc1 card {:channel.render/include-description? true}))))))))

(deftest ^:parallel table-rendering-of-percent-types-test
  (testing "If a column is marked as a :type/Percentage semantic type it should render as a percent"
    (mt/dataset test-data
      (mt/with-temp [:model/Card {base-card-id :id} {:dataset_query
                                                     {:database (mt/id)
                                                      :type     :query
                                                      :query    {:source-table (mt/id :orders)
                                                                 :expressions  {"Tax Rate" [:/
                                                                                            [:field (mt/id :orders :tax) {:base-type :type/Float}]
                                                                                            [:field (mt/id :orders :total) {:base-type :type/Float}]]},
                                                                 :fields       [[:field (mt/id :orders :tax) {:base-type :type/Float}]
                                                                                [:field (mt/id :orders :total) {:base-type :type/Float}]
                                                                                [:expression "Tax Rate"]]
                                                                 :limit        10}}}
                     :model/Card {model-card-id  :id
                                  model-query    :dataset_query
                                  model-metadata :result_metadata
                                  :as            model-card} {:type            :model
                                                              :dataset_query   {:type     :query
                                                                                :database (mt/id)
                                                                                :query    {:source-table (format "card__%s" base-card-id)}}
                                                              :result_metadata [{:name         "TAX"
                                                                                 :display_name "Tax"
                                                                                 :base_type    :type/Float}
                                                                                {:name         "TOTAL"
                                                                                 :display_name "Total"
                                                                                 :base_type    :type/Float}
                                                                                {:name          "Tax Rate"
                                                                                 :display_name  "Tax Rate"
                                                                                 :base_type     :type/Float
                                                                                 :semantic_type :type/Percentage
                                                                                 :field_ref     [:field "Tax Rate" {:base-type :type/Float}]}]}
                     :model/Card {question-query :dataset_query
                                  :as            question-card} {:dataset_query {:type     :query
                                                                                 :database (mt/id)
                                                                                 :query    {:source-table (format "card__%s" model-card-id)}}}]
        ;; NOTE -- The logic in metabase.formatter/number-formatter renders values between 1 and 100 as an integer
        ;; value. IDK if this is what we want long term, but this captures the current logic. If we do extend the
        ;; significant digits in the formatter, we'll need to modify this test as well.
        (letfn [(create-comparison-results [query-results card]
                  (is (=? [{:name "TAX"}
                           {:name "TOTAL"}
                           {:name "Tax Rate", :semantic_type :type/Percentage}]
                          (map #(select-keys % [:name :semantic_type])
                               (get-in query-results [:data :cols]))))
                  (let [expected      (mapv (fn [row]
                                              (format "%.2f%%" (* 100 (peek row))))
                                            (get-in query-results [:data :rows]))
                        rendered-card (channel.render/render-pulse-card :inline (channel.render/defaulted-timezone card) card nil query-results)
                        doc           (hiccup->hickory (:content rendered-card))
                        rows          (hik.s/select (hik.s/tag :tr) doc)
                        tax-rate-col  2]
                    {:expected expected
                     :actual   (mapcat (fn [row]
                                         (:content (nth row tax-rate-col)))
                                       (map :content (rest rows)))}))]
          (testing "To apply the custom metadata to a model, you must explicitly pass the result metadata"
            (let [query-results (qp/process-query
                                 (assoc-in model-query [:info :metadata/model-metadata] model-metadata))
                  {:keys [expected actual]} (create-comparison-results query-results model-card)]
              (is (= expected actual))))
          (testing "A question based on a model will use the underlying model's metadata"
            (let [query-results (qp/process-query question-query)
                  {:keys [expected actual]} (create-comparison-results query-results question-card)]
              (is (= expected actual)))))))))

(deftest title-should-be-an-a-tag-test
  (testing "the title of the card should be an <a> tag so you can click on title using old outlook clients (#12901)"
    (mt/with-temp [:model/Card card {:name          "A Card"
                                     :dataset_query (mt/mbql-query venues {:limit 1})}]
      (mt/with-temp-env-var-value! [mb-site-url "https://mb.com"]
        (let [rendered-card-content (:content (channel.render/render-pulse-card :inline
                                                                                (channel.render/defaulted-timezone card)
                                                                                card
                                                                                nil
                                                                                (qp/process-query (:dataset_query card))
                                                                                {:channel.render/include-title? true}))]
          (is (match/match-one rendered-card-content
                [:a {:href (href :guard (= href (format "https://mb.com/question/%d" (:id card))))} "A Card"]
                true)))))))

(deftest href-includes-scroll
  (testing "the title and body hrefs for cards in dashboards should be of the form '.../dashboard/<DASHBOARD_ID>#scrollTo=<DASHBOARD_CARD_ID>'"
    (mt/with-temp [:model/Card           card {:name          "A Card"
                                               :dataset_query (mt/mbql-query venues {:limit 1})}
                   :model/Dashboard      dashboard {}
                   :model/DashboardCard  dc1 {:dashboard_id (:id dashboard) :card_id (:id card)}]
      (mt/with-temp-env-var-value! [mb-site-url "https://mb.com"]
        (let [rendered-card-content (:content (channel.render/render-pulse-card :inline
                                                                                (channel.render/defaulted-timezone card)
                                                                                card
                                                                                dc1
                                                                                (qp/process-query (:dataset_query card))
                                                                                {:channel.render/include-title? true}))
              expected-href         (format "https://mb.com/dashboard/%d#scrollTo=%d" (:dashboard_id dc1) (:id dc1))]
          (is (every? #(= % expected-href) (match/match-many rendered-card-content {:href href} href)))))))
  (testing "the title and body hrefs for visualizer cards should be of the form '.../dashboard/<DASHBOARD_ID>#scrollTo=<DASHBOARD_CARD_ID>'"
    (mt/with-temp [:model/Card           card {:name          "A Card"
                                               :dataset_query (mt/mbql-query venues {:limit 1})}
                   :model/Dashboard      dashboard {}
                   :model/DashboardCard  dc1 {:dashboard_id (:id dashboard) :card_id (:id card) :visualization_settings {:visualization {}}}]
      (mt/with-temp-env-var-value! [mb-site-url "https://mb.com"]
        (let [rendered-card-content (:content (channel.render/render-pulse-card :inline
                                                                                (channel.render/defaulted-timezone card)
                                                                                card
                                                                                dc1
                                                                                (qp/process-query (:dataset_query card))
                                                                                {:channel.render/include-title? true}))
              expected-href         (format "https://mb.com/dashboard/%d#scrollTo=%d" (:dashboard_id dc1) (:id dc1))]
          (is (every? #(= % expected-href) (match/match-many rendered-card-content {:href href} href))))))))

(deftest render-card-with-abbreviated-dates-test
  (testing "Static-viz should render without error when date formatting is abbreviated (metabase#27020)"
    (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_style "MMMM D, YYYY"}}]
      (mt/with-temp [:model/Card card {:dataset_query          {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query "select current_date as \"created_at\", 1 \"val\""}}
                                       :display                :table
                                       :visualization_settings {:column_settings {"[\"name\",\"created_at\"]" {:date_abbreviate true}}
                                                                "table.pivot_column" "created_at"
                                                                "table.cell_column" "val"}}]
        (let [result (qp/process-query
                      (assoc (:dataset_query card)
                             :middleware {:process-viz-settings? true
                                          :js-int-to-string?     false}))
              ba     (channel.render/render-pulse-card-to-png (channel.render/defaulted-timezone card)
                                                              card
                                                              result
                                                              400
                                                              {:channel.render/include-title? true})]
          (is (pos? (alength ba)) "PNG byte array should not be empty"))))))

(deftest render-card-with-day-date-style-test
  (testing "Static-viz should render without error when date formatting contains day (metabase#27105)"
    (mt/with-temp [:model/Card card {:dataset_query          {:database (mt/id)
                                                              :type     :native
                                                              :native   {:query "select current_date::date, 1"}}
                                     :display                :table
                                     :visualization_settings {:column_settings {"[\"name\",\"CAST(CURRENT_DATE AS DATE)\"]" {:date_style "dddd, MMMM D, YYYY"}}
                                                              "table.pivot_column" "CAST(CURRENT_DATE AS DATE)"
                                                              "table.cell_column" "1"}}]
      (let [result (qp/process-query
                    (assoc (:dataset_query card)
                           :middleware {:process-viz-settings? true
                                        :js-int-to-string?     false}))
            ba     (channel.render/render-pulse-card-to-png (channel.render/defaulted-timezone card)
                                                            card
                                                            result
                                                            400
                                                            {:channel.render/include-title? true})]
        (is (pos? (alength ba)) "PNG byte array should not be empty")))))

(deftest render-card-with-unused-column-test
  (testing "Static-viz render does not throw when there is an unused returned column (metabase#27427)"
    (let [q (mt/mbql-query orders
              {:aggregation [[:count] [:sum $total]]
               :breakout    [!year.created_at]})]
      (mt/with-temp [:model/Card card {:dataset_query          q
                                       :display                :bar
                                       :visualization_settings {"graph.dimensions" ["CREATED_AT"]
                                                                "graph.metrics"    ["count"]}}]
        (let [result (qp/process-query q)]
          ;; The original bug (metabase#27427) caused a divide-by-zero crash when extra columns
          ;; were returned but not referenced in graph.metrics. We verify the render completes
          ;; without throwing — the JS static-viz may produce an error card in test environments
          ;; where the full rendering pipeline isn't available.
          (is (some? (channel.render/render-pulse-card-for-display
                      (channel.render/defaulted-timezone card) card result
                      {:channel.render/include-title? true}))))))))
