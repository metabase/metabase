(ns metabase.lib.swap-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.log.capture :as log.capture]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- swapped-clauses-prop [clause-fn clause-key query]
  (prop/for-all* [(gen/elements (clause-fn query))
                  (gen/elements (clause-fn query))]
    (fn [source-clause target-clause]
      (or (= source-clause target-clause) ; Skip any case where we happened to draw the same one twice.
          (let [swapped (lib/swap-clauses query -1 source-clause target-clause)]
            (and ;; Correctly rearranged the clauses.
             (= (for [clause (clause-fn query)]
                  (cond
                    (= source-clause clause) target-clause
                    (= target-clause clause) source-clause
                    :else                    clause))
                (clause-fn swapped))
                          ;; And didn't change anything else.
             (= (m/dissoc-in query   [:stages 0 clause-key])
                (m/dissoc-in swapped [:stages 0 clause-key]))))))))

(defspec swap-clauses-on-aggregations-test-permutations
  (swapped-clauses-prop
   lib/aggregations :aggregation
   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
       (lib/aggregate (lib/count))
       (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
       (lib/aggregate (lib/avg (meta/field-metadata :orders :discount)))
       (lib/aggregate (lib/max (meta/field-metadata :orders :tax)))
       (lib/aggregate (lib/min (meta/field-metadata :orders :total))))))

(defspec swap-clauses-on-breakouts-test-permutations 300 ; Extra tests to hit the similar cases all the time!
  (swapped-clauses-prop
   lib/breakouts :breakout
   (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) $q
     (lib/breakout $q (meta/field-metadata :products :category))
     (lib/breakout $q (meta/field-metadata :people :source))
      ;; Deliberately including the same field three times: without binning, and with two different binning settings.
     (lib/breakout $q (meta/field-metadata :orders :subtotal))
     (lib/breakout $q (lib/with-binning
                       (meta/field-metadata :orders :subtotal)
                       (second (lib/available-binning-strategies $q (meta/field-metadata :orders :subtotal)))))
     (lib/breakout $q (lib/with-binning
                       (meta/field-metadata :orders :subtotal)
                       (nth (lib/available-binning-strategies $q (meta/field-metadata :orders :subtotal))
                            2)))
      ;; Likewise including multiple temporal buckets.
     (lib/breakout $q (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month))
     (lib/breakout $q (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :year)))))

(defspec swap-clauses-on-filters-test-permutations
  (swapped-clauses-prop
   lib/filters :filters
   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
       (lib/filter (lib/= (meta/field-metadata :products :category) "Doohickey"))
       (lib/filter (lib/< (meta/field-metadata :products :created-at) "2024-01-01T00:00:00"))
       (lib/filter (lib/is-null (meta/field-metadata :orders :discount)))
       (lib/filter (lib/!= (meta/field-metadata :people :source) "Facebook")))))

(defspec swap-clauses-on-expressions-test-permutations
  (swapped-clauses-prop
   lib/expressions :expressions
   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
       (lib/expression "clean-discount" (lib/coalesce (meta/field-metadata :orders :discount) 0))
       (lib/expression "discount fraction" (lib// (meta/field-metadata :orders :discount)
                                                  (meta/field-metadata :orders :subtotal)))
       (lib/expression "order month" (lib/get-month (meta/field-metadata :orders :created-at)))
       (lib/expression "signup year" (lib/get-year  (meta/field-metadata :people :created-at))))))

(defspec swap-clauses-on-order-by-test-permutations
  (swapped-clauses-prop
   lib/order-bys :order-by
   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
       (lib/order-by (meta/field-metadata :products :category))
       (lib/order-by (meta/field-metadata :orders :subtotal) :desc)
       (lib/order-by (meta/field-metadata :people :latitude) :asc)
       (lib/order-by (meta/field-metadata :orders :tax) :asc)
       (lib/order-by (meta/field-metadata :orders :discount) :desc))))

(deftest ^:synchronized swap-clauses-not-found-test
  (testing "swap-clauses emits a warning if a clause is not found"
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/count))
                          (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                          (lib/aggregate (lib/min (meta/field-metadata :orders :total))))
          [a1 a2 _a3] (lib/aggregations query)]
      (log.capture/with-log-messages-for-level [messages [metabase.lib.swap :warn]]
        (lib/swap-clauses query -1 a2 (lib.options/update-options a1 assoc :lib/uuid (str (random-uuid))))
        (is (=? [{:level :warn, :message #"No matching clause in swap-clauses \[:count .*"}]
                (messages)))))))

