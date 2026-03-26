(ns metabase.metabot.self.features-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.features :as features]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; feature-available? tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:synchronized feature-available?-known-feature-available-test
  (testing "returns true when predicate returns true"
    (with-redefs [features/feature-predicates {:test-feature (constantly true)}]
      (is (true? (features/feature-available? :test-feature))))))

(deftest ^:synchronized feature-available?-known-feature-unavailable-test
  (testing "returns false when predicate returns false"
    (with-redefs [features/feature-predicates {:test-feature (constantly false)}]
      (is (false? (features/feature-available? :test-feature))))))

(deftest ^:synchronized feature-available?-unknown-feature-test
  (testing "unknown feature returns true (fail-open behavior)"
    (with-redefs [features/feature-predicates {}]
      (is (true? (features/feature-available? :unknown-feature))))))

(deftest ^:synchronized feature-available?-predicate-called-test
  (testing "predicate is actually invoked"
    (let [call-count (atom 0)]
      (with-redefs [features/feature-predicates {:counting-feature #(do (swap! call-count inc) true)}]
        (features/feature-available? :counting-feature)
        (is (= 1 @call-count))))))
