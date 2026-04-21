(ns metabase.usage-metadata.insights-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.insights :as insights]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest existing-segment-predicates-cached-test
  (testing "existing-segment-predicates is TTL-memoized — repeated calls with the same opts hit the DB once"
    (let [segment-selects (atom 0)
          real-select     t2/select
          existing-fn     @#'insights/existing-segment-predicates
          memo-var        @#'insights/existing-segment-predicates*-memo]
      (memoize/memo-clear! memo-var)
      (with-redefs [t2/select (fn [& args]
                                (when (and (sequential? (first args))
                                           (= :model/Segment (ffirst args)))
                                  (swap! segment-selects inc))
                                (apply real-select args))]
        (existing-fn {})
        (existing-fn {})
        (is (= 1 @segment-selects)))
      (memoize/memo-clear! memo-var))))

(deftest existing-metric-signatures-cached-test
  (testing "existing-metric-signatures is TTL-memoized"
    (let [card-selects (atom 0)
          real-select  t2/select
          existing-fn  @#'insights/existing-metric-signatures
          memo-var     @#'insights/existing-metric-signatures*-memo]
      (memoize/memo-clear! memo-var)
      (with-redefs [t2/select (fn [& args]
                                (when (and (sequential? (first args))
                                           (= :model/Card (ffirst args)))
                                  (swap! card-selects inc))
                                (apply real-select args))]
        (existing-fn)
        (existing-fn)
        (is (= 1 @card-selects)))
      (memoize/memo-clear! memo-var))))
