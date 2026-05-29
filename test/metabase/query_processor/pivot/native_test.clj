(ns ^:mb/driver-tests metabase.query-processor.pivot.native-test
  "Tests for native pivot tables (single-query path via `:native-pivot-tables`)."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.pivot.native-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.pivot.common :as pivot.common]
   [metabase.query-processor.pivot.test-util :as qp.pivot.test-util]
   [metabase.query-processor.settings :as qp.settings]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

(def ^:private native-pivot-drivers
  "Drivers that implement the native pivot path."
  #{:postgres})

(defn- run-legacy-pivot-query!
  "Run the legacy multi-query pivot path for comparison."
  [query]
  (binding [qp.pivot/*force-legacy-pivot* true]
    (qp.pivot/run-pivot-query query)))

(defn- sort-rows
  "Sort rows deterministically for exact comparison."
  [rows]
  (sort (mapv vec rows)))

(defn- pivot-grouping-index
  [cols]
  (first (keep-indexed (fn [i col] (when (= "pivot-grouping" (:name col)) i)) cols)))

(defn- distinct-values
  [table col]
  (->> (mt/rows
        (mt/dataset test-data
          (qp/process-query
           (mt/mbql-query nil
             {:source-table (mt/id table)
              :breakout     [[:field (mt/id table col) nil]]}))))
       (map first)
       set))

(defn- breakout-excluded-at?
  "Return true if breakout column at `breakout-idx` should be NULL for `bitmask`."
  [bitmask breakout-idx]
  (pos? (bit-and bitmask (bit-shift-left 1 breakout-idx))))

(defn- mbql-breakout-count
  [query]
  (when-let [breakout (or (:breakout query) (:breakout (:query query)))]
    (when (seq breakout) (count breakout))))

(defn- expected-bitmasks
  [query]
  (let [pivot-opts (select-keys query [:pivot-rows :pivot-cols :show-row-totals :show-column-totals])
        ;; Match [[metabase.query-processor.pivot/add-canonical-col-info]]: use unremapped breakout count, not
        ;; remapped Lib breakouts (which can include extra columns and expect invalid bitmasks like 2 and 6).
        num-breakouts (or (:qp.pivot/num-unremapped-breakouts query)
                          (mbql-breakout-count query)
                          (count (lib/breakouts (lib/query (mt/metadata-provider) query))))
        combinations (#'qp.pivot/breakout-combinations
                      num-breakouts
                      (:pivot-rows pivot-opts)
                      (:pivot-cols pivot-opts)
                      (:show-row-totals pivot-opts)
                      (:show-column-totals pivot-opts))]
    (set (map #(pivot.common/group-bitmask num-breakouts %) combinations))))

(defn- assert-native-matches-legacy
  [query]
  (let [native-rows (sort-rows (mt/rows (qp.pivot/run-pivot-query query)))
        legacy-rows (sort-rows (mt/rows (run-legacy-pivot-query! query)))]
    (is (= legacy-rows native-rows))))

(deftest ^:parallel native-pivot-supported-driver-test
  (mt/test-drivers native-pivot-drivers
    (let [query (lib/query (mt/metadata-provider) (qp.pivot.test-util/pivot-query))]
      (is (true? (qp.pivot/native-pivot-supported? query)))))
  (mt/test-drivers #{:h2 :redshift}
    (is (false? (qp.pivot/native-pivot-supported? (qp.pivot.test-util/pivot-query))))))

(deftest ^:parallel native-vs-legacy-pivot-parity-test
  (mt/test-drivers native-pivot-drivers
    (assert-native-matches-legacy (qp.pivot.test-util/pivot-query))))

(deftest native-pivot-uses-single-query-test
  (mt/test-drivers native-pivot-drivers
    (let [query-count (atom 0)
          orig        @#'qp/process-query
          query       (qp.pivot.test-util/pivot-query)]
      (with-redefs [qp/process-query (fn [q rff]
                                       (swap! query-count inc)
                                       (orig q rff))]
        (qp.pivot/run-pivot-query query))
      (is (= 1 @query-count)))))

(deftest ^:parallel native-pivot-row-schema-test
  (mt/test-drivers native-pivot-drivers
    (let [results   (qp.pivot/run-pivot-query (qp.pivot.test-util/pivot-query))
          rows      (mt/rows results)
          Row       [:cat
                     [:maybe (into [:enum] (distinct-values :people :state))]
                     [:maybe (into [:enum] (distinct-values :people :source))]
                     [:maybe (into [:enum] (distinct-values :products :category))]
                     [:enum 0 1 3 4 5 7]
                     :int
                     :int]
          validator (mr/validator Row)]
      (is (pos? (count rows)))
      (is (=? {:status :success}
              (reduce
               (fn [_ row]
                 (testing (pr-str row)
                   (if (validator row)
                     {:status :success}
                     (reduced {:status :fail :bad-row row}))))
               nil
               rows))
          "all rows match the Row schema above"))))

(deftest ^:parallel native-pivot-bitmask-correctness-test
  (mt/test-drivers native-pivot-drivers
    (let [query         (qp.pivot.test-util/pivot-query)
          pivot-opts    (select-keys query [:pivot-rows :pivot-cols :pivot_rows :pivot_cols
                                            :show-row-totals :show-column-totals
                                            :show_row_totals :show_column_totals])
          pivot-rows    (or (:pivot-rows pivot-opts) (:pivot_rows pivot-opts))
          pivot-cols    (or (:pivot-cols pivot-opts) (:pivot_cols pivot-opts))
          row-totals?   (or (:show-row-totals pivot-opts) (:show_row_totals pivot-opts) true)
          col-totals?   (or (:show-column-totals pivot-opts) (:show_column_totals pivot-opts) true)
          num-breakouts 3
          combinations  (#'qp.pivot/breakout-combinations
                         num-breakouts pivot-rows pivot-cols row-totals? col-totals?)
          results       (qp.pivot/run-pivot-query query)
          cols          (mt/cols results)
          rows          (mt/rows results)
          pivot-idx     (pivot-grouping-index cols)
          expected      (set (map #(pivot.common/group-bitmask num-breakouts %) combinations))
          actual        (set (map #(nth % pivot-idx) rows))]
      (is (= expected actual)
          (str "unexpected bitmask values; expected " (pr-str (sort expected))
               " but got " (pr-str (sort actual))))
      (doseq [row rows
              :let [bitmask (nth row pivot-idx)]
              i (range num-breakouts)]
        (is (= (breakout-excluded-at? bitmask i)
               (nil? (nth row i)))
            (str "breakout " i " null pattern for bitmask " bitmask " in row " (pr-str row)))))))

(deftest ^:parallel native-pivot-column-metadata-test
  (mt/test-drivers native-pivot-drivers
    (let [results   (qp.pivot/run-pivot-query (qp.pivot.test-util/pivot-query))
          cols      (mt/cols results)
          pivot-idx (pivot-grouping-index cols)
          pivot-col (nth cols pivot-idx)]
      (is (= 6 (count cols)))
      (is (= ["User → State"
              "User → Source"
              "Product → Category"
              "pivot-grouping"
              "Count"
              "Sum of Quantity"]
             (mapv :display_name cols)))
      (is (= "pivot-grouping" (:name pivot-col)))
      (is (= "pivot-grouping" (:display_name pivot-col)))
      (is (= :type/Integer (:base_type pivot-col)))
      (is (= :type/Integer (:effective_type pivot-col))))))

(deftest ^:parallel native-pivot-filters-query-test
  (mt/test-drivers native-pivot-drivers
    (assert-native-matches-legacy (qp.pivot.test-util/filters-query))))

(deftest ^:parallel native-pivot-parameters-query-test
  (mt/test-drivers native-pivot-drivers
    (assert-native-matches-legacy (qp.pivot.test-util/parameters-query))))

(deftest ^:parallel native-pivot-expressions-in-breakout-test
  (mt/test-drivers native-pivot-drivers
    (assert-native-matches-legacy
     (assoc (mt/mbql-query orders
              {:expressions {"Product Rating + 1" [:+ $product_id->products.rating 1]}
               :aggregation [[:count]]
               :breakout    [$user_id->people.source [:expression "Product Rating + 1"]]})
            :pivot-rows [0]
            :pivot-cols [1]))))

(deftest ^:parallel native-pivot-order-by-test
  (mt/test-drivers native-pivot-drivers
    (let [query (mt/mbql-query products
                  {:breakout    [$category]
                   :aggregation [[:count]]
                   :order-by    [[:asc $category]]})]
      (assert-native-matches-legacy query)
      (is (= (sort-rows (mt/rows (run-legacy-pivot-query! query)))
             (sort-rows (mt/rows (qp.pivot/run-pivot-query query))))))))

(deftest ^:parallel native-pivot-single-breakout-test
  (mt/test-drivers native-pivot-drivers
    (let [query (mt/mbql-query products
                  {:breakout    [$category]
                   :aggregation [[:count]]
                   :pivot-rows  [0]
                   :pivot-cols  []})]
      (assert-native-matches-legacy query)
      (is (= #{0 1} (set (map second (mt/rows (qp.pivot/run-pivot-query query)))))))))

(deftest ^:parallel native-pivot-totals-toggled-off-test
  (mt/test-drivers native-pivot-drivers
    (doseq [[_label opts] [["row totals disabled" {:show-row-totals false}]
                           ["column totals disabled" {:show-column-totals false}]
                           ["row and column totals disabled" {:show-row-totals    false
                                                              :show-column-totals false}]]]
      (let [query (merge (qp.pivot.test-util/pivot-query) opts)]
        (assert-native-matches-legacy query)
        (is (< (count (mt/rows (qp.pivot/run-pivot-query query)))
               (count (mt/rows (qp.pivot/run-pivot-query (qp.pivot.test-util/pivot-query))))))))))

(deftest ^:parallel native-pivot-custom-limit-test
  (mt/test-drivers native-pivot-drivers
    (let [query             (assoc (qp.pivot.test-util/pivot-query) :constraints {:max-results 50})
          results           (qp.pivot/run-pivot-query query)
          rows              (mt/formatted-rows [str str str int int int] results)
          detail-rows       (filter #(zero? (nth % 3)) rows)
          grand-total-row   (first (filter #(= 7 (nth % 3)) rows))
          detail-count-sum  (reduce + (map #(nth % 4) detail-rows))
          grand-total-count (nth grand-total-row 4)]
      (is (> (count detail-rows) 50)
          "All detail rows are returned (not truncated to caller's max-results)")
      (is (some? grand-total-row)
          "The grand total row exists")
      (is (= detail-count-sum grand-total-count)
          "Detail rows sum to the grand total"))))

(deftest ^:parallel native-pivot-truncation-test
  (mt/test-drivers native-pivot-drivers
    (let [query           (qp.pivot.test-util/pivot-query)
          unlimited-count (count (mt/rows (qp.pivot/run-pivot-query query)))]
      (binding [qp.pivot/*pivot-max-result-rows* 20]
        (let [results     (qp.pivot/run-pivot-query query)
              rows        (mt/rows results)
              pivot-limit 10]
          (is (<= (count rows) pivot-limit)
              "Results are truncated to the native pivot limit")
          (is (< (count rows) unlimited-count))
          (is (= (count rows) (get-in results [:data :pivot_rows_truncated]))
              "Native pivot signals truncation with the row count, like legacy"))))))

(deftest native-pivot-high-unaggregated-row-limit-test
  (mt/test-drivers native-pivot-drivers
    (binding [qp.pivot/*pivot-max-result-rows* 20]
      (mt/with-temporary-setting-values [qp.settings/unaggregated-query-row-limit 15]
        (let [query (-> (qp.pivot.test-util/pivot-query)
                        (assoc :constraints (qp.constraints/default-query-constraints)))]
          (is (not= :failed (:status (qp.pivot/run-pivot-query query)))
              "Native pivot query should not fail with a constraint violation")
          (assert-native-matches-legacy query))))))
