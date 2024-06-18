(ns metabase.api.util-test
  "Tests for /api/util"
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.util :as api.util]
   [metabase.test :as mt]
   [metabase.util.log :as log]))

(deftest password-check-test
  (testing "POST /api/util/password_check"
    (testing "Test for required params"
      (is (=? {:errors {:password "password is too common."}}
              (mt/client :post 400 "util/password_check" {}))))

    (testing "Test complexity check"
      (is (=? {:errors {:password "password is too common."}}
              (mt/client :post 400 "util/password_check" {:password "blah"}))))

    (testing "Should be a valid password"
      (is (= {:valid true}
             (mt/client :post 200 "util/password_check" {:password "something123"}))))))

(deftest logs-test
  (testing "Call includes recent logs (#24616)"
    (mt/with-log-level :warn
      (let [message "Sample warning message for test"]
        (log/warn message)
        (let [logs (mt/user-http-request :crowberto :get 200 "util/logs")]
          (is (pos? (count logs)) "No logs returned from `util/logs`")
          (is (some (comp #(re-find (re-pattern message) %) :msg) logs)
              "Recent message not found in `util/logs`"))))))

(deftest permissions-test
  (testing "/util/logs"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "util/logs"))))
    (testing "Call successful for superusers"
      (mt/user-http-request :crowberto :get 200 "util/logs")))

  (testing "/util/bug_report_details"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "util/bug_report_details"))))
    (testing "Call successful for superusers"
      (is (map? (mt/user-http-request :crowberto :get 200 "util/bug_report_details")))))

  (testing "/util/stats"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "util/stats"))))
    (testing "Call successful for superusers"
      (is (map? (mt/user-http-request :crowberto :get 200 "util/stats")))))

  (testing "/diagnostic_info/connection_pool_info"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "util/diagnostic_info/connection_pool_info"))))
    (testing "Call successful for superusers"
      (is (map? (mt/user-http-request :crowberto :get 200 "util/diagnostic_info/connection_pool_info"))))))

(deftest product-feedback-tests
  (testing "requires non-blank source"
    (let [payload  {:comments "foo"
                    :email    "foo"}
          response (mt/user-http-request :crowberto :post 400 "util/product-feedback" payload)]
      (testing (str "without " :source)
        (is (= {:errors          {:source "value must be a non-blank string."},
                :specific-errors {:source ["should be a string, received: nil" "non-blank string, received: nil"]}}
               response)))))
  (testing "fires the proxy in background"
    (let [sent? (promise)]
      (with-redefs [api.util/send-feedback! (fn [comments source email]
                                              (doseq [prop [comments source email]]
                                                (is (not (str/blank? prop)) "got a blank property to send-feedback!"))
                                              (deliver sent? true))]
        (mt/user-http-request :crowberto :post 204 "util/product-feedback"
                              {:comments "I like Metabase"
                               :email    "happy_user@test.com"
                               :source   "Analytics Inc"})
        (is (true? (deref sent? 2000 ::timedout)))))))
