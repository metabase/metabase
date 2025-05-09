(ns metabase.bug-reporting.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest ^:parallel permissions-test
  (testing "/bug-reporting/details"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "bug-reporting/details"))))
    (testing "Call successful for superusers"
      (is (map? (mt/user-http-request :crowberto :get 200 "bug-reporting/details"))))))
