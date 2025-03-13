(ns metabase.pivot.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.pivot.core :as pivot]))

(def ^:private pivot-test-data
  "A minimal example of pivot data for testing."
  {:rows [[1 "A" "Y" 0 1]
          [1 "A" "Z" 0 1]
          [1 "B" "Y" 0 1]
          [1 "B" "Z" 0 1]
          [1 "C" "Y" 0 1]
          [1 "C" "Z" 0 1]
          [2 "A" "Y" 0 1]
          [2 "A" "Z" 0 1]
          [2 "B" "Y" 0 1]
          [2 "B" "Z" 0 1]
          [2 "C" "Y" 0 1]
          [2 "C" "Z" 0 1]
          [nil "A" "Y" 1 2]
          [nil "A" "Z" 1 2]
          [nil "B" "Y" 1 2]
          [nil "B" "Z" 1 2]
          [nil "C" "Y" 1 2]
          [nil "C" "Z" 1 2]
          [nil nil "Y" 3 6]
          [nil nil "Z" 3 6]
          [1 "A" nil 4 2]
          [1 "B" nil 4 2]
          [1 "C" nil 4 2]
          [2 "A" nil 4 2]
          [2 "B" nil 4 2]
          [2 "C" nil 4 2]
          [nil "A" nil 5 4]
          [nil "B" nil 5 4]
          [nil "C" nil 5 4]
          [nil nil nil 7 12]],
   :pivot-export-options {:pivot-rows [1 0], :pivot-cols [2]},
   :cols [{:database_type "INTEGER",
           :semantic_type "type/PK",
           :name "col0",
           :source "breakout",
           :field_ref ["field" "col0" {:base-type "type/Integer"}],
           :effective_type "type/Integer",
           :display_name "col0",
           :remapping nil,
           :remapped_from_index nil,
           :base_type "type/Integer"}
          {:database_type "CHARACTER VARYING",
           :name "col1",
           :source "breakout",
           :field_ref ["field" "col1" {:base-type "type/Text"}],
           :effective_type "type/Text",
           :display_name "col1",
           :remapping nil,
           :remapped_from_index nil,
           :fingerprint
           {:global {:distinct-count 3, :nil% 0},
            :type
            {:type/Text
             {:percent-json 0,
              :percent-url 0,
              :percent-email 0,
              :percent-state 0,
              :average-length 1}}},
           :base_type "type/Text"}
          {:database_type "CHARACTER VARYING",
           :name "col2",
           :source "breakout",
           :field_ref ["field" "col2" {:base-type "type/Text"}],
           :effective_type "type/Text",
           :display_name "col2",
           :remapping nil,
           :remapped_from_index nil,
           :fingerprint
           {:global {:distinct-count 2, :nil% 0},
            :type
            {:type/Text
             {:percent-json 0,
              :percent-url 0,
              :percent-email 0,
              :percent-state 0,
              :average-length 1}}},
           :base_type "type/Text"}
          {:database_type "INTEGER",
           :name "pivot-grouping",
           :expression_name "pivot-grouping",
           :source "breakout",
           :field_ref ["expression" "pivot-grouping"],
           :effective_type "type/Integer",
           :display_name "pivot-grouping",
           :remapping nil,
           :remapped_from_index nil,
           :base_type "type/Integer"}
          {:database_type "BIGINT",
           :semantic_type "type/Quantity",
           :name "count",
           :source "aggregation",
           :field_ref ["aggregation" 0],
           :effective_type "type/BigInteger",
           :aggregation_index 0,
           :ident "S75TeXxnjAh0tJJDbzKg2",
           :display_name "Count",
           :remapping nil,
           :remapped_from_index nil,
           :base_type "type/BigInteger"}]})

(deftest columns-without-pivot-group-test
  (testing "Correctly filters out the pivot grouping column based on name"
    (is (= ["col0" "col1" "col2" "count"]
           (->> (pivot/columns-without-pivot-group (:cols pivot-test-data))
                (map :name))))))

(deftest split-pivot-data
  (testing "split-pivot-table pulls apart the aggregations packed into a single
    result set, keyed by the columns indexes that are aggregated"
    (is (= {:pivot-data {[0 1 2] [[1 "A" "Y" 1]
                                  [1 "A" "Z" 1]
                                  [1 "B" "Y" 1]
                                  [1 "B" "Z" 1]
                                  [1 "C" "Y" 1]
                                  [1 "C" "Z" 1]
                                  [2 "A" "Y" 1]
                                  [2 "A" "Z" 1]
                                  [2 "B" "Y" 1]
                                  [2 "B" "Z" 1]
                                  [2 "C" "Y" 1]
                                  [2 "C" "Z" 1]]
                         [1 2]   [[nil "A" "Y" 2]
                                  [nil "A" "Z" 2]
                                  [nil "B" "Y" 2]
                                  [nil "B" "Z" 2]
                                  [nil "C" "Y" 2]
                                  [nil "C" "Z" 2]]
                         [2]     [[nil nil "Y" 6]
                                  [nil nil "Z" 6]]
                         [0 1]   [[1 "A" nil 2]
                                  [1 "B" nil 2]
                                  [1 "C" nil 2]
                                  [2 "A" nil 2]
                                  [2 "B" nil 2]
                                  [2 "C" nil 2]]
                         [1]     [[nil "A" nil 4]
                                  [nil "B" nil 4]
                                  [nil "C" nil 4]]
                         []      [[nil nil nil 12]]}
            :primary-rows-key [0 1 2]}
           ;; Dissoc :columns beacuse this is the same as the result of `columns-without-pivot-group-test`, tested above
           (dissoc (pivot/split-pivot-data pivot-test-data) :columns)))))

