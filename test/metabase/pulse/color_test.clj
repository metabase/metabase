(ns metabase.pulse.color-test
  (:require [expectations :refer :all]
            [metabase.pulse.color :as color :refer :all]))

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
  `(with-redefs [color/js-engine (delay (#'color/make-js-engine-with-script ~script))]
     ~@body))

;; The test script above should return red on even rows, green on odd rows
(expect
  [red green red green]
  (with-test-js-engine test-script
    (let [color-selector (make-color-selector {:cols [{:name "test"}]
                                               :rows [[1] [2] [3] [4]]}
                                              {"even" red, "odd" green})]
      (for [row-index (range 0 4)]
        (get-background-color color-selector "any value" "any column" row-index)))))

;; Same test as above, but make sure we convert any keywords as keywords don't get converted to strings automatically
;; when passed to a nashorn function
(expect
  [red green red green]
  (with-test-js-engine test-script
    (let [color-selector (make-color-selector {:cols [{:name "test"}]
                                               :rows [[1] [2] [3] [4]]}
                                              {:even red, :odd  green})]
      (for [row-index (range 0 4)]
        (get-background-color color-selector "any value" "any column" row-index)))))
