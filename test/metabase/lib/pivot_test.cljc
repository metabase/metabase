(ns metabase.lib.pivot-test
  (:require
   #?(:cljs [metabase.test-runner.assert-exprs.approximately-equal])
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.calc]
   [metabase.lib.options :as lib.options]
   [metabase.lib.pivot :as lib.pivot]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli.registry :as mr])
  #?(:clj (:import (clojure.lang ExceptionInfo))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- n-breakout-query
  "Build a one-stage MBQL5 query with `n` breakouts and a count aggregation."
  ([] (n-breakout-query 2))
  ([n]
   (let [breakouts (take n [(meta/field-metadata :orders :created-at)
                            (meta/field-metadata :orders :user-id)
                            (meta/field-metadata :orders :product-id)])]
     (reduce lib/breakout
             (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                 (lib/aggregate (lib/count)))
             breakouts))))

(defn- with-pivot
  "Attach a `:pivot` clause to the last stage of `query`."
  [query pivot]
  (lib.util/update-query-stage query -1 assoc :pivot pivot))

(defn- breakout-uuids [query]
  (mapv lib.options/uuid (lib/breakouts query)))

;;; ----- schema -----

(deftest ^:parallel pivot-schema-structural-validation-test
  (testing "::pivot accepts structurally-valid maps"
    (is (mr/validate :metabase.lib.schema/pivot
                     {:rows ["11111111-1111-1111-1111-111111111111"] :columns []})))
  (testing "::pivot accepts the optional show-* flags"
    (is (mr/validate :metabase.lib.schema/pivot
                     {:rows [] :columns [] :show-row-totals false :show-column-totals true})))
  (testing "::pivot rejects non-UUID-shaped strings"
    (is (not (mr/validate :metabase.lib.schema/pivot
                          {:rows ["not-a-uuid"] :columns []}))))
  (testing "::pivot rejects missing :rows or :columns"
    (is (not (mr/validate :metabase.lib.schema/pivot {:rows []})))
    (is (not (mr/validate :metabase.lib.schema/pivot {:columns []})))))

(deftest ^:parallel query-schema-accepts-pivot-on-last-stage-test
  (let [q       (n-breakout-query 2)
        [u1 u2] (breakout-uuids q)]
    (is (mr/validate :metabase.lib.schema/query
                     (with-pivot q {:rows [u1] :columns [u2]})))))

(deftest ^:parallel query-schema-rejects-top-level-pivot-test
  (let [q       (n-breakout-query 2)
        [u1 u2] (breakout-uuids q)]
    (is (not (mr/validate :metabase.lib.schema/query
                          (assoc q :pivot {:rows [u1] :columns [u2]}))))))

;;; ----- helpers -----

(deftest ^:parallel has-pivot?-test
  (let [q    (n-breakout-query 1)
        [u1] (breakout-uuids q)]
    (is (false? (lib.pivot/has-pivot? q)))
    (is (true?  (lib.pivot/has-pivot? (with-pivot q {:rows [u1] :columns []}))))))

(deftest ^:parallel pivot-rows-and-columns-resolve-to-breakout-clauses-test
  (let [q             (n-breakout-query 2)
        [b1 b2]       (lib/breakouts q)
        [u1 u2]       (breakout-uuids q)
        piv-singles   (with-pivot q {:rows [u1] :columns [u2]})
        piv-reordered (with-pivot q {:rows [u2 u1] :columns []})]
    (testing "returns the full breakout clauses from the query"
      (is (= [b1] (lib.pivot/pivot-rows piv-singles)))
      (is (= [b2] (lib.pivot/pivot-columns piv-singles))))
    (testing "preserves the order given in :rows"
      (is (= [b2 b1] (lib.pivot/pivot-rows piv-reordered))))))

(deftest ^:parallel pivot-rows-returns-nil-when-pivot-absent-test
  (is (nil? (lib.pivot/pivot-rows (n-breakout-query 1))))
  (is (nil? (lib.pivot/pivot-columns (n-breakout-query 1)))))

(deftest ^:parallel pivot-rows-throws-on-unknown-uuid-test
  (let [q   (n-breakout-query 1)
        bad "deadbeef-dead-dead-dead-deaddeaddead"
        piv (with-pivot q {:rows [bad] :columns []})]
    (is (thrown-with-msg? ExceptionInfo
                          #":pivot rows references unknown breakout uuid"
                          (lib.pivot/pivot-rows piv)))))

;;; ----- pivot-grouping column metadata -----

(deftest ^:parallel pivot-grouping-column-metadata-shape-test
  (let [m lib.pivot/pivot-grouping-column-metadata]
    (is (= lib.pivot/pivot-grouping-column-name (:name m)))
    (is (= :metadata/column (:lib/type m)))
    (is (= :type/Integer    (:base-type m)))
    (is (= :source/pivot-grouping (:lib/source m)))))

;;; ----- returned-columns splice -----

(deftest ^:parallel returned-columns-splices-pivot-grouping-between-breakouts-and-aggregations-test
  (let [q       (n-breakout-query 2)
        [u1 u2] (breakout-uuids q)
        piv     (with-pivot q {:rows [u1] :columns [u2]})]
    (is (=? [{:name "CREATED_AT"     :lib/source :source/table-defaults}
             {:name "USER_ID"        :lib/source :source/table-defaults}
             {:name "pivot-grouping" :lib/source :source/pivot-grouping}
             {:name "count"          :lib/source :source/aggregations}]
            (lib.calc/returned-columns piv)))))

(deftest ^:parallel returned-columns-unchanged-for-non-pivot-queries-test
  (let [q    (n-breakout-query 2)
        cols (lib.calc/returned-columns q)]
    (is (= ["CREATED_AT" "USER_ID" "count"] (mapv :name cols)))
    (is (every? (complement #{:source/pivot-grouping}) (map :lib/source cols)))))

;;; ----- read-show-flag -----

(deftest ^:parallel read-show-flag-test
  (testing "returns the value when the key is present"
    (is (false? (lib.pivot/read-show-flag {:k false} :k))))
  (testing "defaults to true when no key matches"
    (is (true? (lib.pivot/read-show-flag {} :k :other-k))))
  (testing "tries keys in order; returns the first matching"
    (is (= "first" (lib.pivot/read-show-flag {:b "second" :a "first"} :a :b))))
  (testing "treats nil values as present (not absent)"
    (is (nil? (lib.pivot/read-show-flag {:k nil} :k)))))
