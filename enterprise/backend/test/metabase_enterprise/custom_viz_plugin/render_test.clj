(ns metabase-enterprise.custom-viz-plugin.render-test
  "Tests for custom viz integration in the render pipeline (card type detection and static viz)."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.card :as card]
   [metabase.channel.render.util :as render.util]
   [metabase.test :as mt]))

;;; ------------------------------------------------ Display Type Detection ------------------------------------------------

(deftest custom-viz-display?-test
  (testing "recognizes custom: prefixed display types"
    (is (render.util/custom-viz-display? :custom:heatmap))
    (is (render.util/custom-viz-display? "custom:heatmap")))
  (testing "rejects non-custom display types"
    (is (not (render.util/custom-viz-display? :table)))
    (is (not (render.util/custom-viz-display? :bar)))
    (is (not (render.util/custom-viz-display? "line"))))
  (testing "handles nil"
    (is (not (render.util/custom-viz-display? nil)))))

(deftest custom-viz-identifier-test
  (testing "returns nil when feature is not enabled"
    (mt/with-premium-features #{}
      (is (nil? (render.util/custom-viz-identifier :custom:heatmap)))))
  (testing "returns identifier when feature is enabled"
    (mt/with-premium-features #{:custom-viz}
      (is (= "heatmap" (render.util/custom-viz-identifier :custom:heatmap)))
      (is (= "my-chart" (render.util/custom-viz-identifier "custom:my-chart")))))
  (testing "returns nil for non-custom display types"
    (mt/with-premium-features #{:custom-viz}
      (is (nil? (render.util/custom-viz-identifier :table)))
      (is (nil? (render.util/custom-viz-identifier nil))))))

;;; ------------------------------------------------ Chart Type Detection ------------------------------------------------

(deftest detect-pulse-chart-type-custom-viz-test
  (mt/with-premium-features #{:custom-viz}
    ;; use 2 cols to avoid scalar detection (1 col + 1 row = :scalar)
    (let [multi-col-data {:cols [{:name "x"} {:name "y"}] :rows [[1 2] [3 4]]}]
      (testing "custom viz without a registered plugin falls back to :table"
        (let [card {:display :custom:nonexistent}]
          (is (= :table
                 (card/detect-pulse-chart-type card nil multi-col-data)))))
      (testing "custom viz with registered plugin but no bundle falls back to :table"
        (mt/with-temp [:model/CustomVizPlugin _ {:repo_url     "https://github.com/test/no-bundle"
                                                 :identifier   "no-bundle"
                                                 :display_name "No Bundle"
                                                 :status       :active
                                                 :enabled      true}]
          (let [card {:display :custom:no-bundle}]
            (is (= :table
                   (card/detect-pulse-chart-type card nil multi-col-data))))))
      (testing "disabled custom viz plugin falls back to :table"
        (mt/with-temp [:model/CustomVizPlugin _ {:repo_url     "https://github.com/test/disabled"
                                                 :identifier   "disabled-chart"
                                                 :display_name "Disabled"
                                                 :status       :active
                                                 :enabled      false}]
          (let [card {:display :custom:disabled-chart}]
            (is (= :table
                   (card/detect-pulse-chart-type card nil multi-col-data)))))))))
