(ns metabase.channel.render.js.color-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.color :as js.color]
   [metabase.channel.render.js.engine :as js.engine]
   [metabase.formatter.core :as formatter]
   [metabase.test :as mt])
  (:import
   [java.math BigDecimal BigInteger]))

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

(defmacro ^:private with-test-js-engine!
  "Setup a javascript engine with a stubbed script useful making sure `get-background-color` works independently from
  the real color picking script"
  [script & body]
  `(with-redefs [js.color/js-engine (let [delay# (delay (doto (js.engine/context)
                                                          (js.engine/load-js-string ~script ~(name (gensym "color-src")))))]
                                      (fn [] @delay#))]
     ~@body))

(deftest color-test
  (testing "The test script above should return red on even rows, green on odd rows"
    (with-test-js-engine! test-script
      (let [color-selector (js.color/make-color-selector {:cols [{:name "test"}]
                                                          :rows [[1] [2] [3] [4]]}
                                                         {"even" red, "odd" green})]
        (is (= [red green red green]
               (for [row-index (range 0 4)]
                 (js.color/get-background-color color-selector "any value" "any column" row-index))))))))

(deftest convert-keywords-test
  (testing (str "Same test as above, but make sure we convert any keywords as keywords don't get converted to "
                "strings automatically when passed to a JavaScript function")
    (with-test-js-engine! test-script
      (let [color-selector (js.color/make-color-selector {:cols [{:name "test"}]
                                                          :rows [[1] [2] [3] [4]]}
                                                         {:even red, :odd  green})]
        (is (= [red green red green]
               (for [row-index (range 0 4)]
                 (js.color/get-background-color color-selector "any value" "any column" row-index))))))))

(deftest render-color-is-thread-safe-test
  (is (every? some?
              (mt/repeat-concurrently
               3
               (fn []
                 (js.color/get-background-color (js.color/make-color-selector {:cols [{:name "test"}]
                                                                               :rows [[5] [5]]}
                                                                              {:table.column_formatting [{:columns ["test"],
                                                                                                          :type :single,
                                                                                                          :operator "=",
                                                                                                          :value 5,
                                                                                                          :color "#ff0000",
                                                                                                          :highlight_row true}]})
                                                "any value" "test" 1))))))

(deftest text-wrapper-null-empty-str-test
  (testing "get-background-color should correctly handle not-null operator for nulls and empty strings (VIZ-87)"
    (let [test-script "function makeCellBackgroundGetter(rows, colsJSON, settingsJSON) {
                         cols = JSON.parse(colsJSON);
                         settings = JSON.parse(settingsJSON);
                         return function(value, rowIndex, columnName) {
                           if (value === null || value === undefined) {
                             return null;
                           }
                           return settings['color'];
                         }
                       }"]
      (with-test-js-engine! test-script
        (let [color-selector (js.color/make-color-selector {:cols [{:name "test"}]
                                                            :rows [[1] [2] [3] [4]]}
                                                           {"color" red})]
          (testing "TextWrapper cell with original value of empty string should receive color"
            (is (= red (js.color/get-background-color color-selector (formatter/->TextWrapper "" "") "test" 0))))
          (testing "TextWrapper cell with original value of nil should not receive color"
            (is (nil? (js.color/get-background-color color-selector (formatter/->TextWrapper "" nil) "test" 0))))))))

  (deftest convert-bignumbers-by-column-test
    (testing "convert-bignumbers-by-column should convert BigDecimal and BigInteger values to doubles/longs"
      (let [convert-fn #'js.color/convert-bignumbers-by-column]
        (testing "empty data returns empty vector"
          (is (= [] (convert-fn []))))

        (testing "data with no BigDecimals or BigIntegers remains unchanged"
          (let [data [[1 2 "test"] [3 4 "another"]]]
            (is (= data (convert-fn data)))))

        (testing "BigDecimal values are converted to doubles"
          (let [big-decimal (BigDecimal. "123.456")
                data [[big-decimal 2 "test"] [big-decimal 4 "another"]]
                result (convert-fn data)]
            (is (= [[123.456 2 "test"] [123.456 4 "another"]] result))
            (is (every? #(instance? Double (first %)) result))))

        (testing "BigInteger values are converted to longs"
          (let [big-integer (BigInteger. "987654321")
                data [[big-integer 2 "test"] [big-integer 4 "another"]]
                result (convert-fn data)]
            (is (= [[987654321 2 "test"] [987654321 4 "another"]] result))
            (is (every? #(instance? Long (first %)) result))))

        (testing "mixed BigDecimal and BigInteger conversion"
          (let [big-decimal (BigDecimal. "123.456")
                big-integer (BigInteger. "789")
                data [[big-decimal big-integer "test"] [big-decimal big-integer "another"]]
                result (convert-fn data)]
            (is (= [[123.456 789 "test"] [123.456 789 "another"]] result))
            (is (every? #(instance? Double (first %)) result))
            (is (every? #(instance? Long (second %)) result))))))))
