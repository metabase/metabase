(ns metabase.channel.render.util-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.render.util :as render-util]))

(deftest ^:parallel dashcard-title-test
  (testing "dashcard-title resolves a dashboard-level title override over the card name (UXW-4705)"
    (let [card {:name "Card Name"}]
      (testing "a regular dashcard title override wins over the card name"
        (is (= "Dashboard Title"
               (render-util/dashcard-title card {:visualization_settings {:card.title "Dashboard Title"}}))))
      (testing "a visualizer dashcard's nested title override is respected"
        (is (= "Visualizer Title"
               (render-util/dashcard-title card {:visualization_settings {:visualization {:settings {:card.title "Visualizer Title"}}}}))))
      (testing "the visualizer override takes precedence over a top-level one"
        (is (= "Visualizer Title"
               (render-util/dashcard-title card {:visualization_settings {:card.title    "Dashboard Title"
                                                                          :visualization {:settings {:card.title "Visualizer Title"}}}}))))
      (testing "a blank override is ignored (falls through)"
        (is (= "Dashboard Title"
               (render-util/dashcard-title card {:visualization_settings {:card.title    "Dashboard Title"
                                                                          :visualization {:settings {:card.title ""}}}})))
        (is (= "Card Name"
               (render-util/dashcard-title card {:visualization_settings {:card.title ""}}))))
      (testing "with no override, falls back to the card's own name"
        (is (= "Card Name" (render-util/dashcard-title card {:visualization_settings {}})))
        (is (= "Card Name" (render-util/dashcard-title card {})))))))

;; Test data and expected results for scalar funnel visualization
(def scalar-funnel-definition
  {:display "funnel"
   :settings {:funnel.metric "METRIC"
              :funnel.dimension "DIMENSION"}})

(def scalar-funnel-series-data
  [{:data {:cols [{:base_type :type/Integer}]}}])

(def expected-scalar-funnel-columns
  [{:name "METRIC"
    :display_name "METRIC"
    :base_type :type/Integer
    :semantic_type :type/Quantity}
   {:name "DIMENSION"
    :display_name "DIMENSION"
    :base_type :type/Text
    :semantic_type :type/Category}])

;; Test data and expected results for standard column mappings
(def standard-mapping-definition
  {:columnValuesMapping
   {:COLUMN_1
    [{:sourceId "card:123"
      :originalName "count"
      :name "COLUMN_1"}]}})

