(ns metabase-enterprise.custom-viz-plugin.cross-setting-test
  "Cross-setting constraints between `custom-viz-enabled` (enterprise) and
  `csp-img-enabled` (OSS)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.premium-features.test-util :as tu]
   [metabase.server.settings :as server.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest custom-viz-enabled-requires-csp-img-enabled-test
  (testing "Enabling custom-viz-enabled while csp-img-enabled is false is rejected"
    (tu/with-premium-features #{:custom-viz}
      (mt/with-temporary-setting-values [csp-img-enabled false
                                         custom-viz-enabled false]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Turn on the image CSP setting"
             (custom-viz.settings/custom-viz-enabled! true)))
        (is (false? (custom-viz.settings/custom-viz-enabled))))))
  (testing "Enabling custom-viz-enabled succeeds when csp-img-enabled is true"
    (tu/with-premium-features #{:custom-viz}
      (mt/with-temporary-setting-values [csp-img-enabled true
                                         custom-viz-enabled false]
        (custom-viz.settings/custom-viz-enabled! true)
        (is (true? (custom-viz.settings/custom-viz-enabled)))
        (custom-viz.settings/custom-viz-enabled! false))))
  (testing "Disabling custom-viz-enabled is always allowed"
    (tu/with-premium-features #{:custom-viz}
      (mt/with-temporary-setting-values [csp-img-enabled false
                                         custom-viz-enabled false]
        (custom-viz.settings/custom-viz-enabled! false)
        (is (false? (custom-viz.settings/custom-viz-enabled)))))))

(deftest csp-img-enabled-locked-while-custom-viz-on-test
  (testing "Cannot disable csp-img-enabled while custom-viz-enabled is true"
    (tu/with-premium-features #{:custom-viz}
      (mt/with-temporary-setting-values [csp-img-enabled true
                                         custom-viz-enabled true]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cannot disable the image CSP setting"
             (server.settings/csp-img-enabled! false)))
        (is (true? (server.settings/csp-img-enabled))))))
  (testing "Can disable csp-img-enabled once custom-viz-enabled is off"
    (tu/with-premium-features #{:custom-viz}
      (mt/with-temporary-setting-values [csp-img-enabled true
                                         custom-viz-enabled false]
        (server.settings/csp-img-enabled! false)
        (is (false? (server.settings/csp-img-enabled)))))))
