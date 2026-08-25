(ns metabase.explorations.interestingness-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]))

(defn- lib-col
  "Build a Lib `:metadata/column`-shaped map for tests. Asserts the keys the chart-config logic
  actually reads off — `:lib/type` so lib dispatchers (raw-temporal-bucket, binning, isa
  predicates) resolve correctly, kebab-case `:base-type` / `:effective-type` / `:display-name`,
  plus `:lib/temporal-unit` and `:lib/binning` for buckets/binning."
  [m]
  (merge {:lib/type :metadata/column} m))

(defn- query
  ([] (query nil))
  ([display] {:name "metric by dim" :display display}))

(deftest temporal-x-numeric-y-test
  (testing "datetime x + numeric y produces a single-series chart-config"
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "month" :base-type :type/DateTime :display-name "Month"})
                (lib-col {:name "count" :base-type :type/Integer :display-name "Count"})]
               [["2026-01-01" 10] ["2026-02-01" 20] ["2026-03-01" 30]])]
      (is (= "line" (:display_type cfg)))
      (is (= "metric by dim" (:title cfg)))
      (is (= ["Count"] (vec (keys (:series cfg)))))
      (let [s (get (:series cfg) "Count")]
        (is (= "datetime" (-> s :x :type)))
        (is (= "number"   (-> s :y :type)))
        (is (= ["2026-01-01" "2026-02-01" "2026-03-01"] (:x_values s)))
        (is (= [10 20 30] (:y_values s)))
        (is (= "Count" (:display_name s)))))))

