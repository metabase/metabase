(ns metabase.api.actions-test
  (:require [clojure.test :refer :all]
            [metabase.api.actions :as api.actions]
            [metabase.test :as mt]))

(comment api.actions/keep-me)

;; TODO -- once we add a new endpoint rework these tests to test those and remove the dummy endpoint.
(deftest global-feature-flag-test
  (testing "Enable or disable endpoints based on the `experimental-enable-actions` feature flag"
    (testing "Should return a 400 if feature flag is disabled"
      (mt/with-temporary-setting-values [experimental-enable-actions false]
        (is (= "Actions are not enabled."
               (mt/user-http-request :crowberto :get 400 "actions/dummy")))))
    (testing "Should work if feature flag is enabled"
      (mt/with-temporary-setting-values [experimental-enable-actions true]
        (is (= {:dummy true}
               (mt/user-http-request :crowberto :get 200 "actions/dummy")))))))
