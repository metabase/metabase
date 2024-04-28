(ns metabase.lib.swap-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.test.util.log :as tu.log]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- swapped-clauses-prop [clause-fn clause-key query]
  (prop/for-all*
    [(gen/elements (clause-fn query))
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
      (is (=? [[:warn nil #"No matching clause in swap-clauses \[:count .*"]]
              (tu.log/with-log-messages-for-level ['metabase.lib.swap :warn]
                (lib/swap-clauses query -1 a2 (lib.options/update-options a1 assoc :lib/uuid (str (random-uuid))))))))))

(deftest ^:synchronized swap-clauses-ambiguous-test
  (testing "swap-clauses emits a warning if multiple matching clauses are found"
    ;; This isn't really possible to do by accident, but anyway.
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/count))
                          (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                          (lib/aggregate (lib/min (meta/field-metadata :orders :total))))
          [a1 a2 _a3] (lib/aggregations query)
          query       (update-in query [:stages 0 :aggregation] conj a2)]
      (is (=? [[:warn nil #"Ambiguous match for clause in swap-clauses \[:sum .*"]]
              (tu.log/with-log-messages-for-level ['metabase.lib.swap :warn]
                (lib/swap-clauses query -1 a1 a2)))))))