(defn- dow-x-values [loc]
  (binding [i18n/*user-locale* loc]
    (-> (explorations.interestingness/chart-config
         (query "bar")
         [(lib-col {:name "survey_date" :base-type :type/Integer :lib/temporal-unit :day-of-week})
          (lib-col {:name "total" :base-type :type/Integer :display-name "Sum of Total Catch"})]
         [[1 100] [2 200] [7 50]])
        :series (get "Sum of Total Catch"))))

(deftest day-of-week-extraction-is-labeled-dimension-test
  (testing "A :day-of-week extraction column is the dimension (not the metric), labeled, axes not swapped"
    (mt/with-temporary-setting-values [start-of-week :sunday]
      (let [s (dow-x-values "en")]
        (is (= "string" (-> s :x :type)) "day-of-week dim rendered as labeled categorical, not numeric")
        (is (= [100 200 50] (:y_values s)) "metric stays on y — axis not swapped")
        (is (every? string? (:x_values s)))
        ;; start-of-week :sunday → 1=Sunday, 2=Monday, 7=Saturday
        (is (= ["Sunday" "Monday" "Saturday"] (:x_values s))))))
  (testing "labels follow the user's locale, not hard-coded English"
    (mt/with-temporary-setting-values [start-of-week :sunday]
      (is (= ["dimanche" "lundi" "samedi"] (:x_values (dow-x-values "fr")))))))

(deftest hour-of-day-extraction-is-labeled-test
  (testing "An :hour-of-day extraction column is treated as the dimension and labeled with a localized time"
    (let [hcfg (fn [loc] (binding [i18n/*user-locale* loc]
                           (-> (explorations.interestingness/chart-config
                                (query "bar")
                                [(lib-col {:name "h" :base-type :type/Integer :lib/temporal-unit :hour-of-day})
                                 (lib-col {:name "n" :base-type :type/Integer})]
                                [[0 5] [13 9]])
                               :series vals first)))
          de   (hcfg "de")]
      (is (= "string" (-> de :x :type)))
      (is (= [5 9] (:y_values de)))
      ;; German uses a 24-hour clock
      (is (= ["00:00" "13:00"] (:x_values de)))
      ;; en-US uses a 12-hour clock — exact AM/PM text varies by JDK, but it must differ from 24h
      (is (not= ["00:00" "13:00"] (:x_values (hcfg "en-US"))) "hour labels follow locale"))))

(deftest truncation-unit-day-stays-temporal-test
  (testing "A :day truncation unit (real date) is unaffected — still datetime, not labeled"
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "d" :base-type :type/DateTime :lib/temporal-unit :day})
                (lib-col {:name "n" :base-type :type/Integer})]
               [["2026-01-01T00:00" 1] ["2026-01-02T00:00" 2]])
          s   (-> cfg :series vals first)]
      (is (= "datetime" (-> s :x :type)))
      (is (= ["2026-01-01T00:00" "2026-01-02T00:00"] (:x_values s))))))

(deftest categorical-x-integer-y-test
  (let [cfg (explorations.interestingness/chart-config
             (query "bar")
             [(lib-col {:name "category" :base-type :type/Text})
              (lib-col {:name "total"    :base-type :type/Integer})]
             [["A" 1] ["B" 2]])]
    (is (= "string" (-> cfg :series (get "total") :x :type)))
    (is (= "number" (-> cfg :series (get "total") :y :type)))))

(deftest date-vs-datetime-test
  (testing ":type/Date maps to \"date\""
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "d" :base-type :type/Date})
                (lib-col {:name "n" :base-type :type/Float})]
               [["2026-01-01" 1.0]])]
      (is (= "date" (-> cfg :series vals first :x :type)))))
  (testing ":type/DateTime maps to \"datetime\""
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "d" :base-type :type/DateTime})
                (lib-col {:name "n" :base-type :type/Float})]
               [["2026-01-01T00:00" 1.0]])]
      (is (= "datetime" (-> cfg :series vals first :x :type))))))

(deftest boolean-x-test
  (let [cfg (explorations.interestingness/chart-config
             (query "bar")
             [(lib-col {:name "b" :base-type :type/Boolean})
              (lib-col {:name "n" :base-type :type/Integer})]
             [[true 1] [false 2]])]
    (is (= "boolean" (-> cfg :series vals first :x :type)))))

(deftest effective-type-wins-over-base-type-test
  (testing "When effective-type and base-type disagree, effective-type drives the chart-type"
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "iso" :base-type :type/Text :effective-type :type/DateTime})
                (lib-col {:name "n"   :base-type :type/Integer})]
               [["2026-01-01T00:00" 1]])]
      (is (= "datetime" (-> cfg :series vals first :x :type))))))

(deftest nil-filtering-preserves-alignment-test
  (testing "Rows with nil metric value are dropped; surviving x and y stay aligned"
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "d" :base-type :type/Date})
                (lib-col {:name "n" :base-type :type/Integer})]
               [["a" 1] ["b" nil] ["c" 3] ["d" nil] ["e" 5]])
          s   (-> cfg :series vals first)]
      (is (= ["a" "c" "e"] (:x_values s)))
      (is (= [1 3 5] (:y_values s))))))

(deftest empty-rows-returns-nil-test
  (is (nil? (explorations.interestingness/chart-config
             (query "line")
             [(lib-col {:name "d" :base-type :type/Date})
              (lib-col {:name "n" :base-type :type/Integer})]
             []))))

(deftest no-numeric-column-returns-nil-test
  (is (nil? (explorations.interestingness/chart-config
             (query "bar")
             [(lib-col {:name "a" :base-type :type/Text})
              (lib-col {:name "b" :base-type :type/Text})]
             [["x" "y"]]))))

(deftest all-rows-non-numeric-y-returns-nil-test
  (testing "Numeric-typed col but every row's value is nil → nothing to score"
    (is (nil? (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "d" :base-type :type/Date})
                (lib-col {:name "n" :base-type :type/Integer})]
               [["a" nil] ["b" nil]])))))

(deftest display-fallback-test
  (testing "Nil display falls back to \"line\" for temporal x"
    (let [cfg (explorations.interestingness/chart-config
               (query nil)
               [(lib-col {:name "d" :base-type :type/Date})
                (lib-col {:name "n" :base-type :type/Integer})]
               [["2026-01-01" 1]])]
      (is (= "line" (:display_type cfg)))))
  (testing "Nil display falls back to \"bar\" for categorical x"
    (let [cfg (explorations.interestingness/chart-config
               (query nil)
               [(lib-col {:name "c" :base-type :type/Text})
                (lib-col {:name "n" :base-type :type/Integer})]
               [["a" 1]])]
      (is (= "bar" (:display_type cfg)))))
  (testing "\"table\" and \"scalar\" are also overridden"
    (doseq [d ["table" "scalar" "smartscalar"]]
      (let [cfg (explorations.interestingness/chart-config
                 (query d)
                 [(lib-col {:name "d" :base-type :type/DateTime})
                  (lib-col {:name "n" :base-type :type/Integer})]
                 [["2026-01-01T00:00" 1]])]
        (is (= "line" (:display_type cfg))
            (str "display=" d " should fall back to line for temporal x"))))))

(deftest series-keys-are-strings-test
  (let [cfg (explorations.interestingness/chart-config
             (query "bar")
             [(lib-col {:name "c" :base-type :type/Text})
              (lib-col {:name "n" :base-type :type/Integer})]
             [["a" 1]])]
    (is (every? string? (keys (:series cfg))))))

(deftest three-col-faceted-line-test
  (testing "categorical + temporal + numeric produces one line series per category, with display=line"
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "segment" :base-type :type/Text     :display-name "Segment"})
                (lib-col {:name "month"   :base-type :type/DateTime :display-name "Month"})
                (lib-col {:name "rev"     :base-type :type/Integer  :display-name "Revenue"})]
               [["NA" "2026-01-01" 100]
                ["NA" "2026-02-01" 110]
                ["EU" "2026-01-01" 80]
                ["EU" "2026-02-01" 90]])]
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

(deftest numeric-dimension-not-transposed-2col-test
  (testing "a numeric dimension (breakout) before a numeric metric (aggregation) must NOT transpose
            the axes: the aggregation column is the metric even though it is not the *first* numeric
            column (QP results order breakouts before aggregations)"
    (let [cfg (explorations.interestingness/chart-config
               (query "bar")
               [(lib-col {:name "price_bin" :base-type :type/Integer :display-name "Price"
                          :lib/source :source/breakouts})
                (lib-col {:name "count" :base-type :type/Integer :display-name "Count"
                          :lib/source :source/aggregations})]
               [[10 5] [20 8] [30 3]])
          s   (get (:series cfg) "Count")]
      (is (some? s) "the aggregation column is the metric/series")
      (is (= "number" (-> s :x :type)) "the numeric dimension is on x")
      (is (= [10 20 30] (:x_values s)) "dimension values on x, not the metric")
      (is (= [5 8 3] (:y_values s)) "metric values on y — axes not swapped"))))

(deftest numeric-dimension-not-transposed-3col-test
  (testing "a numeric dimension in a 3-col faceted result splits the series, with the aggregation on
            y and the temporal breakout on x — the numeric dim must not be mistaken for the metric"
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "bin" :base-type :type/Integer :display-name "Bin"
                          :lib/source :source/breakouts})
                (lib-col {:name "month" :base-type :type/DateTime :display-name "Month"
                          :lib/source :source/breakouts})
                (lib-col {:name "rev" :base-type :type/Integer :display-name "Revenue"
                          :lib/source :source/aggregations})]
               [[1 "2026-01-01" 100]
                [1 "2026-02-01" 110]
                [2 "2026-01-01" 80]])]
      (is (= "line" (:display_type cfg)))
      (is (= #{"1" "2"} (set (keys (:series cfg)))) "series split on the numeric dimension values")
      (let [s1 (get (:series cfg) "1")]
        (is (= "datetime" (-> s1 :x :type)) "temporal breakout on x")
        (is (= "Revenue"  (-> s1 :y :name)) "aggregation on y")
        (is (= ["2026-01-01" "2026-02-01"] (:x_values s1)))
        (is (= [100 110] (:y_values s1)))))))

(deftest three-col-nil-category-collapses-test
  (testing "nil categorical values collapse into a single \"(empty)\" series"
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "segment" :base-type :type/Text})
                (lib-col {:name "month"   :base-type :type/DateTime})
                (lib-col {:name "n"       :base-type :type/Integer})]
               [[nil "2026-01-01" 1]
                [nil "2026-02-01" 2]
                ["A" "2026-01-01" 3]])]
      (is (= #{"(empty)" "A"} (set (keys (:series cfg)))))
      (is (= [1 2] (:y_values (get (:series cfg) "(empty)"))))
      (is (= [3]   (:y_values (get (:series cfg) "A")))))))

(deftest three-col-non-temporal-second-col-returns-nil-test
  (testing "3-col result without a temporal column can't be faceted-over-time → nil"
    (is (nil? (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "a" :base-type :type/Text})
                (lib-col {:name "b" :base-type :type/Text})
                (lib-col {:name "n" :base-type :type/Integer})]
               [["x" "y" 1]])))))

(deftest three-col-non-numeric-rows-dropped-test
  (testing "rows with non-numeric metric values are dropped before grouping"
    (let [cfg (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "segment" :base-type :type/Text})
                (lib-col {:name "month"   :base-type :type/DateTime})
                (lib-col {:name "n"       :base-type :type/Integer})]
               [["NA" "2026-01-01" 1]
                ["NA" "2026-02-01" nil]
                ["NA" "2026-03-01" 3]])
          na  (get (:series cfg) "NA")]
      (is (= ["2026-01-01" "2026-03-01"] (:x_values na)))
      (is (= [1 3] (:y_values na))))))

(deftest four-or-more-cols-returns-nil-test
  (testing "4+ columns aren't supported"
    (is (nil? (explorations.interestingness/chart-config
               (query "line")
               [(lib-col {:name "a" :base-type :type/Text})
                (lib-col {:name "b" :base-type :type/DateTime})
                (lib-col {:name "c" :base-type :type/Text})
                (lib-col {:name "n" :base-type :type/Integer})]
               [["x" "2026-01-01" "y" 1]])))))
