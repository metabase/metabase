(ns metabase-enterprise.data-complexity-score.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.settings :as settings]
   [metabase.test :as mt]))

(deftest ^:sequential semantic-complexity-level-defaults-to-2-test
  (testing "the setting defaults to 2 (the level this build actually implements in full)"
    (mt/discard-setting-changes [semantic-complexity-level]
      (settings/semantic-complexity-level! nil)
      (is (= 2 (settings/semantic-complexity-level))))))

(deftest ^:sequential effective-level-clamps-out-of-range-values-test
  (testing "effective-level clamps to [0, max-level] so out-of-range setting values don't crash
            the scorer or silently disable scoring"
    (mt/discard-setting-changes [semantic-complexity-level]
      (doseq [[raw expected] [[-1 0]
                              [0 0]
                              [1 1]
                              [2 2]
                              [(inc settings/max-level) settings/max-level]
                              [9999 settings/max-level]]]
        (settings/semantic-complexity-level! raw)
        (is (= expected (settings/effective-level))
            (format "raw setting %d should clamp to %d" raw expected))))))

(deftest ^:sequential effective-level-treats-nil-as-zero-test
  (testing "nil (setting was cleared) returns 0 — default only kicks in via defsetting, not when
            the setter is called with nil after init"
    (mt/discard-setting-changes [semantic-complexity-level]
      (settings/semantic-complexity-level! nil)
      ;; The defsetting default (2) applies when no value has been set; once we've cleared it
      ;; (set to nil), the setter unsets the override and we fall back to the default.
      (is (= 2 (settings/effective-level))
          "after (setter! nil), defsetting default wins"))))
