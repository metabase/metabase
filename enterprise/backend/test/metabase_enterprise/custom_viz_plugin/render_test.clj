(ns metabase-enterprise.custom-viz-plugin.render-test
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
    ;; use 2 cols to avoid scalar detection (1 col + 1 row = :scalar)
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
                                                 :enabled      true}]
          (with-redefs [custom-viz-plugin/resolve-bundle (constantly {:content "function(){}" :hash "abc"})]
            (mt/with-premium-features #{}
              (let [card {:display :custom:feature-off}]
                (is (= :table
                       (card/detect-pulse-chart-type card nil multi-col-data))))))))
      (testing "custom viz with registered plugin and bundle resolves to :javascript_visualization"
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "has-bundle"
                                                 :display_name "Has Bundle"
                                                 :status       :active
                                                 :enabled      true}]
          (with-redefs [custom-viz-plugin/resolve-bundle (constantly {:content "function(){}" :hash "abc"})]
            (let [card {:display :custom:has-bundle}]
              (is (= :javascript_visualization
                     (card/detect-pulse-chart-type card nil multi-col-data))))))))))

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

(deftest custom-viz-bundles-resolved-test
  (mt/with-premium-features #{:custom-viz}
    (testing "custom-viz-bundles resolves the plugin bundle"
      (let [bundle-content "function customViz(){}"]
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "bundle-resolve"
                                                        :display_name "Bundle Resolve"
                                                        :status       :active
                                                        :enabled      true}]
          (with-redefs [custom-viz-plugin/resolve-bundle (constantly {:content bundle-content :hash "abc"})]
            (let [custom-viz-bundles #'body/custom-viz-bundles
                  result             (custom-viz-bundles {:display :custom:bundle-resolve})]
              (is (= 1 (count result)))
              (let [{:keys [identifier plugin-id source]} (first result)]
                (is (= "bundle-resolve" identifier))
                (is (= id plugin-id))
                (is (= bundle-content source))))))))))

(deftest custom-viz-bundles-no-bundle-test
  (mt/with-premium-features #{:custom-viz}
    (testing "custom-viz-bundles returns nil when the plugin has no resolvable bundle"
      (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "no-bundle"
                                               :display_name "No Bundle"
                                               :status       :active
                                               :enabled      true}]
        (with-redefs [custom-viz-plugin/resolve-bundle (constantly nil)]
          (let [custom-viz-bundles #'body/custom-viz-bundles]
            (is (nil? (custom-viz-bundles {:display :custom:no-bundle})))))))))

(deftest custom-viz-bundles-nil-when-no-plugin-test
  (mt/with-premium-features #{:custom-viz}
    (testing "custom-viz-bundles returns nil when plugin doesn't exist"
      (let [custom-viz-bundles #'body/custom-viz-bundles]
        (is (nil? (custom-viz-bundles {:display :custom:nonexistent})))))))

;;; ------------------------------------------------ javascript-visualization passes custom bundles ------------------------------------------------

(deftest javascript-visualization-passes-custom-bundles-test
  (mt/with-premium-features #{:custom-viz}
    (testing "*javascript-visualization* receives custom-viz-bundles argument"
      (let [received-bundles (atom nil)]
        (binding [js.svg/*javascript-visualization*
                  (fn [_cards _viz-settings custom-bundles]
                    (reset! received-bundles custom-bundles)
                    {:type :html :content "<div>test</div>"})]
          (body/render :javascript_visualization :inline "UTC"
                       {:display :bar :id 1}
                       nil
                       {:cols [{:name "x" :base_type :type/Integer}] :rows [[1]]})
          ;; For a non-custom display type, custom-viz-bundles returns nil
          (is (nil? @received-bundles)))))))

(deftest javascript-visualization-passes-resolved-bundles-for-custom-display-test
  (mt/with-premium-features #{:custom-viz}
    (testing "*javascript-visualization* receives resolved bundles when display is :custom:*"
      (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "wired-through"
                                               :display_name "Wired Through"
                                               :status       :active
                                               :enabled      true}]
        (let [received-bundles (atom nil)]
          (with-redefs [custom-viz-plugin/resolve-bundle (constantly {:content "function(){}" :hash "abc"})]
            (binding [js.svg/*javascript-visualization*
                      (fn [_cards _viz-settings custom-bundles]
                        (reset! received-bundles custom-bundles)
                        {:type :html :content "<div>custom</div>"})]
              (body/render :javascript_visualization :inline "UTC"
                           {:display :custom:wired-through :id 1}
                           nil
                           {:cols [{:name "x" :base_type :type/Integer}] :rows [[1]]})
              (is (= 1 (count @received-bundles)))
              (is (= "wired-through" (:identifier (first @received-bundles))))
              (is (= "function(){}" (:source (first @received-bundles)))))))))))
