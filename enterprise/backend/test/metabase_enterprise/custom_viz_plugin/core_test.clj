(ns ^:synchronous metabase-enterprise.custom-viz-plugin.core-test
  "Tests for the defenterprise custom-viz-plugin functions — both OSS stubs and EE implementations."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase.custom-viz-plugin.core :as custom-viz-plugin]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [csp-img-enabled true
                                       custom-viz-enabled true]
      (thunk))))

(deftest oss-resolve-bundle-test
  (testing "OSS stub returns nil"
    (mt/with-premium-features #{}
      (is (nil? (custom-viz-plugin/resolve-bundle {:id 1}))))))

(deftest ee-resolve-bundle-delegates-test
  (testing "EE resolve-bundle delegates to cache/resolve-bundle"
    (mt/with-premium-features #{:custom-viz}
      (let [plugin {:id 42 :identifier "viz"}]
        (with-redefs [cache/resolve-bundle (fn [p] (when (= p plugin) {:content "js-code" :hash "abc"}))]
          (is (= {:content "js-code" :hash "abc"}
                 (custom-viz-plugin/resolve-bundle plugin))))))))
