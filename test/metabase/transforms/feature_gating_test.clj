(ns metabase.transforms.feature-gating-test
  "Tests for feature gating predicates (OSS behavior).
  Tests that depend on runner language registration live in
  metabase-enterprise.transforms-runner.feature-gating-test."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.feature-gating :as transforms.gating]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- Feature flag predicates ------------------------------------------------

(deftest no-features-test
  (testing "with no premium features"
    (mt/with-premium-features #{}
      (testing "query transforms are enabled (OSS)"
        (is (true? (transforms.gating/query-transforms-enabled?))))
      (testing "python transforms are disabled"
        (is (false? (transforms.gating/python-transforms-enabled?))))
      (testing "runner transforms are disabled"
        (is (false? (transforms.gating/runner-transforms-enabled?)))))))

(deftest transforms-only-test
  (testing "with only :transforms feature"
    (mt/with-premium-features #{:transforms}
      (testing "query transforms are enabled"
        (is (true? (transforms.gating/query-transforms-enabled?))))
      (testing "python transforms need :transforms-python too"
        (is (false? (transforms.gating/python-transforms-enabled?))))
      (testing "runner transforms need :transforms-python too"
        (is (false? (transforms.gating/runner-transforms-enabled?)))))))

(deftest full-features-test
  (testing "with :transforms and :transforms-python"
    (mt/with-premium-features #{:transforms :transforms-python}
      (is (true? (transforms.gating/query-transforms-enabled?)))
      (is (true? (transforms.gating/python-transforms-enabled?)))
      (is (true? (transforms.gating/runner-transforms-enabled?))))))

;;; ---------------------------------------- enabled-source-types --------------------------------------------------

(deftest enabled-source-types-no-features-test
  (mt/with-premium-features #{}
    (is (= #{"native" "mbql"} (transforms.gating/enabled-source-types)))))

(deftest enabled-source-types-transforms-only-test
  (mt/with-premium-features #{:transforms}
    (is (= #{"native" "mbql"} (transforms.gating/enabled-source-types)))))

;;; ---------------------------------------- any-transforms-enabled? -----------------------------------------------

(deftest any-transforms-enabled-test
  (mt/with-premium-features #{}
    (testing "always true in non-hosted (OSS) mode"
      (is (true? (transforms.gating/any-transforms-enabled?)))))
  (mt/with-premium-features #{:transforms :transforms-python}
    (is (true? (transforms.gating/any-transforms-enabled?)))))

