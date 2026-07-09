(ns metabase.channel.render.js.quickjs-test
  "Tests for the QuickJS (process-per-render) static-viz renderer. These run only where a worker binary
  is available — build one locally with `native/static-viz-worker/build.sh`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.channel.render.js.quickjs :as quickjs]
   [metabase.test :as mt]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn skip-without-worker
    [thunk]
    (if (quickjs/available?)
      (testing "[PRO TIP] If this test fails, you may need to rebuild the bundle with `bun run build-static-viz`\n"
        (thunk))
      (log/warn (str "Skipping " (ns-name *ns*) " - no static-viz worker binary for this platform;"
                     " build one with native/static-viz-worker/build.sh")))))

(def ^:private funnel-input
  {:kind          "funnel"
   :data          [["Visitors" 1000] ["Signed up" 300] ["Activated" 25]]
   :settings      {:step     {:name "Step"}
                   :measure  {:format {}}
                   :colors   {:textMedium "#949aab", :brand "#509ee3", :border "#f0f0f0"}
                   :visualization_settings {}}
   :tokenFeatures {}})

(deftest chart-test
  (let [{:keys [type content]} (js.protocol/chart (quickjs/renderer) funnel-input)]
    (is (= "svg" type))
    (is (str/starts-with? content "<svg"))
    (is (str/includes? content "Visitors"))))

(deftest cell-background-colors-test
  (let [input {:rows     [[1 10.5] [2 99.9]]
               :cols     [{:name "id", :display_name "ID", :base_type "type/Integer"}
                          {:name "score", :display_name "Score", :base_type "type/Float"}]
               :settings {:table.column_formatting
                          [{:columns       ["score"]
                            :type          "single"
                            :operator      ">"
                            :value         40
                            :color         "#EF8C8C"
                            :highlight_row false}]}
               :cells    [[10.5 0 "score"] [99.9 1 "score"]]}]
    (is (= [nil "rgba(239, 140, 140, 0.65)"]
           (js.protocol/cell-background-colors (quickjs/renderer) input)))))

(deftest js-error-test
  (testing "a JS-level failure surfaces as an exception carrying the worker's stderr"
    (is (thrown-with-msg? Exception #"static-viz worker failed"
                          (js.protocol/chart (quickjs/renderer)
                                             {:kind "gauge", :card nil, :data nil, :tokenFeatures {}})))))

(deftest timeout-test
  (testing "a render exceeding the wall-clock timeout kills the worker and throws"
    (with-redefs [quickjs/render-timeout-ms (constantly 1)]
      (is (thrown-with-msg? Exception #"timed out"
                            (js.protocol/chart (quickjs/renderer) funnel-input))))))

(deftest concurrent-renders-test
  (testing "concurrent renders each run in their own worker process"
    (is (= (repeat 4 "svg")
           (mt/repeat-concurrently 4 #(:type (js.protocol/chart (quickjs/renderer) funnel-input)))))))
