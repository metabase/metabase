(ns metabase-enterprise.mfa.enrollment-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.test :as mt]))

(deftest enrolled-method-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {confirmed-id :id} {}
                   :model/AuthIdentity _ {:user_id     confirmed-id
                                          :provider    "totp"
                                          :confirmed_at (t/instant)
                                          :credentials  {:secret secret}}
                   :model/User        {pending-id :id} {}
                   :model/AuthIdentity _ {:user_id     pending-id
                                          :provider    "totp"
                                          :credentials {:secret secret}}]
      (is (= :totp (enrollment/enrolled-method confirmed-id)))
      (testing "a pending (unconfirmed) enrollment is not a usable second factor"
        (is (nil? (enrollment/enrolled-method pending-id)))))))
