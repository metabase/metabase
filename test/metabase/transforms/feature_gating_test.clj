(ns metabase.transforms.feature-gating-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.transforms.feature-gating :as transforms.gating]))

(set! *warn-on-reflection* true)

(defn- with-mocked-routing
  "Run `body` with `transform-metered-as` returning the given fixed bucket string."
  [bucket f]
  (with-redefs [premium-features/transform-metered-as (constantly bucket)]
    (f)))

(deftest transform-locked?-no-bucket-test
  (testing "non-metered transform (transform-metered-as → nil) is never locked,
            even when other meters are locked"
    (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs    true
                                                      :transform-advanced-runs true}]
      (with-mocked-routing nil
        #(is (false? (transforms.gating/transform-locked?
                      {:source_type :native})))))))

(deftest transform-locked?-basic-bucket-test
  (testing "basic-bucket transform follows :transform-basic-runs"
    (with-mocked-routing "transform-basic"
      (fn []
        (testing "locked"
          (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs true}]
            (is (true? (transforms.gating/transform-locked? {:source_type :native})))))
        (testing "unlocked"
          (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs false}]
            (is (false? (transforms.gating/transform-locked? {:source_type :native})))))
        (testing "missing → unlocked"
          (mt/with-temporary-setting-values [locked-meters {}]
            (is (false? (transforms.gating/transform-locked? {:source_type :native})))))
        (testing "advanced-bucket lock does not bleed into basic"
          (mt/with-temporary-setting-values [locked-meters {:transform-advanced-runs true}]
            (is (false? (transforms.gating/transform-locked? {:source_type :native})))))))))

(deftest transform-locked?-advanced-bucket-test
  (testing "advanced-bucket transform follows :transform-advanced-runs"
    (with-mocked-routing "transform-advanced"
      (fn []
        (testing "python locked"
          (mt/with-temporary-setting-values [locked-meters {:transform-advanced-runs true}]
            (is (true? (transforms.gating/transform-locked? {:source_type :python})))))
        (testing "python unlocked"
          (mt/with-temporary-setting-values [locked-meters {:transform-advanced-runs false}]
            (is (false? (transforms.gating/transform-locked? {:source_type :python})))))
        (testing "basic-bucket lock does not bleed into advanced"
          (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs true}]
            (is (false? (transforms.gating/transform-locked? {:source_type :python})))))))))

(deftest transform-locked?-non-transform-meter-ignored-test
  (testing "locks on non-transform meters (e.g. :metabase-ai-tokens) do not affect transforms"
    (with-mocked-routing "transform-basic"
      #(mt/with-temporary-setting-values [locked-meters {:metabase-ai-tokens true}]
         (is (false? (transforms.gating/transform-locked? {:source_type :native})))))))

(deftest transform-locked?-source-fallback-test
  (testing "source-derivation fallback: transform without :source_type uses :source.type"
    (with-mocked-routing "transform-basic"
      #(mt/with-temporary-setting-values [locked-meters {:transform-basic-runs true}]
         (is (true? (transforms.gating/transform-locked?
                     {:source {:type "query"}})))))
    (with-mocked-routing "transform-advanced"
      #(mt/with-temporary-setting-values [locked-meters {:transform-advanced-runs true}]
         (is (true? (transforms.gating/transform-locked?
                     {:source {:type "python"}})))))))

(deftest transform-locked?-cold-cache-test
  (testing "cold cache (default empty :locked-meters) → unlocked"
    (with-mocked-routing "transform-basic"
      #(is (false? (transforms.gating/transform-locked? {:source_type :native}))))))
