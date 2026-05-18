(ns metabase.explorations.interestingness-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.interestingness :as explorations.interestingness]))

(defn- result
  [cols rows]
  {:data {:cols cols :rows rows}})

(defn- query
  ([] (query nil))
  ([display] {:name "metric by dim" :display display}))

(deftest temporal-x-numeric-y-test
  (testing "datetime x + numeric y produces a single-series chart-config"
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "month" :base_type :type/DateTime :display_name "Month"}
                        {:name "count" :base_type :type/Integer :display_name "Count"}]
                       [["2026-01-01" 10] ["2026-02-01" 20] ["2026-03-01" 30]]))]
      (is (= "line" (:display_type cfg)))
      (is (= "metric by dim" (:title cfg)))
      (is (= ["Count"] (vec (keys (:series cfg)))))
      (let [s (get (:series cfg) "Count")]
        (is (= "datetime" (-> s :x :type)))
        (is (= "number"   (-> s :y :type)))
        (is (= ["2026-01-01" "2026-02-01" "2026-03-01"] (:x_values s)))
        (is (= [10 20 30] (:y_values s)))
        (is (= "Count" (:display_name s)))))))

(deftest categorical-x-integer-y-test
  (let [cfg (explorations.interestingness/qp-result->chart-config
             (query "bar")
             (result [{:name "category" :base_type :type/Text}
                      {:name "total"    :base_type :type/Integer}]
                     [["A" 1] ["B" 2]]))]
    (is (= "string" (-> cfg :series (get "total") :x :type)))
    (is (= "number" (-> cfg :series (get "total") :y :type)))))

(deftest date-vs-datetime-test
  (testing ":type/Date maps to \"date\""
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "d" :base_type :type/Date}
                        {:name "n" :base_type :type/Float}]
                       [["2026-01-01" 1.0]]))]
      (is (= "date" (-> cfg :series vals first :x :type)))))
  (testing ":type/DateTime maps to \"datetime\""
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "d" :base_type :type/DateTime}
                        {:name "n" :base_type :type/Float}]
                       [["2026-01-01T00:00" 1.0]]))]
      (is (= "datetime" (-> cfg :series vals first :x :type))))))

(deftest boolean-x-test
  (let [cfg (explorations.interestingness/qp-result->chart-config
             (query "bar")
             (result [{:name "b" :base_type :type/Boolean}
                      {:name "n" :base_type :type/Integer}]
                     [[true 1] [false 2]]))]
    (is (= "boolean" (-> cfg :series vals first :x :type)))))

(deftest effective-type-wins-over-base-type-test
  (testing "When effective_type and base_type disagree, effective_type drives the chart-type"
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "iso" :base_type :type/Text :effective_type :type/DateTime}
                        {:name "n"   :base_type :type/Integer}]
                       [["2026-01-01T00:00" 1]]))]
      (is (= "datetime" (-> cfg :series vals first :x :type))))))

(deftest nil-filtering-preserves-alignment-test
  (testing "Rows with nil metric value are dropped; surviving x and y stay aligned"
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "d" :base_type :type/Date}
                        {:name "n" :base_type :type/Integer}]
                       [["a" 1] ["b" nil] ["c" 3] ["d" nil] ["e" 5]]))
          s   (-> cfg :series vals first)]
      (is (= ["a" "c" "e"] (:x_values s)))
      (is (= [1 3 5] (:y_values s))))))

(deftest empty-rows-returns-nil-test
  (is (nil? (explorations.interestingness/qp-result->chart-config
             (query "line")
             (result [{:name "d" :base_type :type/Date}
                      {:name "n" :base_type :type/Integer}]
                     [])))))

(deftest no-numeric-column-returns-nil-test
  (is (nil? (explorations.interestingness/qp-result->chart-config
             (query "bar")
             (result [{:name "a" :base_type :type/Text}
                      {:name "b" :base_type :type/Text}]
                     [["x" "y"]])))))

(deftest all-rows-non-numeric-y-returns-nil-test
  (testing "Numeric-typed col but every row's value is nil → nothing to score"
    (is (nil? (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "d" :base_type :type/Date}
                        {:name "n" :base_type :type/Integer}]
                       [["a" nil] ["b" nil]]))))))

