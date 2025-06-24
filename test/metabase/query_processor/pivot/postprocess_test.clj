(ns metabase.query-processor.pivot.postprocess-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.pivot.postprocess :as pivot.postprocess]))

(deftest build-top-headers-test
  (testing "builds top headers with single level hierarchy"
    (let [top-left-header ["Row"]
          top-header-items [{:depth 0 :value "A" :span 2}
                            {:depth 0 :value "B" :span 1}]
          result (#'pivot.postprocess/build-top-headers top-left-header top-header-items)]
      (is (= [["Row" "A" "A" "B"]]
             result))))

  (testing "builds top headers with multi-level hierarchy"
    (let [top-left-header ["Row1", "Row2"]
          top-header-items [{:depth 0 :value "A" :span 2}
                            {:depth 1 :value "X" :span 1}
                            {:depth 1 :value "Y" :span 1}
                            {:depth 0 :value "B" :span 1}
                            {:depth 1 :value "Z" :span 1}]
          result (#'pivot.postprocess/build-top-headers top-left-header top-header-items)]
      (is (= [[nil nil "A" "A" "B"]
              ["Row1" "Row2" "X" "Y" "Z"]]
             result))))

  (testing "handles empty top header items withotu error"
    (let [top-left-header ["Row"]
          top-header-items []
          result (#'pivot.postprocess/build-top-headers top-left-header top-header-items)]
      (is (= [["Row"]]
             result)))))

(deftest build-left-headers-test
  (testing "builds left headers with single level hierarchy"
    (let [left-header-items [{:depth 0 :value "A" :span 1 :offset 0}
                             {:depth 0 :value "B" :span 1 :offset 1}]
          result (#'pivot.postprocess/build-left-headers left-header-items)]
      (is (= [["A"]
              ["B"]]
             result))))

  (testing "builds left headers with multi-level hierarchy"
    (let [left-header-items [{:depth 0 :value "A" :span 2 :offset 0}
                             {:depth 1 :value "X" :span 1 :offset 0}
                             {:depth 1 :value "Y" :span 1 :offset 1}
                             {:depth 0 :value "B" :span 1 :offset 2}
                             {:depth 1 :value "Z" :span 1 :offset 2}]
          result (#'pivot.postprocess/build-left-headers left-header-items)]
      (is (= [["A" "X"]
              ["A" "Y"]
              ["B" "Z"]]
             result))))

  (testing "handles empty left header items without error"
    (let [left-header-items []
          result (#'pivot.postprocess/build-left-headers left-header-items)]
      (is (= []
             result)))))

(deftest build-full-pivot-test
  (testing "builds full pivot table correctly"
    (let [get-row-section (fn [col-idx row-idx]
                            (case [col-idx row-idx]
                              [0 0] [{:value "100"}]
                              [0 1] [{:value "200"}]
                              [1 0] [{:value "300"}]
                              [1 1] [{:value "400"}]
                              []))
          left-headers [["Row A"]
                        ["Row B"]]
          top-headers [["" "Col X" "Col Y"]]
          measure-count 1
          result (#'pivot.postprocess/build-full-pivot get-row-section left-headers top-headers measure-count)]
      (is (= [["" "Col X" "Col Y"]
              ["Row A" "100" "300"]
              ["Row B" "200" "400"]]
             result))))

  (testing "handles multiple measures per column"
    (let [get-row-section (fn [col-idx row-idx]
                            (case [col-idx row-idx]
                              [0 0] [{:value "100"} {:value "101"}]
                              [0 1] [{:value "200"} {:value "201"}]
                              [1 0] [{:value "300"} {:value "301"}]
                              [1 1] [{:value "400"} {:value "401"}]
                              []))
          left-headers [["Row A"]
                        ["Row B"]]
          top-headers [["" "Col X" "Col X" "Col Y" "Col Y"]]
          measure-count 2
          result (#'pivot.postprocess/build-full-pivot get-row-section left-headers top-headers measure-count)]
      (is (= [["" "Col X" "Col X" "Col Y" "Col Y"]
              ["Row A" "100" "101" "300" "301"]
              ["Row B" "200" "201" "400" "401"]]
             result))))

  (testing "handles empty left headers without error"
    (let [get-row-section (fn [col-idx row-idx]
                            (case [col-idx row-idx]
                              [0 0] [{:value "100"}]
                              []))
          left-headers []
          top-headers [["" "Col X"]]
          measure-count 1
          result (#'pivot.postprocess/build-full-pivot get-row-section left-headers top-headers measure-count)]
      (is (= [["" "Col X"]
              ["100"]]
             result))))

  (testing "handles no values in row sections without error"
    (let [get-row-section (constantly [])
          left-headers [["Row A"]]
          top-headers [["" "Col X"]]
          measure-count 1
          result (#'pivot.postprocess/build-full-pivot get-row-section left-headers top-headers measure-count)]
      (is (= [["" "Col X"]
              ["Row A"]]
             result)))))
