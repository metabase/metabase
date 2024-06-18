(ns metabase.pulse.render.color-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.render.color :as color]
   [metabase.pulse.render.js-engine :as js]
   [metabase.test :as mt]))

(def ^:private red "#ff0000")
(def ^:private green "#00ff00")

(def ^:private ^String test-script
  "function makeCellBackgroundGetter(rows, colsJSON, settingsJSON) {
     cols = JSON.parse(colsJSON);
     settings = JSON.parse(settingsJSON);
     cols.map(function (a) { return a; });
     return function(value, rowIndex, columnName) {
        if(rowIndex % 2 == 0){
          return settings[\"even\"]
        } else {
          return settings[\"odd\"]
        }
    }
   }")

(defmacro ^:private with-test-js-engine
  "Setup a javascript engine with a stubbed script useful making sure `get-background-color` works independently from
  the real color picking script"
  [script & body]
  `(with-redefs [color/js-engine (let [delay# (delay (doto (js/context)
                                                       (js/load-js-string ~script ~(name (gensym "color-src")))))]
                                   (fn [] @delay#))]
     ~@body))

(deftest color-test
  (testing "The test script above should return red on even rows, green on odd rows"
    (with-test-js-engine test-script
      (let [color-selector (color/make-color-selector {:cols [{:name "test"}]
                                                       :rows [[1] [2] [3] [4]]}
                                                      {"even" red, "odd" green})]
        (is (= [red green red green]
               (for [row-index (range 0 4)]
                 (color/get-background-color color-selector "any value" "any column" row-index))))))))

(deftest convert-keywords-test
  (testing (str "Same test as above, but make sure we convert any keywords as keywords don't get converted to "
                "strings automatically when passed to a JavaScript function")
    (with-test-js-engine test-script
      (let [color-selector (color/make-color-selector {:cols [{:name "test"}]
                                                       :rows [[1] [2] [3] [4]]}
                                                      {:even red, :odd  green})]
        (is (= [red green red green]
               (for [row-index (range 0 4)]
                 (color/get-background-color color-selector "any value" "any column" row-index))))))))

(deftest render-color-is-thread-safe-test
  (is (every? some?
              (mt/repeat-concurrently
               3
               (fn []
                 (color/get-background-color (color/make-color-selector {:cols [{:name "test"}]
                                                                         :rows [[5] [5]]}
                                                                        {:table.column_formatting[{:columns ["test"],
                                                                                                   :type :single,
                                                                                                   :operator "=",
                                                                                                   :value 5,
                                                                                                   :color "#ff0000",
                                                                                                   :highlight_row true}]})
                                             "any value" "test" 1))))))
