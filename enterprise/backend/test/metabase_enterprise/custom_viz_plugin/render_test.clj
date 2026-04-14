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
                   (card/detect-pulse-chart-type card nil multi-col-data))))))
      (testing "custom viz with registered plugin and bundle resolves to :javascript_visualization"
        (mt/with-temp [:model/CustomVizPlugin _ {:repo_url     "https://github.com/test/has-bundle"
                                                 :identifier   "has-bundle"
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
                  :rows [[1 2]]}]
        (binding [js.svg/*javascript-visualization*
                  (fn [_cards _viz-settings _custom-bundles]
                    {:type :svg :content ""})]
          ;; body/render is a multimethod; calling :javascript_visualization with empty content
          ;; should fall back to :table. We verify it doesn't throw.
          (is (some? (body/render :javascript_visualization :inline "UTC" card nil data))))))))

(deftest custom-viz-bundles-resolved-test
  (mt/with-premium-features #{:custom-viz}
    (testing "custom-viz-bundles resolves plugin bundle and assets"
      (let [bundle-content "function customViz(){}"
            asset-bytes    (.getBytes "fake-png-data")]
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/bundle-resolve"
                                                        :identifier   "bundle-resolve"
                                                        :display_name "Bundle Resolve"
                                                        :status       :active
                                                        :enabled      true
                                                        :manifest     {:name "bundle-resolve"
                                                                       :icon "icon.png"
                                                                       :assets ["icon.png"]}}]
          (with-redefs [custom-viz-plugin/resolve-bundle (constantly {:content bundle-content :hash "abc"})
                        custom-viz-plugin/asset-paths    (constantly ["icon.png"])
                        custom-viz-plugin/resolve-asset  (fn [plugin asset-name]
                                                           (when (and (= (:id plugin) id) (= asset-name "icon.png"))
                                                             asset-bytes))
                        custom-viz-plugin/asset-content-type (fn [name]
                                                               (when (= name "icon.png") "image/png"))]
            (let [custom-viz-bundles #'body/custom-viz-bundles
                  result             (custom-viz-bundles {:display :custom:bundle-resolve})]
              (is (= 1 (count result)))
              (let [{:keys [identifier source assets]} (first result)]
                (is (= "bundle-resolve" identifier))
                (is (= bundle-content source))
                (is (contains? assets "icon.png"))
                (is (re-find #"^data:image/png;base64," (get assets "icon.png")))))))))))

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
