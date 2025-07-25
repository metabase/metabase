(ns metabase.request.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.request.settings :as request.settings]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(deftest session-cookie-test
  (testing "`SameSite` value is read from config (env)"
    (mt/with-temp-env-var-value! [:mb-session-cookie-samesite ""]
      (is (= :lax
             (request.settings/session-cookie-samesite))))
    (mt/with-temp-env-var-value! [:mb-session-cookie-samesite "StRiCt"]
      (is (= :strict
             (request.settings/session-cookie-samesite))))
    (mt/with-temp-env-var-value! [:mb-session-cookie-samesite "NONE"]
      (is (= :none
             (request.settings/session-cookie-samesite))))
    (mt/with-temp-env-var-value! [:mb-session-cookie-samesite "invalid value"]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid value for session cookie samesite"
           (request.settings/session-cookie-samesite))))))

(deftest session-timeout-validation-test
  (testing "Setting the session timeout should fail if the timeout isn't positive"
    (is (thrown-with-msg?
         java.lang.Exception
         #"Session timeout amount must be positive"
         (request.settings/session-timeout! {:unit "hours", :amount 0})))
    (is (thrown-with-msg?
         java.lang.Exception
         #"Session timeout amount must be positive"
         (request.settings/session-timeout! {:unit "minutes", :amount -1}))))
  (testing "Setting the session timeout should fail if the timeout is too large"
    (is (thrown-with-msg?
         java.lang.Exception
         #"Session timeout must be less than 100 years"
         (request.settings/session-timeout! {:unit "hours", :amount (* 100 365.25 24)})))
    (is (thrown-with-msg?
         java.lang.Exception
         #"Session timeout must be less than 100 years"
         (request.settings/session-timeout! {:unit "minutes", :amount (* 100 365.25 24 60)}))))
  (testing "Setting the session timeout shouldn't fail if the timeout is between 0 and 100 years exclusive"
    (is (some? (request.settings/session-timeout! {:unit "minutes", :amount 1})))
    (is (some? (request.settings/session-timeout! {:unit "hours", :amount 1})))
    (is (some? (request.settings/session-timeout! {:unit "minutes", :amount (dec (* 100 365.25 24 60))})))
    (is (some? (request.settings/session-timeout! {:unit "hours", :amount (dec (* 100 365.25 24))}))))
  (testing "Setting an invalid timeout via PUT /api/setting/:key endpoint should return a 400 status code"
    (is (= "Session timeout amount must be positive."
           (mt/user-http-request :crowberto :put 400 "setting/session-timeout" {:value {:unit "hours", :amount -1}})))))

(deftest session-timeout-env-var-validation-test
  (let [set-and-get! (fn [timeout]
                       (mt/with-temp-env-var-value! [mb-session-timeout (json/encode timeout)]
                         (request.settings/session-timeout)))]
    (testing "Setting the session timeout with env var should work with valid timeouts"
      (doseq [timeout [{:unit "hours", :amount 1}
                       {:unit "hours", :amount (dec (* 100 365.25 24))}]]
        (is (= timeout
               (set-and-get! timeout)))))
    (testing "Setting the session timeout via the env var should fail if the timeout isn't positive"
      (doseq [amount [0 -1]
              :let [timeout {:unit "hours", :amount amount}]]
        (is (nil? (set-and-get! timeout)))
        (mt/with-log-messages-for-level [messages :warn]
          (set-and-get! timeout)
          (is (=? [{:level :warn, :message "Session timeout amount must be positive."}]
                  (messages))))))
    (testing "Setting the session timeout via env var should fail if the timeout is too large"
      (doseq [timeout [{:unit "hours", :amount (* 100 365.25 24)}
                       {:unit "minutes", :amount (* 100 365.25 24 60)}]]
        (is (nil? (set-and-get! timeout)))
        (mt/with-log-messages-for-level [messages :warn]
          (set-and-get! timeout)
          (is (=? [{:level :warn, :message "Session timeout must be less than 100 years."}]
                  (messages))))))))
