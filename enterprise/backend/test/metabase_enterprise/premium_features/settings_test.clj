(ns metabase-enterprise.premium-features.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.test-util :as tu]
   [metabase.test :as mt]))

(deftest custom-viz-disable-env-var-test
  (testing "MB_CUSTOM_VIZ_DISABLE=true overrides the premium feature"
    (tu/with-premium-features #{:custom-viz}
      (is (true? (premium-features/enable-custom-viz?)))
      (mt/with-temp-env-var-value! ["MB_CUSTOM_VIZ_DISABLE" "true"]
        (is (false? (premium-features/enable-custom-viz?))))))
  (testing "MB_CUSTOM_VIZ_DISABLE=false does not interfere"
    (tu/with-premium-features #{:custom-viz}
      (mt/with-temp-env-var-value! ["MB_CUSTOM_VIZ_DISABLE" "false"]
        (is (true? (premium-features/enable-custom-viz?))))))
  (testing "Without the env var, feature flag works normally"
    (tu/with-premium-features #{:custom-viz}
      (is (true? (premium-features/enable-custom-viz?))))
    (tu/with-premium-features #{}
      (is (false? (premium-features/enable-custom-viz?))))))