(def standard-mapping-series-data
  ;; :id is a real numeric id (what sourceId actually encodes); :entity_id is deliberately a different,
  ;; unrelated value so a lookup that's accidentally matching on :entity_id can't pass by coincidence (metabase#76922)
  [{:card {:id 123 :entity_id "not-the-id-lksdjfa" :name "Test Card"}
    :data {:cols [{:name "count"
                   :display_name "Count"
                   :base_type :type/Integer
                   :semantic_type :type/Quantity}]
           :rows [[42]]}}])

(def expected-standard-mapping-columns
  [{:name "COLUMN_1"
    :display_name "Test Card: Count"
    :base_type :type/Integer
    :semantic_type :type/Quantity}])

;; Test data and expected results for string mappings
(def string-mapping-definition
  {:columnValuesMapping
   {:COLUMN_1
    ["$_card:123_name" ; This should be ignored in get-visualization-columns
     {:sourceId "card:456"
      :originalName "sum"
      :name "COLUMN_1"}]}})

(def string-mapping-series-data
  [{:card {:id 456 :entity_id "not-the-id-qwoeiru" :name "Another Test Card"}
    :data {:cols [{:name "sum"
                   :display_name "Sum"
                   :base_type :type/Float
                   :semantic_type :type/Quantity}]
           :rows [[123.45]]}}])

(def expected-string-mapping-columns
  [{:name "COLUMN_1"
    :display_name "Another Test Card: Sum"
    :base_type :type/Float
    :semantic_type :type/Quantity}])

;; Test data for missing column case
(def missing-column-definition
  {:columnValuesMapping
   {:COLUMN_1
    [{:sourceId "card:789"
      :originalName "nonexistent_column"
      :name "COLUMN_1"}]}})

(def missing-column-series-data
  [{:card {:id 789 :entity_id "not-the-id-zmxncbv" :name "Test Card"}
    :data {:cols [{:name "different_column"
                   :display_name "Different Column"}]
           :rows [[0]]}}])

(deftest ^:parallel test-scalar-funnel-visualization
  (testing "scalar funnel visualization"
    (let [result (render-util/get-visualization-columns scalar-funnel-definition scalar-funnel-series-data)]
      (is (= expected-scalar-funnel-columns result)))))

(deftest ^:parallel test-standard-visualization-with-column-mappings
  (testing "standard visualization with column mappings"
    (let [result (render-util/get-visualization-columns standard-mapping-definition standard-mapping-series-data)]
      (is (= expected-standard-mapping-columns result)))))

(deftest ^:parallel test-ignores-string-mappings
  (testing "ignores string mappings which are name references"
    (let [result (render-util/get-visualization-columns string-mapping-definition string-mapping-series-data)]
      (is (= expected-string-mapping-columns result)))))

(deftest ^:parallel test-handles-missing-column-data
  (testing "handles missing column data gracefully"
    (let [result (render-util/get-visualization-columns missing-column-definition missing-column-series-data)]
      (is (empty? result) "Should return empty list when original column not found"))))

;; sourceId ("card:<id>") and name-reference strings ("$_card:<id>_name") both carry a card's real numeric
;; :id -- never its :entity_id, regardless of how close a random entity_id might look to one (metabase#76922).
;; :entity_id below is deliberately something a lookup could never confuse for the id in sourceId/the name ref.
(def numeric-id-series-data
  [{:card {:id 191 :entity_id "not-the-id-vbnmqwe" :name "Numeric ID Card"}
    :data {:cols [{:name "count"
                   :display_name "Count"
                   :base_type :type/Integer
                   :semantic_type :type/Quantity}]
           :rows [[42]]}}])

;; Combined test for both value and name sources in merge-visualizer-data
(def combined-numeric-id-definition
  {:display "funnel"
   :columnValuesMapping
   {:METRIC
    [{:sourceId "card:191"
      :originalName "count"
      :name "COLUMN_1"}]
    :DIMENSION
    ["$_card:191_name"]}
   :settings {:funnel.metric "METRIC", :funnel.dimension "DIMENSION"}})

(def expected-merged-data
  {:viz-settings {:funnel.metric "METRIC", :funnel.dimension "DIMENSION"}
   :cols [{:name "METRIC"
           :display_name "METRIC"
           :base_type :type/Integer
           :semantic_type :type/Quantity}
          {:name "DIMENSION"
           :display_name "DIMENSION"
           :base_type :type/Text
           :semantic_type :type/Category}]
   :rows [[42 "Numeric ID Card"]]})

(deftest ^:parallel test-merge-visualizer-data-with-numeric-ids
  (testing "merge-visualizer-data resolves both value sources and name references by the card's real numeric id
            (#76922) -- a scalar funnel-of-numbers visualizer card, the only production path that actually
            exercises this lookup, used to return an empty dataset here because sourceId/name-refs were being
            matched against :entity_id instead"
    (let [result (render-util/merge-visualizer-data
                  numeric-id-series-data
                  combined-numeric-id-definition)]
      (is (= (:viz-settings expected-merged-data) (:viz-settings result)))
      (is (= (map #(select-keys % [:name :display_name]) (:cols expected-merged-data))
             (map #(select-keys % [:name :display_name]) (:cols result))))
      (is (= (:rows expected-merged-data) (:rows result))))))

(deftest ^:parallel render-parameters-escapes-html-test
  (testing "parameter names and values are HTML-escaped"
    ;; Callers splice this fragment into the email body as-is, so it has to arrive escaped.
    (let [name-html  "<b>Bold</b>"
          value-html "R&D <i>x</i>"
          rendered   (render-util/render-parameters
                      [{:id    "f0d3d4d3"
                        :type  "string/="
                        :name  name-html
                        :value [value-html]}])]
      (testing "no markup from the parameter survives into the rendered HTML"
        (is (not (str/includes? rendered name-html))
            "parameter name was not escaped")
        (is (not (str/includes? rendered value-html))
            "parameter value was not escaped"))
      (testing "the text is still shown, escaped"
        (is (str/includes? rendered "&lt;b&gt;Bold&lt;/b&gt;"))
        (is (str/includes? rendered "R&amp;D &lt;i&gt;x&lt;/i&gt;"))))))
