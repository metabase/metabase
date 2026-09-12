(ns ^:synchronized metabase-enterprise.custom-viz-plugin.render-test
  "Tests for custom viz integration in the render pipeline (card type detection and static viz)."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.body :as body]
   [metabase.channel.render.card :as card]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.channel.render.util :as render.util]
   [metabase.custom-viz-plugin.core :as custom-viz-plugin]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [csp-img-enabled true
                                       custom-viz-enabled true]
      (thunk))))

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
    (let [multi-col-data {:cols [{:name "x"} {:name "y"}] :rows [[1 2] [3 4]]}]
      (testing "custom viz without a registered plugin falls back to :table"
        (let [card {:display :custom:nonexistent}]
          (is (= :table
                 (card/detect-pulse-chart-type card nil multi-col-data)))))
      (testing "custom viz with registered plugin but no bundle falls back to :table"
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "no-bundle"
                                                 :display_name "No Bundle"
                                                 :status       :active
                                                 :enabled      true}]
          (let [card {:display :custom:no-bundle}]
            (is (= :table
                   (card/detect-pulse-chart-type card nil multi-col-data))))))
      (testing "disabled custom viz plugin falls back to :table"
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "disabled-chart"
                                                 :display_name "Disabled"
                                                 :status       :active
                                                 :enabled      false}]
          (let [card {:display :custom:disabled-chart}]
            (is (= :table
                   (card/detect-pulse-chart-type card nil multi-col-data))))))
      (testing "custom viz with registered plugin and bundle falls back to :table when :custom-viz feature is disabled"
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "feature-off"
                                                 :display_name "Feature Off"
                                                 :status       :active
                                                 :enabled      true
                                                 :bundle_hash  "abc"}]
          (mt/with-premium-features #{}
            (let [card {:display :custom:feature-off}]
              (is (= :table
                     (card/detect-pulse-chart-type card nil multi-col-data)))))))
      (testing "custom viz with registered plugin and bundle resolves to :javascript_visualization"
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "has-bundle"
                                                 :display_name "Has Bundle"
                                                 :status       :active
                                                 :enabled      true
                                                 :bundle_hash  "abc"}]
          (let [card {:display :custom:has-bundle}]
            (is (= :javascript_visualization
                   (card/detect-pulse-chart-type card nil multi-col-data))))))
      (testing "custom viz with no result rows renders the standard :empty state, not the JS path"
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "empty-rows"
                                                 :display_name "Empty Rows"
                                                 :status       :active
                                                 :enabled      true
                                                 :bundle_hash  "abc"}]
          (let [card {:display :custom:empty-rows}]
            (is (= :empty
                   (card/detect-pulse-chart-type card nil {:cols [{:name "x"} {:name "y"}] :rows []}))))))
      (testing "dev-only custom viz (dev_bundle_url, no uploaded bundle) resolves to :javascript_visualization"
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier     "dev-only"
                                                 :display_name   "Dev Only"
                                                 :status         :active
                                                 :enabled        true
                                                 :dev_bundle_url "http://localhost:9876"}]
          (let [card {:display :custom:dev-only}]
            (is (= :javascript_visualization
                   (card/detect-pulse-chart-type card nil multi-col-data))))))
      (testing "a one-row, one-column custom viz is still a custom viz, not a :scalar"
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "single-value"
                                                 :display_name "Single Value"
                                                 :status       :active
                                                 :enabled      true
                                                 :bundle_hash  "abc"}]
          (let [card {:display :custom:single-value}]
            (is (= :javascript_visualization
                   (card/detect-pulse-chart-type card nil {:cols [{:name "x"}] :rows [[1]]})))))))))

;;; ------------------------------------------------ javascript_visualization rendering ------------------------------------------------

(deftest custom-viz-empty-content-falls-back-to-table-test
  (mt/with-premium-features #{:custom-viz}
    (testing "when custom viz returns empty content, falls back to table rendering"
      (let [card {:display :custom:empty-viz :id 1}
            data {:cols [{:name "x" :base_type :type/Integer} {:name "y" :base_type :type/Integer}]
                  :rows [[1 2]]}
            table-result (body/render :table :inline "UTC" card nil data)]
        (binding [js.svg/*javascript-visualization*
                  (fn [_cards _viz-settings _custom-bundles]
                    {:type :svg :content ""})]
          (let [result (body/render :javascript_visualization :inline "UTC" card nil data)]
            (is (= (:content table-result) (:content result)))))))))

;;; ------------------------------------------------ javascript-visualization receives custom bundles ------------------------------------------------

(defn- render-and-capture-bundles
  "Render `card` through the `:javascript_visualization` path and return the custom bundles handed to
   `*javascript-visualization*`."
  [card]
  (let [received-bundles (atom ::not-called)]
    (binding [js.svg/*javascript-visualization*
              (fn [_cards _viz-settings custom-bundles]
                (reset! received-bundles custom-bundles)
                {:type :html :content "<div>test</div>"})]
      (body/render :javascript_visualization :inline "UTC" card nil
                   {:cols [{:name "x" :base_type :type/Integer}] :rows [[1]]})
      @received-bundles)))

(deftest javascript-visualization-custom-bundles-test
  (mt/with-premium-features #{:custom-viz}
    (testing "non-custom display types pass no custom bundles"
      (is (nil? (render-and-capture-bundles {:display :bar :id 1}))))
    (testing "an unregistered custom display passes no custom bundles"
      (is (nil? (render-and-capture-bundles {:display :custom:nonexistent :id 1}))))
    (mt/with-temp [:model/CustomVizPlugin {plugin-id :id} {:identifier   "wired-through"
                                                           :display_name "Wired Through"
                                                           :status       :active
                                                           :enabled      true}]
      (let [card {:display :custom:wired-through :id 1}]
        (testing "a plugin without a resolvable bundle passes no custom bundles"
          (with-redefs [custom-viz-plugin/resolve-bundle (constantly nil)]
            (is (nil? (render-and-capture-bundles card)))))
        (testing "a plugin with a resolvable bundle passes it through with identifier, plugin id and source"
          (with-redefs [custom-viz-plugin/resolve-bundle (constantly {:content "function(){}" :hash "abc"})]
            (is (= [{:identifier "wired-through" :plugin-id plugin-id :source "function(){}"}]
                   (render-and-capture-bundles card)))))))))
