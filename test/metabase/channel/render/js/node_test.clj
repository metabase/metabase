(ns metabase.channel.render.js.node-test
  "Tests for the `:node` static-viz renderer: the same assertions the graal renderer is trusted for,
  through the external-process path. Requires a built static-viz bundle (like the graal tests) plus a
  `node` binary on the PATH."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.render.js.node :as node]
   [metabase.channel.render.js.protocol :as js.protocol]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn warn-possible-rebuild
    [thunk]
    (testing "[PRO TIP] If this test fails, you may need to rebuild the bundle with `bun run build-static-viz`\n"
      (thunk))))

(deftest render-chart-test
  (testing "renders a simple funnel chart to an SVG"
    (let [{:keys [type content]} (js.protocol/chart
                                  (node/renderer)
                                  {:kind          "funnel"
                                   :data          [["Visit" 1000] ["Sign up" 700] ["Trial" 300]]
                                   :settings      {:step                   {:name "Step" :format {}}
                                                   :measure                {:format {}}
                                                   :visualization_settings {}}
                                   :tokenFeatures {}})]
      (is (= "svg" type))
      (is (str/starts-with? content "<svg"))
      (is (str/includes? content "Visit")))))

(deftest cell-background-colors-test
  (testing "computes cell background colors positionally from column formatting rules"
    (is (= ["rgba(255, 0, 0, 0.65)" nil]
           (js.protocol/cell-background-colors
            (node/renderer)
            {:rows     [[1] [5]]
             :cols     [{:name "test"}]
             :settings {:table.column_formatting [{:columns       ["test"]
                                                   :type          :single
                                                   :operator      "="
                                                   :value         1
                                                   :color         "#ff0000"
                                                   :highlight_row false}]}
             :cells    [[1 0 "test"] [5 1 "test"]]})))))