(deftest display-fallback-test
  (testing "Nil display falls back to \"line\" for temporal x"
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query nil)
               (result [{:name "d" :base_type :type/Date}
                        {:name "n" :base_type :type/Integer}]
                       [["2026-01-01" 1]]))]
      (is (= "line" (:display_type cfg)))))
  (testing "Nil display falls back to \"bar\" for categorical x"
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query nil)
               (result [{:name "c" :base_type :type/Text}
                        {:name "n" :base_type :type/Integer}]
                       [["a" 1]]))]
      (is (= "bar" (:display_type cfg)))))
  (testing "\"table\" and \"scalar\" are also overridden"
    (doseq [d ["table" "scalar" "smartscalar"]]
      (let [cfg (explorations.interestingness/qp-result->chart-config
                 (query d)
                 (result [{:name "d" :base_type :type/DateTime}
                          {:name "n" :base_type :type/Integer}]
                         [["2026-01-01T00:00" 1]]))]
        (is (= "line" (:display_type cfg))
            (str "display=" d " should fall back to line for temporal x"))))))

(deftest series-keys-are-strings-test
  (let [cfg (explorations.interestingness/qp-result->chart-config
             (query "bar")
             (result [{:name "c" :base_type :type/Text}
                      {:name "n" :base_type :type/Integer}]
                     [["a" 1]]))]
    (is (every? string? (keys (:series cfg))))))

(deftest three-col-faceted-line-test
  (testing "categorical + temporal + numeric produces one line series per category, with display=line"
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "segment" :base_type :type/Text       :display_name "Segment"}
                        {:name "month"   :base_type :type/DateTime   :display_name "Month"}
                        {:name "rev"     :base_type :type/Integer    :display_name "Revenue"}]
                       [["NA" "2026-01-01" 100]
                        ["NA" "2026-02-01" 110]
                        ["EU" "2026-01-01" 80]
                        ["EU" "2026-02-01" 90]]))]
      (is (= "line" (:display_type cfg)))
      (is (= #{"NA" "EU"} (set (keys (:series cfg)))))
      (let [na (get (:series cfg) "NA")
            eu (get (:series cfg) "EU")]
        (is (= "datetime" (-> na :x :type)))
        (is (= "number"   (-> na :y :type)))
        (is (= "Month"    (-> na :x :name)))
        (is (= "Revenue"  (-> na :y :name)))
        (is (= ["2026-01-01" "2026-02-01"] (:x_values na)))
        (is (= [100 110] (:y_values na)))
        (is (= ["2026-01-01" "2026-02-01"] (:x_values eu)))
        (is (= [80 90] (:y_values eu)))
        (is (= "NA" (:display_name na)))))))

(deftest three-col-nil-category-collapses-test
  (testing "nil categorical values collapse into a single \"(empty)\" series"
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "segment" :base_type :type/Text}
                        {:name "month"   :base_type :type/DateTime}
                        {:name "n"       :base_type :type/Integer}]
                       [[nil "2026-01-01" 1]
                        [nil "2026-02-01" 2]
                        ["A" "2026-01-01" 3]]))]
      (is (= #{"(empty)" "A"} (set (keys (:series cfg)))))
      (is (= [1 2] (:y_values (get (:series cfg) "(empty)"))))
      (is (= [3]   (:y_values (get (:series cfg) "A")))))))

(deftest three-col-non-temporal-second-col-returns-nil-test
  (testing "3-col result without a temporal column can't be faceted-over-time → nil"
    (is (nil? (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "a" :base_type :type/Text}
                        {:name "b" :base_type :type/Text}
                        {:name "n" :base_type :type/Integer}]
                       [["x" "y" 1]]))))))

(deftest three-col-non-numeric-rows-dropped-test
  (testing "rows with non-numeric metric values are dropped before grouping"
    (let [cfg (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "segment" :base_type :type/Text}
                        {:name "month"   :base_type :type/DateTime}
                        {:name "n"       :base_type :type/Integer}]
                       [["NA" "2026-01-01" 1]
                        ["NA" "2026-02-01" nil]
                        ["NA" "2026-03-01" 3]]))
          na  (get (:series cfg) "NA")]
      (is (= ["2026-01-01" "2026-03-01"] (:x_values na)))
      (is (= [1 3] (:y_values na))))))

(deftest four-or-more-cols-returns-nil-test
  (testing "4+ columns aren't supported"
    (is (nil? (explorations.interestingness/qp-result->chart-config
               (query "line")
               (result [{:name "a" :base_type :type/Text}
                        {:name "b" :base_type :type/DateTime}
                        {:name "c" :base_type :type/Text}
                        {:name "n" :base_type :type/Integer}]
                       [["x" "2026-01-01" "y" 1]]))))))
