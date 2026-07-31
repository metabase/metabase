(ns metabase.channel.render.js.color-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.color :as js.color]
   [metabase.formatter.core :as formatter]
   [metabase.test :as mt])
  (:import
   [java.math BigDecimal BigInteger]))

(set! *warn-on-reflection* true)

(def ^:private red-cell "rgba(255, 0, 0, 0.65)")
(def ^:private red-row "rgba(255, 0, 0, 0.2)")

(defn- single-rule [column operator value & {:as overrides}]
  (merge {:columns       [column]
          :type          :single
          :operator      operator
          :value         value
          :color         "#ff0000"
          :highlight_row false}
         overrides))

(deftest cell-background-colors-test
  (testing "colors are returned positionally: matching cells get the rule's color, others nil"
    (is (= [nil red-cell nil red-cell]
           (js.color/cell-background-colors {:cols [{:name "test"}]
                                             :rows [[1] [5] [3] [5]]}
                                            {:table.column_formatting [(single-rule "test" "=" 5)]}
                                            [[1 0 "test"] [5 1 "test"] [3 2 "test"] [5 3 "test"]])))))

(deftest row-index-test
  (testing "row-highlight rules read the full row via the row index, coloring cells in other columns"
    (is (= [red-row nil]
           (js.color/cell-background-colors {:cols [{:name "a"} {:name "b"}]
                                             :rows [[5 10] [1 20]]}
                                            {:table.column_formatting [(single-rule "a" "=" 5 :highlight_row true)]}
                                            ;; both queries are against column b; only row 0 has a=5
                                            [[10 0 "b"] [20 1 "b"]])))))

(deftest no-formatting-rules-fast-path-test
  (testing "without formatting rules every color is nil (and no JS is invoked)"
    (is (= [nil nil]
           (js.color/cell-background-colors {:cols [{:name "test"}] :rows [[1] [2]]}
                                            {}
                                            [[1 0 "test"] [2 1 "test"]])))
    (is (= [] (js.color/cell-background-colors {:cols [{:name "test"}] :rows [[1]]}
                                               {:table.column_formatting [(single-rule "test" "=" 1)]}
                                               [])))))

(deftest render-color-is-thread-safe-test
  (is (every? some?
              (mt/repeat-concurrently
               3
               (fn []
                 (first (js.color/cell-background-colors {:cols [{:name "test"}]
                                                          :rows [[5] [5]]}
                                                         {:table.column_formatting [(single-rule "test" "=" 5
                                                                                                 :highlight_row true)]}
                                                         [["any value" 1 "test"]])))))))

(deftest text-wrapper-null-empty-str-test
  (testing "cell-background-colors should correctly handle not-null operator for nulls and empty strings (VIZ-87)"
    (let [colors (js.color/cell-background-colors {:cols [{:name "test"}]
                                                   :rows [[""] [nil]]}
                                                  {:table.column_formatting [(single-rule "test" "not-null" nil)]}
                                                  [[(formatter/->TextWrapper "" "") 0 "test"]
                                                   [(formatter/->TextWrapper "" nil) 1 "test"]])]
      (testing "TextWrapper cell with original value of empty string should receive color"
        (is (= red-cell (first colors))))
      (testing "TextWrapper cell with original value of nil should not receive color"
        (is (nil? (second colors)))))))

(deftest bigdecimal-cell-gets-range-color-test
  (testing "range colors apply to BigDecimal/BigInteger cell values (GDGT-2412)"
    (let [viz       {:table.column_formatting
                     [{:columns ["pct"] :type "range" :colors ["#ffffff" "#ff0000"]}]}
          data      {:cols [{:name "pct"}] :rows [[0.0] [0.5] [1.0]]}
          color-for (fn [n]
                      (first (js.color/cell-background-colors
                              data viz
                              [[(formatter/->NumericWrapper (str n) n) 1 "pct"]])))]
      (is (= "rgba(255, 128, 128, 0.75)" (color-for 0.5)))
      (is (= "rgba(255, 128, 128, 0.75)" (color-for (BigDecimal. "0.5"))))
      (is (= "rgba(255, 0, 0, 0.75)" (color-for (BigInteger. "1")))))))