(deftest ^:synchronized swap-clauses-ambiguous-test
  (testing "swap-clauses emits a warning if multiple matching clauses are found"
    ;; This isn't really possible to do by accident, but anyway.
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/count))
                          (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                          (lib/aggregate (lib/min (meta/field-metadata :orders :total))))
          [a1 a2 _a3] (lib/aggregations query)
          query       (update-in query [:stages 0 :aggregation] conj a2)]
      (log.capture/with-log-messages-for-level [messages [metabase.lib.swap :warn]]
        (lib/swap-clauses query -1 a1 a2)
        (is (=? [{:level :warn, :message #"Ambiguous match for clause in swap-clauses \[:sum .*"}]
                (messages)))))))

(deftest ^:parallel swap-clauses-aggregations-with-downstream-refs-test
  (testing "swap-clauses updates downstream refs even if names change"
    (let [base                 (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                   (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                                   (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                                   (lib/aggregate (lib/sum (meta/field-metadata :orders :tax)))
                                   lib/append-stage)
          ;; These three aggregations end up being named sum, sum_2 and sum_3 in later stages.
          aggs-by-id           (->> (lib/aggregations base 0)
                                    m/indexed
                                    (into {}))
          [subtotal total tax] (lib/visible-columns base)]
      (doseq [[i1 agg1] aggs-by-id
              [i2 agg2] aggs-by-id
              :when (not= i1 i2)
              :let [before (-> base
                               (lib/filter (lib/< subtotal 100))
                               (lib/filter (lib/< total    200))
                               (lib/filter (lib/< tax      300)))
                    after  (lib/swap-clauses before 0 agg1 agg2)]]
        (testing "the aggregations really did get swapped"
          (let [exp-aggs (merge aggs-by-id
                                {i1 agg2
                                 i2 agg1})]
            (is (=? (map exp-aggs (range (count exp-aggs)))
                    (lib/aggregations after 0)))))
        ;; The refs in the three filters should match the same columns as before, even though the names have changed
        ;; when swapped.
        (let [filter-cols (fn [query]
                            (let [cols (lib/visible-columns query)]
                              (for [[_< _opts agg _value] (lib/filters query -1)]
                                (lib/find-matching-column agg cols))))
              cols-before (filter-cols before)
              cols-after  (filter-cols after)]
          (is (every? some? cols-before))
          (is (every? some? cols-after))
          (is (every? :lib/source-uuid cols-before))
          (is (every? :lib/source-uuid cols-after))
          (testing "the ref always points at the correct underlying column"
            (is (=? (map :lib/source-uuid cols-before)
                    (map :lib/source-uuid cols-after)))
            (testing "even though the names have changed where they were swapped"
              (let [aliases-before (mapv (juxt :metabase.lib.join/join-alias :lib/source-column-alias) cols-before)
                    aliases-after  (mapv (juxt :metabase.lib.join/join-alias :lib/source-column-alias) cols-after)]
                (is (not= (nth aliases-before i1)
                          (nth aliases-after  i1)))
                (is (not= (nth aliases-before i2)
                          (nth aliases-after  i2)))
                (for [i-unchanged (remove #{i1 i2} (range (count aggs-by-id)))]
                  (is (= (nth aliases-before i-unchanged)
                         (nth aliases-after  i-unchanged))))))))))))

(deftest ^:parallel swap-clauses-breakouts-on-same-column-test
  (testing "swapping two breakouts of the same column with different time granularity maintains downstream refs"
    (let [base          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                            (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month))
                            (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :day))
                            lib/append-stage)
          [months days] (lib/visible-columns base)
          before        (-> base
                            (lib/filter (lib/= months 4))
                            (lib/expression "days-ago" (lib/- (lib/now) days)))
          [brk1 brk2]   (lib/breakouts base 0)
          after         (lib/swap-clauses before 0 brk1 brk2)
          cols-after    (lib/visible-columns after)
          days-after    (-> (assoc days
                                   :lib/source-column-alias  "CREATED_AT")
                            (dissoc :lib/deduplicated-name))
          months-after  (-> (assoc months
                                   :lib/source-column-alias  "CREATED_AT_2")
                            (dissoc :lib/deduplicated-name))]
      (testing "\nthe columns have swapped places and their names have changed"
        (is (=? [days-after months-after {:name "days-ago"}]
                cols-after)))
      (testing "the refs to those breakouts are still aimed at the same columns as before, despite the name change"
        (let [[_- _opts _now days-ref] (first (lib/expressions after))]
          (is (=? days-after (lib/find-matching-column days-ref cols-after))))
        (let [[_= _opts months-ref _value] (first (lib/filters after))]
          (is (=? months-after (lib/find-matching-column months-ref cols-after))))))))
