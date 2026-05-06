(ns metabase.transforms.feature-gating-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.transforms.core :as transforms]
   [metabase.transforms.feature-gating :as transforms.gating]))

(set! *warn-on-reflection* true)

(defn- with-mocked-routing!
  "Call zero-arg `f` with [[premium-features/transform-metered-as]] redefined to return
   the given fixed `bucket` string."
  [bucket f]
  (with-redefs [premium-features/transform-metered-as (constantly bucket)]
    (f)))

(deftest transform-locked?-no-bucket-test
  (testing "non-metered transform (transform-metered-as → nil) is never locked,
            even when other meters are locked"
    (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs    true
                                                      :transform-advanced-runs true}]
      (with-mocked-routing! nil
        #(is (false? (transforms.gating/transform-locked?
                      {:source {:type "query"}})))))))

(deftest transform-locked?-basic-bucket-test
  (testing "basic-bucket transform follows :transform-basic-runs"
    (with-mocked-routing! "transform-basic"
      (fn []
        (testing "locked"
          (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs true}]
            (is (true? (transforms.gating/transform-locked? {:source {:type "query"}})))))
        (testing "unlocked"
          (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs false}]
            (is (false? (transforms.gating/transform-locked? {:source {:type "query"}})))))
        (testing "missing → unlocked"
          (mt/with-temporary-setting-values [locked-meters {}]
            (is (false? (transforms.gating/transform-locked? {:source {:type "query"}})))))
        (testing "advanced-bucket lock does not bleed into basic"
          (mt/with-temporary-setting-values [locked-meters {:transform-advanced-runs true}]
            (is (false? (transforms.gating/transform-locked? {:source {:type "query"}})))))))))

(deftest transform-locked?-advanced-bucket-test
  (testing "advanced-bucket transform follows :transform-advanced-runs"
    (with-mocked-routing! "transform-advanced"
      (fn []
        (testing "python locked"
          (mt/with-temporary-setting-values [locked-meters {:transform-advanced-runs true}]
            (is (true? (transforms.gating/transform-locked? {:source {:type "python"}})))))
        (testing "python unlocked"
          (mt/with-temporary-setting-values [locked-meters {:transform-advanced-runs false}]
            (is (false? (transforms.gating/transform-locked? {:source {:type "python"}})))))
        (testing "basic-bucket lock does not bleed into advanced"
          (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs true}]
            (is (false? (transforms.gating/transform-locked? {:source {:type "python"}})))))))))

(deftest transform-locked?-non-transform-meter-ignored-test
  (testing "locks on non-transform meters (e.g. :metabase-ai-tokens) do not affect transforms"
    (with-mocked-routing! "transform-basic"
      #(mt/with-temporary-setting-values [locked-meters {:metabase-ai-tokens true}]
         (is (false? (transforms.gating/transform-locked? {:source {:type "query"}})))))))

(deftest transforms-meter-locked?-test
  (testing "FE-facing aggregate: locked iff either transforms meter is locked"
    (testing "no locks → false"
      (mt/with-temporary-setting-values [locked-meters {}]
        (is (false? (transforms.gating/transforms-meter-locked?)))))
    (testing "basic-bucket locked → true"
      (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs true}]
        (is (true? (transforms.gating/transforms-meter-locked?)))))
    (testing "advanced-bucket locked → true"
      (mt/with-temporary-setting-values [locked-meters {:transform-advanced-runs true}]
        (is (true? (transforms.gating/transforms-meter-locked?)))))
    (testing "both locked (defense-in-depth — harbormaster mutex says this can't happen) → still true"
      (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs    true
                                                        :transform-advanced-runs true}]
        (is (true? (transforms.gating/transforms-meter-locked?)))))
    (testing "non-transform meter (e.g. :metabase-ai-tokens) does NOT affect transforms aggregate"
      (mt/with-temporary-setting-values [locked-meters {:metabase-ai-tokens true}]
        (is (false? (transforms.gating/transforms-meter-locked?)))))
    (testing "false values do not count as locked"
      (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs    false
                                                        :transform-advanced-runs false}]
        (is (false? (transforms.gating/transforms-meter-locked?)))))))

(deftest transforms-meter-locked-setting-test
  (testing "the :transforms-meter-locked setting reflects the underlying transforms-meter-locked? predicate.
            Smoke test only — exhaustive matrix lives on transforms-meter-locked?-test above."
    (testing "unlocked"
      (mt/with-temporary-setting-values [locked-meters {}]
        (is (false? (transforms/transforms-meter-locked)))))
    (testing "locked"
      (mt/with-temporary-setting-values [locked-meters {:transform-basic-runs true}]
        (is (true? (transforms/transforms-meter-locked)))))))
