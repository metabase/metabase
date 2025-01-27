(ns metabase.query-processor.pivot.postprocess-test
  (:require
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [metabase.query-processor.pivot.postprocess :as process]))

(def ^:private column-titles
  ["A" "B" "C" "D" "pivot-grouping" "MEASURE"])

(def ^:private pivot-spec
  {:pivot-rows [2 3]
   :pivot-cols [0 1]
   :column-titles column-titles})

(deftest assoc-in-path-tree-test
  (testing "Values are correctly assoc'ed into a path tree, maintaining insertion order at every level"
    (let [base-tree (#'process/add-to-path-tree (ordered-map/ordered-map) [:a :b :c :d])]
      ;; Assert on strings because direct map/set comparison doesn't preserve order, but strings do
      (is (= "{:a {:b {:c #{:d}}}}" (str base-tree)))
      (is (= "{:a {:b {:c #{:d :e}}}}"
             (str (#'process/add-to-path-tree base-tree [:a :b :c :e]))))
      (is (= "{:a {:b {:c #{:d :c}}}}"
             (str (#'process/add-to-path-tree base-tree [:a :b :c :c]))))
      (is (= "{:a {:b {:c #{:d}}, :e {:f #{:g}}}}"
             (str (#'process/add-to-path-tree base-tree [:a :e :f :g]))))
      (is (= "{:a {:b {:c #{:d}}, :a {:f #{:g}}}}"
             (str (#'process/add-to-path-tree base-tree [:a :a :f :g]))))))

  (testing "Assoc'ing a value with no key to an ordered map converts it to a top-level ordered set"
    (let [new-tree (#'process/add-to-path-tree (ordered-map/ordered-map) [:a])]
      (is (= [:a] (seq new-tree))))

    (let [new-tree (#'process/add-to-path-tree (ordered-set/ordered-set :b) [:a])]
      (is (= [:b :a] (seq new-tree))))))

(deftest sort-path-tree-test
  (testing "sort-path-tree with ascending and descending orders using integer indices in sort-orders"
    (let [tree (ordered-map/ordered-map
                :a (ordered-set/ordered-set 3 1 2)
                :b (ordered-map/ordered-map
                    :x (ordered-set/ordered-set 5 4 6)
                    :y (ordered-set/ordered-set 8 7 9)))
          sort-orders {0 :ascending
                       1 :descending}
          result (#'process/sort-path-tree tree [0 1] sort-orders)]
      ;; Assert top-level keys are in ascending order
      (is (= [:a :b] (keys result)))
      ;; Assert second-level values in :a are in descending order
      (is (= [3 2 1] (seq (get result :a))))
      ;; Assert nested keys (:x, :y) in :b are in descending order
      (is (= [:y :x] (keys (get result :b))))
      ;; Assert :x and :y sets remain unsorted (no specific sort order provided for them)
      (is (= [5 4 6] (seq (get-in result [:b :x]))))
      (is (= [8 7 9] (seq (get-in result [:b :y]))))))

  (testing "sort-path-tree with no sort order provided"
    (let [tree (ordered-map/ordered-map
                :a (ordered-set/ordered-set 3 1 2)
                :b (ordered-map/ordered-map
                    :x (ordered-set/ordered-set 5 4 6)))
          sort-orders {}
          result (#'process/sort-path-tree tree [0 1] sort-orders)]
      ;; Ensure the original tree structure remains intact
      (is (= (str tree) (str result)))))

  (testing "sort-path-tree with nil input"
    (is (nil? (#'process/sort-path-tree nil [] {})))))

(deftest enumerate-paths-test
  (testing "enumerate-paths with nested maps and sets"
    (let [tree (ordered-map/ordered-map
                :a (ordered-map/ordered-map
                    :w (ordered-set/ordered-set 1 2)
                    :x (ordered-set/ordered-set 2 1)))]
      (is (= [[:a :w 1]
              [:a :w 2]
              [:a :x 2]
              [:a :x 1]]
             (#'process/enumerate-paths tree)))))

  (testing "enumerate-paths with a single-level set"
    (let [tree (ordered-set/ordered-set 1 2 3)]
      (is (= [[1] [2] [3]]
             (#'process/enumerate-paths tree)))))

  (testing "enumerate-paths with empty input"
    (is (= [] (#'process/enumerate-paths {})))))

(deftest add-pivot-measures-test
  (testing "Given a `pivot-spec` without `:pivot-measures`, add them."
    (is (= [5] (:pivot-measures (process/add-pivot-measures pivot-spec))))))

(deftest pivot-aggregation-test
  (testing "The pivot aggregation datastructure stores values as expected"
    (let [pivot-config {:pivot-rows     [0]
                        :pivot-cols     [1]
                        :column-titles  ["A" "B" "pivot-grouping" "Count"]
                        :row-totals?    true
                        :col-totals?    true
                        :pivot-measures [3]
                        :pivot-grouping 2}
          pivot        (process/init-pivot pivot-config)
          pivot-data   (reduce process/add-row pivot [["aA" "bA" 0 1] ; add 4 rows in aA bA
                                                      ["aA" "bA" 0 1]
                                                      ["aA" "bA" 0 1]
                                                      ["aA" "bA" 0 1]
                                                      ["aA" "bB" 0 1]
                                                      ["aA" "bC" 0 1]
                                                      ["aA" "bD" 0 1]
                                                      ["aB" "bA" 0 1]
                                                      ["aB" "bB" 0 1]
                                                      ["aB" "bC" 0 1]
                                                      ["aB" "bD" 0 1]])]
      (testing "data aggregation matches the input rows"
        ;; Every row will contribute to the MEASURE somewhere, determined by
        ;; the values in each pivot-row and pivot-col index. For example,
        ;; given the pivot-config in this test, the row `["X" "Y" 0 1]` will end up adding
        ;; {"X" {"Y" {3 {:result 1}}}}
        ;; the operation is essentially an assoc-in done per measure:

        ;;   assoc-in    path from rows cols and measures            value from measure idx
        ;; `(assoc-in (concat pivot-rows pivot-cols pivot-measures) (get-in row measure-idx))`
        (is (= {"aA" {"bA" {3 {:result 4}}
                      "bB" {3 {:result 1}}
                      "bC" {3 {:result 1}}
                      "bD" {3 {:result 1}}}
                "aB" {"bA" {3 {:result 1}}
                      "bB" {3 {:result 1}}
                      "bC" {3 {:result 1}}
                      "bD" {3 {:result 1}}}}
               (:data pivot-data)))

        ;; Distinct values of rows and columns are built into a tree composed of ordered maps and sets. If there is only
        ;; one row/col, it is stored as an ordered set at the top-level.
        (is (= {:row-paths #{"aA" "aB"}
                :col-paths #{"bA" "bB" "bC" "bD"}}
               (select-keys pivot-data [:row-paths :col-paths])))
        (is (= flatland.ordered.set.OrderedSet (type (:row-paths pivot-data))))
        (is (= flatland.ordered.set.OrderedSet (type (:col-paths pivot-data))))

        ;; since everything is aggregated as a row is added, we can store all of the
        ;; relevant totals right away and use them to construct the pivot table totals
        ;; if the user has specified them on (they're on by default and likely to be on most of the time)
        (is (= {:grand-total {3 {:result 11}}
                :section-totals {"aA" {3 {:result 7}} "aB" {3 {:result 4}}} ;; section refers to the 'row totals' interspersed between each row-wise group
                :column-totals {:rows-part
                                {"aA" {:cols-part {"bA" {3 {:result 4}}
                                                   "bB" {3 {:result 1}}
                                                   "bC" {3 {:result 1}}
                                                   "bD" {3 {:result 1}}}}
                                 "aB" {:cols-part {"bA" {3 {:result 1}}
                                                   "bB" {3 {:result 1}}
                                                   "bC" {3 {:result 1}}
                                                   "bD" {3 {:result 1}}}}}}
                "aA" {3 {:result 7}}
                "aB" {3 {:result 4}}
                "bC" {3 {:result 2}}
                "bB" {3 {:result 2}}
                "bD" {3 {:result 2}}
                "bA" {3 {:result 5}}}
               (:totals pivot-data)))))))

(deftest pivot-aggregation-no-collisions-test
  (testing "The pivot aggregation datastructure stores values as expected"
    (let [pivot-config {:pivot-rows     [0 1]
                        :pivot-cols     [2]
                        :column-titles  ["A" "B" "pivot-grouping" "Count"]
                        :row-totals?    true
                        :col-totals?    true
                        :pivot-measures [4]
                        :pivot-grouping 3}
          pivot        (process/init-pivot pivot-config)
          pivot-data   (reduce process/add-row pivot [["aA" 11 1  0 1]
                                                      ["aA" 10 2  0 1]
                                                      ["aA"  9 3  0 1]
                                                      ["aA"  8 4  0 1]
                                                      ["aA"  7 5  0 1]
                                                      ["aA"  6 6  0 1]
                                                      ["aA"  5 7  0 1]
                                                      ["aB"  4 8  0 1]
                                                      ["aB"  3 9  0 1]
                                                      ["aB"  2 10 0 1]
                                                      ["aB"  1 11 0 1]])]
      pivot-data)))

(deftest add-rows-and-totals-test
  (testing "Adding Rows produces the correct entries in :totals without 'collisions' on any indices. (#50207)"
    (let [build-row           #'process/build-row
          build-column-totals #'process/build-column-totals
          pivot-config        {:pivot-rows     [0 1]
                               :pivot-cols     [2]
                               :column-titles  ["A" "B" "C" "pivot-grouping" "Sum of MEASURE"]
                               :row-totals?    true
                               :col-totals?    true
                               :pivot-measures [4]
                               :pivot-grouping 3}
          pivot               (process/init-pivot pivot-config)
          rows                [[3 "BA" 3 0 1]
                               [3 "BA" 4 0 2]
                               [4 "BA" 3 0 3]
                               [4 "BA" 4 0 4]]
          pivot-data          (reduce process/add-row pivot rows)]
      (is (= {:data {3 {"BA" {3 {4 {:result 1}}}}},
              :totals
              {:grand-total    {4 {:result 1}},
               3               {"BA" {4 {:result 1}}},
               :section-totals {3 {4 {:result 1}}},
               :column-totals  {:rows-part {3 {:cols-part {3 {4 {:result 1}}} "BA" {:cols-part {3 {4 {:result 1}}}}}}}}}
             (select-keys (process/add-row pivot (first rows)) [:data :totals])))
      (is (= {:data   {3 {"BA" {3 {4 {:result 1}}, 4 {4 {:result 2}}}}},
              :totals {:grand-total    {4 {:result 3}},
                       3               {"BA" {4 {:result 3}}},
                       4               {4 {:result 2}},
                       :section-totals {3 {4 {:result 3}}},
                       :column-totals  {:rows-part
                                        {3 {:cols-part {3 {4 {:result 1}},
                                                        4 {4 {:result 2}}},
                                            "BA"       {:cols-part {3 {4 {:result 1}},
                                                                    4 {4 {:result 2}}}}}}}}}
             (select-keys (reduce process/add-row pivot (take 2 rows)) [:data :totals])))
      (is (= [4 "BA" 3 4 7]
             (build-row [4 "BA"]
                        [[3] [4]]
                        [4]
                        (:data pivot-data)
                        (:totals pivot-data)
                        true
                        (repeat 5 identity)
                        (repeat 2 identity)
                        pivot-config)))
      (is (= ["Totals for 4" nil 3 4 7]
             (build-column-totals [4]
                                  [[3] [4]]
                                  [4]
                                  (:totals pivot-data)
                                  true
                                  (repeat 5 identity)
                                  [0 1]
                                  [2]))))))
