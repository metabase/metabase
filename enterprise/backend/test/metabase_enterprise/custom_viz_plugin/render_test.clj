(ns ^:synchronous metabase-enterprise.custom-viz-plugin.render-test
  "Tests for custom viz integration in the render pipeline (card type detection and static viz)."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.body :as body]
   [metabase.channel.render.card :as card]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.channel.render.pdf :as pdf]
   [metabase.channel.render.pdf.common :as pdf.common]
   [metabase.channel.render.pdf.font :as pdf.font]
   [metabase.channel.render.util :as render.util]
   [metabase.config.core :as config]
   [metabase.custom-viz-plugin.core :as custom-viz-plugin]
   [metabase.test :as mt])
  (:import
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)))

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
                   (card/detect-pulse-chart-type card nil multi-col-data)))))))))

(deftest detect-pulse-chart-type-one-by-one-result-test
  (mt/with-premium-features #{:custom-viz}
    (testing "a 1-col × 1-row custom viz result stays :javascript_visualization, not :scalar — the
              custom-viz clause must sit before the scalar clause (see the guard comment in card.clj)"
      (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "one-by-one"
                                               :display_name "One By One"
                                               :status       :active
                                               :enabled      true
                                               :bundle_hash  "abc"}]
        (is (= :javascript_visualization
               (card/detect-pulse-chart-type {:display :custom:one-by-one} nil
                                             {:cols [{:name "count"}] :rows [[18760]]})))))))

(deftest detect-pulse-chart-type-oss-classpath-test
  (testing "on an OSS classpath (no EE) a custom display never routes to the JS path"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "oss-viz"
                                               :display_name "OSS Viz"
                                               :status       :active
                                               :enabled      true
                                               :bundle_hash  "abc"}]
        (with-redefs [config/ee-available? false]
          (testing "custom-viz-identifier is nil"
            (is (nil? (render.util/custom-viz-identifier :custom:oss-viz))))
          (testing "a multi-column result degrades to :table"
            (is (= :table
                   (card/detect-pulse-chart-type {:display :custom:oss-viz} nil
                                                 {:cols [{:name "x"} {:name "y"}] :rows [[1 2] [3 4]]}))))
          (testing "a 1×1 result degrades to :scalar (the value renders as text)"
            (is (= :scalar
                   (card/detect-pulse-chart-type {:display :custom:oss-viz} nil
                                                 {:cols [{:name "count"}] :rows [[18760]]})))))))))

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

;;; ------------------------------------------------ PDF: fit-within cell sizing ------------------------------------------------

(deftest pdf-custom-viz-chart-size-fit-within-test
  (testing "a custom-viz dashcard's PDF render binds *chart-size* to the cell box with :fit-within? true,
            so the chart is laid out to fill its grid cell (GDGT-2862) — and the resolved plugin
            bundle reaches the same call site"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "pdf-viz"
                                               :display_name "PDF Viz"
                                               :status       :active
                                               :enabled      true
                                               :bundle_hash  "abc"}]
        (with-redefs [custom-viz-plugin/resolve-bundle (constantly {:content "function(){}" :hash "abc"})]
          (let [captured (atom nil)
                cell-w   480.0
                cell-h   360.0]
            (binding [js.svg/*javascript-visualization*
                      (fn [_cards _viz-settings custom-bundles]
                        (reset! captured {:chart-size js.svg/*chart-size*
                                          :bundles    custom-bundles})
                        {:type    :svg
                         :content "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><rect width=\"10\" height=\"10\"/></svg>"})]
              (with-open [doc (PDDocument.)]
                (binding [pdf.font/*fonts* (#'pdf.font/load-fonts! doc)
                          pdf/*link-rects* (atom [])]
                  (let [page (PDPage. PDRectangle/A4)]
                    (.addPage doc page)
                    (with-open [cs (PDPageContentStream. doc page)]
                      ;; empty :name → no title block, so the body area is the whole cell
                      (#'pdf/render-card-cell! doc cs nil
                                               {:card     {:display "custom:pdf-viz" :name "" :id 1}
                                                :dashcard nil
                                                :result   {:data {:cols [{:name "count" :base_type :type/BigInteger}]
                                                                  :rows [[42]]}}}
                                               36.0 760.0 cell-w cell-h))))))
            (testing "the fit-within cell box reaches the render call site"
              (is (= {:width       (#'pdf/pt->px cell-w)
                      :height      (#'pdf/pt->px cell-h)
                      :scale       pdf.common/chart-supersample
                      :fit-within? true}
                     (:chart-size @captured))))
            (testing "the resolved plugin bundle reaches the render call site"
              (is (= ["pdf-viz"] (mapv :identifier (:bundles @captured)))))))))))
