(ns metabase-enterprise.custom-viz-plugin.core-test
  "Tests for the defenterprise custom-viz-plugin functions — both OSS stubs and EE implementations."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase.custom-viz-plugin.core :as custom-viz-plugin]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [custom-viz-enabled true]
      (thunk))))

;;; ------------------------------------------------ OSS Stubs ------------------------------------------------

(deftest oss-resolve-bundle-test
  (testing "OSS stub returns nil"
    (mt/with-premium-features #{}
      (is (nil? (custom-viz-plugin/resolve-bundle {:id 1}))))))

(deftest oss-resolve-asset-test
  (testing "OSS stub returns nil"
    (mt/with-premium-features #{}
      (is (nil? (custom-viz-plugin/resolve-asset {:id 1} "icon.svg"))))))

(deftest oss-asset-paths-test
  (testing "OSS stub returns empty vector"
    (mt/with-premium-features #{}
      (is (= [] (custom-viz-plugin/asset-paths {:assets ["icon.svg"]}))))))

(deftest oss-asset-content-type-test
  (testing "OSS stub returns nil"
    (mt/with-premium-features #{}
      (is (nil? (custom-viz-plugin/asset-content-type "icon.svg"))))))

;;; ------------------------------------------------ Enterprise Implementations ------------------------------------------------

(deftest ee-resolve-bundle-delegates-test
  (testing "EE resolve-bundle delegates to cache/resolve-bundle"
    (mt/with-premium-features #{:custom-viz}
      (let [plugin {:id 42 :identifier "viz"}]
        (with-redefs [cache/resolve-bundle (fn [p] (when (= p plugin) {:content "js-code" :hash "abc"}))]
          (is (= {:content "js-code" :hash "abc"}
                 (custom-viz-plugin/resolve-bundle plugin))))))))

(deftest ee-resolve-asset-delegates-test
  (testing "EE resolve-asset delegates to cache/resolve-asset"
    (mt/with-premium-features #{:custom-viz}
      (let [plugin         {:id 42}
            expected-bytes (.getBytes "img-data")]
        (with-redefs [cache/resolve-asset (fn [p path]
                                            (when (and (= p plugin) (= path "icon.svg"))
                                              expected-bytes))]
          (is (= expected-bytes
                 (custom-viz-plugin/resolve-asset plugin "icon.svg"))))))))

(deftest ee-asset-paths-delegates-test
  (testing "EE asset-paths delegates to manifest/asset-paths"
    (mt/with-premium-features #{:custom-viz}
      (is (= ["icon.svg" "thumb.png"]
             (custom-viz-plugin/asset-paths {:assets ["icon.svg" "thumb.png"]}))))))

(deftest ee-asset-content-type-delegates-test
  (testing "EE asset-content-type delegates to manifest/asset-content-type"
    (mt/with-premium-features #{:custom-viz}
      (is (= "image/svg+xml" (custom-viz-plugin/asset-content-type "icon.svg")))
      (is (= "image/png" (custom-viz-plugin/asset-content-type "thumb.png")))
      (is (nil? (custom-viz-plugin/asset-content-type "script.js"))))))
