(ns metabase.api.util-test
  "Tests for /api/util"
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest password-check-test
  (testing "POST /api/util/password_check"
    (testing "Test for required params"
      (is (= {:errors {:password "password is too common."}}
             (mt/client :post 400 "util/password_check" {}))))

    (testing "Test complexity check"
      (is (= {:errors {:password "password is too common."}}
             (mt/client :post 400 "util/password_check" {:password "blah"}))))

    (testing "Should be a valid password"
      (is (= {:valid true}
             (mt/client :post 200 "util/password_check" {:password "something123"}))))))
