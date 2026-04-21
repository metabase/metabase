(ns metabase-enterprise.premium-features.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.test-util :as tu]
   [metabase.test :as mt]))

(deftest enable-custom-viz-test
  (testing "enable-custom-viz? is false by default (setting defaults to false)"
    (tu/with-premium-features #{:custom-viz}
      (is (false? (premium-features/enable-custom-viz?)))))
  (testing "enable-custom-viz? is true when admin opts in via the setting"
    (tu/with-premium-features #{:custom-viz}
      (mt/with-temporary-setting-values [custom-viz-enabled true]
        (is (true? (premium-features/enable-custom-viz?))))))
  (testing "enable-custom-viz? is false without the :custom-viz token feature, even when the setting is on"
    (tu/with-premium-features #{}
      (mt/with-temporary-setting-values [custom-viz-enabled true]
        (is (false? (premium-features/enable-custom-viz?))))))
  (testing "MB_CUSTOM_VIZ_ENABLED env var can toggle the setting"
    (tu/with-premium-features #{:custom-viz}
      (mt/with-temp-env-var-value! ["MB_CUSTOM_VIZ_ENABLED" "true"]
        (is (true? (custom-viz.settings/custom-viz-enabled)))
        (is (true? (premium-features/enable-custom-viz?)))))))
