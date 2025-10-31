(ns metabase.pivot.core-test
  (:require
   #?@(:cljs
       [[metabase.test-runner.assert-exprs.approximately-equal]])
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
           :display_name "Count",
           :remapping nil,
           :remapped_from_index nil,
           :base_type "type/BigInteger"}]})

(defn- lists-to-vecs-recursively [structure]
  (letfn [(walk [x]
            (cond (map? x) (update-vals x walk)
                  #?(:clj (instance? java.util.ArrayList x)
                     :cljs (array? x)) (mapv walk x)
                  :else x))]
    (walk structure)))

(deftest ensure-consistent-type-test
  #?(:clj
     (testing "Normalizes types (like BigInt/BigDecimal)"
       (is (= java.lang.Integer (type (@#'pivot/ensure-consistent-type 3))))
       (is (= java.lang.Integer (type (@#'pivot/ensure-consistent-type 3N))))
       (is (= java.lang.Integer (type (@#'pivot/ensure-consistent-type (BigInteger. "3")))))
       (is (= java.lang.Double (type (@#'pivot/ensure-consistent-type 3.0))))
       (is (= java.lang.Double (type (@#'pivot/ensure-consistent-type 3.0M)))))
     :cljs
     (testing "Does nothing on CLJS (intentional! values are already normalized)"
       (is (= js/Number (type (@#'pivot/ensure-consistent-type 3))))
       (is (= js/Number (type (@#'pivot/ensure-consistent-type 3N))))
       (is (= js/Number (type (@#'pivot/ensure-consistent-type 3.0))))
       (is (= js/Number (type (@#'pivot/ensure-consistent-type 3.0M)))))))

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
             result)))))

(deftest get-subtotal-values-primary-rows-key-test
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

(deftest build-pivot-trees-test
  (testing "build-pivot-trees correctly builds basic row and column tree structures"
    (let [rows [[1 "A" "Y" 0 10]
                [2 "B" "Z" 0 20]]
          cols [{:name "col0" :source "breakout"}
                {:name "col1" :source "breakout"}
                {:name "col2" :source "breakout"}
                {:name "pivot-grouping" :source "breakout"}
                {:name "count" :source "aggregation"}]
          row-indexes [0 1]
          col-indexes [2]
          val-indexes [4]
          settings {}
          col-settings [{} {} {} {} {}]
          result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]
      (is (=? [{:children [{:children [] :isCollapsed false :value "A"}]
                :isCollapsed false
                :value 1}
               {:children [{:children [] :isCollapsed false :value "B"}]
                :isCollapsed false
                :value 2}]
              (lists-to-vecs-recursively (:row-tree result))))

      (is (=? [{:children [] :isCollapsed false :value "Y"}
               {:children [] :isCollapsed false :value "Z"}]
              (lists-to-vecs-recursively (:col-tree result))))

      (is (= [[["Y" 1 "A"] [10]]
              [["Z" 2 "B"] [20]]]
             (map
              (fn [[k v]] [k (:values v)])
              (:values-by-key result)))
          "values-by-key should identify each value by its concatenated column and row paths"))))

#?(:cljs
   (deftest build-pivot-trees-with-collapsed-levels-cljs-test
     (testing "build-pivot-trees correctly handles collapsed subtotals"
       (let [rows [[1 "A" "Y" 0 10]
                   [1 "B" "Z" 0 20]
                   [2 "A" "Y" 0 30]
                   [2 "B" "Z" 0 40]]
             cols [{:name "col0" :source "breakout"}
                   {:name "col1" :source "breakout"}
                   {:name "col2" :source "breakout"}
                   {:name "pivot-grouping" :source "breakout"}
                   {:name "count" :source "aggregation"}]
             row-indexes [0 1]
             col-indexes [2]
             val-indexes [4]
             col-settings [{} {} {} {} {}]]
         ;; Set up collapsed subtotals for level 1 (the root level)
         (let [settings {:pivot_table.collapsed_rows {:value ["1"]}}
               result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]
           (is (=?
                [{:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed true
                  :value 1}
                 {:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed true
                  :value 2}]
                (lists-to-vecs-recursively (:row-tree result)))
               "Row tree should have correct collapsed state for the root level"))

         ;; Set up collapsed subtotals for level 2 (children of the root)
         (let [settings {:pivot_table.collapsed_rows {:value ["1"]}}
               result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]
           (is (=?
                [{:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed true
                  :value 1}
                 {:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed true
                  :value 2}]
                (lists-to-vecs-recursively (:row-tree result)))
               "Row tree should have correct collapsed state for the children of the root"))))))

#?(:clj
   (deftest build-pivot-trees-no-collapsing-clj-test
     (testing "build-pivot-trees correctly handles collapsed subtotals"
       (let [rows [[1 "A" "Y" 0 10]
                   [1 "B" "Z" 0 20]
                   [2 "A" "Y" 0 30]
                   [2 "B" "Z" 0 40]]
             cols [{:name "col0" :source "breakout"}
                   {:name "col1" :source "breakout"}
                   {:name "col2" :source "breakout"}
                   {:name "pivot-grouping" :source "breakout"}
                   {:name "count" :source "aggregation"}]
             row-indexes [0 1]
             col-indexes [2]
             val-indexes [4]
             col-settings [{} {} {} {} {}]]
         ;; Set up collapsed subtotals for level 1 (the root level)
         (let [settings {:pivot_table.collapsed_rows {:value ["1"]}}
               result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]
           (is (=?
                [{:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed false
                  :value 1}
                 {:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed false
                  :value 2}]
                (lists-to-vecs-recursively (:row-tree result)))
               "Row tree should have correct collapsed state for the root level"))

         ;; Set up collapsed subtotals for level 2 (children of the root)
         (let [settings {:pivot_table.collapsed_rows {:value ["1"]}}
               result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]
           (is (=?
                [{:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed false
                  :value 1}
                 {:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed false
                  :value 2}]
                (lists-to-vecs-recursively (:row-tree result)))
               "Row tree should have correct collapsed state for the children of the root"))))))

#?(:cljs
   (deftest build-pivot-trees-with-collapsed-paths-test
     (testing "build-pivot-trees correctly handles collapsed specific paths"
       (let [rows [[1 "A" "Y" 0 10]
                   [1 "B" "Z" 0 20]
                   [2 "A" "Y" 0 30]
                   [2 "B" "Z" 0 40]]
             cols [{:name "col0" :source "breakout"}
                   {:name "col1" :source "breakout"}
                   {:name "col2" :source "breakout"}
                   {:name "pivot-grouping" :source "breakout"}
                   {:name "count" :source "aggregation"}]
             row-indexes [0 1]
             col-indexes [2]
             val-indexes [4]
             col-settings [{} {} {} {} {}]]
         ;; Test collapsing a specific node at the root level
         (let [settings {:pivot_table.collapsed_rows {:value ["[1]"]}}
               result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]

           (is (=?
                [{:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed true ;; Only the node with value 1 should be collapsed
                  :value 1}
                 {:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed false ;; Node with value 2 should not be collapsed
                  :value 2}]
                (lists-to-vecs-recursively (:row-tree result)))
               "Row tree should have correct collapsed state for node with value 1 only"))

         ;; Test collapsing a specific nested path
         (let [settings {:pivot_table.collapsed_rows {:value ["[1,\"A\"]"]}}
               result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]

           (is (=?
                [{:children [{:children [] :isCollapsed true :value "A"} ;; Only [1,"A"] should be collapsed
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed false
                  :value 1}
                 {:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed false
                  :value 2}]
                (lists-to-vecs-recursively (:row-tree result)))
               "Row tree should have correct collapsed state for nested path [1,\"A\"]"))

         ;; Test collapsing multiple specific paths
         (let [settings {:pivot_table.collapsed_rows {:value ["[1,\"A\"]", "[2,\"B\"]"]}}
               result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]

           (is (=?
                [{:children [{:children [] :isCollapsed true :value "A"} ;; [1,"A"] should be collapsed
                             {:children [] :isCollapsed false :value "B"}]
                  :isCollapsed false
                  :value 1}
                 {:children [{:children [] :isCollapsed false :value "A"}
                             {:children [] :isCollapsed true :value "B"}] ;; [2,"B"] should be collapsed
                  :isCollapsed false
                  :value 2}]
                (lists-to-vecs-recursively (:row-tree result)))
               "Row tree should have correct collapsed state for multiple specific paths"))))))

#?(:cljs
   (deftest build-pivot-trees-collapsed-rows-type-coherence-test
     (testing "build-pivot-trees correctly associates values in the viz settings with values from the QP"
       ;; Use BigInts and BigDecimals in the raw rows and ensure the collapsed_rows setting still applies
       (let [rows [[1N "A" "Y" 0 10]
                   [1N "B" "Z" 0 20]
                   [2.5M "A" "Y" 0 30]
                   [2.5M "B" "Z" 0 40]]
             cols [{:name "col0" :source "breakout"}
                   {:name "col1" :source "breakout"}
                   {:name "col2" :source "breakout"}
                   {:name "pivot-grouping" :source "breakout"}
                   {:name "count" :source "aggregation"}]
             row-indexes [0 1]
             col-indexes [2]
             val-indexes [4]
             col-settings [{} {} {} {} {}]
             settings {:pivot_table.collapsed_rows {:value ["[1]"]}}
             result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]
         (is (=?
              [{:children [{:children [] :isCollapsed false :value "A"}
                           {:children [] :isCollapsed false :value "B"}]
                :isCollapsed true ;; Only the node with value 1 should be collapsed
                :value 1}
               {:children [{:children [] :isCollapsed false :value "A"}
                           {:children [] :isCollapsed false :value "B"}]
                :isCollapsed false ;; Node with value 2 should not be collapsed
                :value 2.5}]
              (lists-to-vecs-recursively (:row-tree result))))))))

#?(:cljs
   (deftest build-pivot-trees-non-existant-paths
     (testing "build-pivot-trees does not collapse paths from the viz settings that are not present in the tree (#57054)"
       (let [rows [[1 "A" "Y" 0 10]
                   [1 "B" "Z" 0 20]
                   [2 "A" "Y" 0 30]
                   [2 "B" "Z" 0 40]]
             cols [{:name "col0" :source "breakout"}
                   {:name "col1" :source "breakout"}
                   {:name "col2" :source "breakout"}
                   {:name "pivot-grouping" :source "breakout"}
                   {:name "count" :source "aggregation"}]
             row-indexes [0 1]
             col-indexes [2]
             val-indexes [4]
             col-settings [{} {} {} {} {}]
             ;; Specify paths that do not exist in the data
             settings {:pivot_table.collapsed_rows {:value ["[3]" "[1,\"C\"]"]}}
             result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes settings col-settings)]
         (is (=?
              [{:children [{:children [] :isCollapsed false :value "A"}
                           {:children [] :isCollapsed false :value "B"}]
                :isCollapsed false
                :value 1}
               {:children [{:children [] :isCollapsed false :value "A"}
                           {:children [] :isCollapsed false :value "B"}]
                :isCollapsed false
                :value 2}]
              (lists-to-vecs-recursively (:row-tree result)))
             "Row tree should not have any collapsed nodes for paths that don't exist in the data")))))

(deftest build-pivot-trees-sort-trees-test
  (let [rows [[1 "A" "Y" 0 10]
              [1 "B" "Z" 0 20]
              [2 "A" "Y" 0 30]
              [2 "B" "Z" 0 40]]
        cols [{:name "col0" :source "breakout"}
              {:name "col1" :source "breakout"}
              {:name "col2" :source "breakout"}
              {:name "pivot-grouping" :source "breakout"}
              {:name "count" :source "aggregation"}]
        row-indexes [0 1]
        col-indexes [2]
        val-indexes [4]]
    (testing "ascending sort order for first column"
      (let [result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes {}
                                            [{:pivot_table.column_sort_order "ascending"} {} {} {} {}])]
        (is (=? [{:value 1
                  :children [{:value "A"} {:value "B"}]}
                 {:value 2
                  :children [{:value "A"} {:value "B"}]}]
                (lists-to-vecs-recursively (:row-tree result))))))

    (testing "descending sort order for first column"
      (let [result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes {}
                                            [{:pivot_table.column_sort_order "descending"} {} {} {} {}])]
        (is (=? [{:value 2
                  :children [{:value "A"} {:value "B"}]}
                 {:value 1
                  :children [{:value "A"} {:value "B"}]}]
                (lists-to-vecs-recursively (:row-tree result))))))

    (testing "descending sort order for first two columns"
      (let [result (pivot/build-pivot-trees rows cols row-indexes col-indexes val-indexes {}
                                            [{:pivot_table.column_sort_order "descending"}
                                             {:pivot_table.column_sort_order "descending"}
                                             {} {} {}])]
        (is (=? [{:value 2
                  :children [{:value "B"} {:value "A"}]}
                 {:value 1
                  :children [{:value "B"} {:value "A"}]}]
                (lists-to-vecs-recursively (:row-tree result))))))))

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
      (is (=? [{:value "A"
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

#?(:cljs
   (deftest format-values-in-tree-converts-collections-to-js-test
     (testing "format-values-in-tree converts Clojure collections to JavaScript before formatting"
       (testing "Converts vectors to JavaScript arrays"
         (let [received-values (atom [])
               mock-formatter (fn [v]
                                (swap! received-values conj v)
                                (str "formatted: " v))
               tree [{:value [1 2 3] :children []}]
               formatters [mock-formatter]
               cols [{:name "col0"}]
               col-indexes [0]
               result (#'pivot/format-values-in-tree tree formatters cols col-indexes)]
           (is (= 1 (count @received-values))
               "Formatter should be called once")
           (is (array? (first @received-values))
               "Formatter should receive a JavaScript array, not a Clojure vector")
           (is (= [1 2 3] (vec (first @received-values)))
               "JavaScript array should contain the correct values")
           (is (= "formatted: 1,2,3" (:value (first result)))
               "Result should contain the formatted value")))
       (testing "Converts maps to JavaScript objects"
         (let [received-values (atom [])
               mock-formatter (fn [v]
                                (swap! received-values conj v)
                                (str "formatted: " (pr-str v)))
               tree [{:value {:a 1 :b 2} :children []}]
               formatters [mock-formatter]
               cols [{:name "col0"}]
               col-indexes [0]]
           (#'pivot/format-values-in-tree tree formatters cols col-indexes)
           (is (= 1 (count @received-values))
               "Formatter should be called once")
           (is (object? (first @received-values))
               "Formatter should receive a JavaScript object, not a Clojure map")
           (is (= 1 (.-a (first @received-values)))
               "JavaScript object should have correct property 'a'")
           (is (= 2 (.-b (first @received-values)))
               "JavaScript object should have correct property 'b'")))
       (testing "Does not convert non-collection values"
         (let [received-values (atom [])
               mock-formatter (fn [v]
                                (swap! received-values conj v)
                                (str "formatted: " v))
               tree [{:value "string-value" :children []}
                     {:value 42 :children []}
                     {:value nil :children []}]
               formatters [mock-formatter mock-formatter mock-formatter]
               cols [{:name "col0"} {:name "col1"} {:name "col2"}]
               col-indexes [0 1 2]]
           (#'pivot/format-values-in-tree tree formatters cols col-indexes)
           (is (= 3 (count @received-values))
               "Formatter should be called three times")
           (is (= "string-value" (first @received-values))
               "String values should be passed through without conversion")
           (is (= 42 (second @received-values))
               "Number values should be passed through without conversion")
           (is (nil? (nth @received-values 2))
               "Nil values should be passed through without conversion")))
       (testing "Handles nested collections recursively"
         (let [received-values (atom [])
               mock-formatter (fn [v]
                                (swap! received-values conj v)
                                "formatted")
               tree [{:value [1 2]
                      :children [{:value {:x 10} :children []}]}]
               formatters [mock-formatter mock-formatter]
               cols [{:name "col0"} {:name "col1"}]
               col-indexes [0 1]]
           (#'pivot/format-values-in-tree tree formatters cols col-indexes)
           (is (= 2 (count @received-values))
               "Formatter should be called for both parent and child")
           (is (array? (first @received-values))
               "Parent formatter should receive a JavaScript array")
           (is (object? (second @received-values))
               "Child formatter should receive a JavaScript object"))))))

#?(:clj
   (deftest ^:parallel ensure-is-int-test
     (testing "ensure-is-int properly converts different numeric types for bitwise operations"
       (testing "Should handle regular integers"
         (is (= 5 (#'pivot/ensure-is-int 5)))
         (is (= 0 (#'pivot/ensure-is-int 0)))
         (is (= 7 (#'pivot/ensure-is-int 7))))

       (testing "Should handle long values"
         (is (= 5 (#'pivot/ensure-is-int 5N)))
         (is (= 0 (#'pivot/ensure-is-int 0N)))
         (is (= 7 (#'pivot/ensure-is-int 7N))))

       (testing "Should convert BigDecimal values that are losslessly convertible to int"
         (is (= 5 (#'pivot/ensure-is-int (BigDecimal. "5"))))
         (is (= 0 (#'pivot/ensure-is-int (BigDecimal. "0"))))
         (is (= 7 (#'pivot/ensure-is-int (BigDecimal. "7"))))
         (is (= 123 (#'pivot/ensure-is-int (BigDecimal. "123"))))

         ;; Test with explicitly integer-valued BigDecimals
         (is (= 5 (#'pivot/ensure-is-int (BigDecimal. "5.0"))))
         (is (= 42 (#'pivot/ensure-is-int (BigDecimal. "42.00")))))

       (testing "Should handle edge cases"
         ;; Test with maximum int value as BigDecimal
         (is (= Integer/MAX_VALUE
                (#'pivot/ensure-is-int (BigDecimal. (str Integer/MAX_VALUE)))))

         ;; Test with zero as BigDecimal
         (is (= 0 (#'pivot/ensure-is-int BigDecimal/ZERO))))
       (testing "Should throw if it has decimal places"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Non-Integer cannot be used as pivot-grouping column"
                               (#'pivot/ensure-is-int (BigDecimal. "42.11")))))
       (testing "Should throw if not convertible"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Non-Integer cannot be used as pivot-grouping column"
                               (#'pivot/ensure-is-int "1232")))))))

#?(:clj
   (deftest ^:parallel bigdecimal-bitwise-operations-integration-test
     (testing "Full integration test showing BigDecimal pivot-grouping values work through the bitwise pipeline"
       (testing "Bitwise operations work correctly after ensure-is-int conversion"
         (let [pivot-group-bigdecimal (BigDecimal. "5") ; binary: 101
               pivot-group-int 5 ; same value as int
               num-breakouts 3]

           (doseq [bit-index (range num-breakouts)]
             (let [bit-mask (bit-shift-left 1 bit-index)
                   bigdecimal-result (bit-and bit-mask (#'pivot/ensure-is-int pivot-group-bigdecimal))
                   int-result (bit-and bit-mask pivot-group-int)]
               (is (= int-result bigdecimal-result)
                   (str "Bitwise AND with bit-mask " bit-mask " should be same for BigDecimal and int"))))

           ;; Test the full active breakout logic
           (is (= (#'pivot/get-active-breakout-indexes pivot-group-int num-breakouts)
                  (#'pivot/get-active-breakout-indexes pivot-group-bigdecimal num-breakouts))
               "get-active-breakout-indexes should return same result for BigDecimal and int")))

       (testing "Works with decimal representations that are integers"
         (let [pivot-group-decimal (BigDecimal. "3.0") ; Should convert to 3
               pivot-group-int 3
               num-breakouts 3]

           (is (= (#'pivot/get-active-breakout-indexes pivot-group-int num-breakouts)
                  (#'pivot/get-active-breakout-indexes pivot-group-decimal num-breakouts))
               "BigDecimal with .0 should work same as integer")))

       (testing "Handles edge case BigDecimal values"
         (is (= [0 1 2]
                (#'pivot/get-active-breakout-indexes BigDecimal/ZERO 3))
             "BigDecimal/ZERO should work like integer 0")

         (is (= [1 2]
                (#'pivot/get-active-breakout-indexes BigDecimal/ONE 3))
             "BigDecimal/ONE should work like integer 1")))

     (testing "Memoization works correctly with BigDecimal values"
       (let [pivot-group (BigDecimal. "6")
             num-breakouts 3
             first-call (#'pivot/get-active-breakout-indexes pivot-group num-breakouts)
             second-call (#'pivot/get-active-breakout-indexes pivot-group num-breakouts)]

         (is (= first-call second-call))
         (is (= [0] first-call) "pivot-group 6 with 3 breakouts should return [0]")

         (let [equivalent-pivot-group (BigDecimal. "6.0")
               third-call (#'pivot/get-active-breakout-indexes equivalent-pivot-group num-breakouts)]
           (is (= first-call third-call) "Equivalent BigDecimal values should return same result"))))))