(deftest get-subtotal-values-test
  (testing "Extracts subtotal values from pivot data"
    (let [pivot-data {[0 1 2] [[1 "A" "Y" 10]
                               [1 "B" "Z" 20]]}
          val-indexes [3]
          result (#'pivot/get-subtotal-values pivot-data val-indexes nil)]
      (is (= {[0 1 2] {[1 "A" "Y"] [10]
                       [1 "B" "Z"] [20]}}
             result))))

  (testing "Excludes the primary rows if passed a primary rows key"
    (let [pivot-data {[0 1 2] [[1 "A" "Y" 10]
                               [1 "B" "Z" 20]]}
          val-indexes [3]
          result (#'pivot/get-subtotal-values pivot-data val-indexes [0 1 2])]
      (is (= {}
             result)))))

(deftest get-active-breakout-indexes-test
  (testing "Correctly determines active breakout indexes from pivot group values"
    (let [pivot-group   0  ;; All breakouts active (000 in binary)
          num-breakouts 3]
      (is (= [0 1 2]
             (#'pivot/get-active-breakout-indexes pivot-group num-breakouts))))

    (let [pivot-group   1  ;; One inactive breakout (001 in binary)
          num-breakouts 3]
      (is (= [1 2]
             (#'pivot/get-active-breakout-indexes pivot-group num-breakouts))))

    (let [pivot-group   6  ;; Two inactive breakouts (110 in binary)
          num-breakouts 3]
      (is (= [0]
             (#'pivot/get-active-breakout-indexes pivot-group num-breakouts))))

    (let [pivot-group   7  ;; No active breakouts (111 in binary)
          num-breakouts 3]
      (is (= []
             (#'pivot/get-active-breakout-indexes pivot-group num-breakouts))))))

(deftest get-subtotals-test
  (testing "Returns correctly formatted subtotal values"
    (let [subtotal-values {[0 1] {[1 "A"] [100 200]}}
          breakout-indexes [0 1]
          values [1 "A"]
          other-attrs {:custom "attr"}
          value-formatters [(fn [v] (str "$" v))
                            (fn [v] (str v "%"))]
          result (#'pivot/get-subtotals subtotal-values breakout-indexes values other-attrs value-formatters)]
      (is (= [{:value "$100" :isSubtotal true :custom "attr"}
              {:value "200%" :isSubtotal true :custom "attr"}]
             result)))))

(deftest create-row-section-getter-test
  (testing "Returns a function that correctly retrieves cell values"
    (let [values-by-key {["A" 1] {:values [10 20]
                                  :valueColumns [{:name "count"} {:name "sum"}]
                                  :data [{:value 1 :colIdx 0}
                                         {:value "A" :colIdx 1}
                                         {:value 10 :colIdx 2}
                                         {:value 20 :colIdx 3}]
                                  :dimensions [{:value 1 :colIdx 0}
                                               {:value "A" :colIdx 1}]}}
          subtotal-values {[1] {[1] [100 200]}}
          value-formatters [#(str "$" %) #(str % "%")]
          col-indexes [1]
          row-indexes [0]
          col-paths [["A"]]
          row-paths [[1]]
          color-getter (constantly "blue")
          getter (#'pivot/create-row-section-getter values-by-key subtotal-values value-formatters
                                                    col-indexes row-indexes col-paths row-paths color-getter)
          result (getter 0 0)]
      (is (= [{:value "$10"
               :backgroundColor "blue"
               :clicked {:data [{:value 1 :colIdx 0}
                                {:value "A" :colIdx 1}
                                {:value 10 :colIdx 2}
                                {:value 20 :colIdx 3}]
                         :dimensions [{:value 1 :colIdx 0}
                                      {:value "A" :colIdx 1}]}}
              {:value "20%"
               :backgroundColor "blue"
               :clicked {:data [{:value 1 :colIdx 0}
                                {:value "A" :colIdx 1}
                                {:value 10 :colIdx 2}
                                {:value 20 :colIdx 3}]
                         :dimensions [{:value 1 :colIdx 0}
                                      {:value "A" :colIdx 1}]}}]
             #?(:cljs (js->clj result :keywordize-keys true)
                :clj result))))))

(deftest tree-to-array-test
  (testing "Correctly flattens a tree to array with position information"
    (let [tree [{:value "A" :rawValue "A"
                 :children [{:value "X" :rawValue "X" :children []}
                            {:value "Y" :rawValue "Y" :children []}]}]
          result (#'pivot/tree-to-array tree)]
      (is (= [{:value "A"
               :rawValue "A"
               :depth 0
               :offset 0
               :hasChildren true
               :path ["A"]
               :span 2
               :maxDepthBelow 1}
              {:value "X"
               :rawValue "X"
               :depth 1
               :offset 0
               :hasChildren false
               :path ["A" "X"]
               :span 1
               :maxDepthBelow 0}
              {:value "Y"
               :rawValue "Y"
               :depth 1
               :offset 1
               :hasChildren false
               :path ["A" "Y"]
               :span 1
               :maxDepthBelow 0}]
             result)))))
