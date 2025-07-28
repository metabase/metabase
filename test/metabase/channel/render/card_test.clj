(ns metabase.channel.render.card-test
  (:require
   [clojure.test :refer :all]
   [hiccup.core :as hiccup]
   [hickory.core :as hik]
   [hickory.select :as hik.s]
   [metabase.channel.render.card :as channel.render.card]
   [metabase.channel.render.core :as channel.render]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.pulse.render.test-util :as render.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]))

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
        (is (some? (lib.util.match/match-one
                     (render-pulse-card card)
                     [:img _])))))))

(deftest ^:parallel render-error-test
  (testing "gives us a proper error if we have erroring card"
    (let [rendered-card (channel.render/render-pulse-card-for-display nil {:id 1} {:error "some error"})]
      (is (= "There was a problem with this question."
             (-> (render.tu/nodes-with-text rendered-card "There was a problem with this question.")
                 first
                 last))))))

(deftest ^:parallel detect-pulse-chart-type-test
  (testing "Currently unsupported chart types for static-viz return `nil`."
    (are [tyype] (nil? (channel.render/detect-pulse-chart-type {:display tyype}
                                                               {}
                                                               {:cols [{:base_type :type/Number}]
                                                                :rows [[2]]}))
      :pin_map
      :state
      :country)))

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
    (is (= :progress
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
      :row
      :funnel
      :progress
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
          (is (some? (lib.util.match/match-one rendered-card-content
                       [:a (_ :guard #(= (format "https://mb.com/question/%d" (:id card)) (:href %))) "A Card"]))))))))

(deftest visualizer-href-includes-scroll
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
          (is (every? true? (map #(= (:href %) expected-href) (lib.util.match/match rendered-card-content  {:href _})))))))))
