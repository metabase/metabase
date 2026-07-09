(ns metabase-enterprise.mfa.enrollment-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- fresh-jti [] (str (random-uuid)))

(deftest enrolled-method-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {confirmed-id :id} {}
                   :model/AuthIdentity _ {:user_id     confirmed-id
                                          :provider    "totp"
                                          :credentials {:secret secret :confirmed_at (t/instant)}}
                   :model/User        {pending-id :id} {}
                   :model/AuthIdentity _ {:user_id     pending-id
                                          :provider    "totp"
                                          :credentials {:secret secret}}]
      (is (= :totp (enrollment/enrolled-method confirmed-id)))
      (testing "a pending (unconfirmed) enrollment is not a usable second factor"
        (is (nil? (enrollment/enrolled-method pending-id)))))))

(deftest verify-consumes-time-step-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :credentials {:secret secret :confirmed_at (t/instant)}}]
      (let [code (totp/generate-code secret)]
        (is (true? (enrollment/verify-attempt! user-id code (fresh-jti))))
        (testing "the same code is rejected on replay, even with a fresh challenge token (RFC 6238 §5.2)"
          (is (false? (enrollment/verify-attempt! user-id code (fresh-jti)))))))))

(deftest verify-rejects-used-jti-test
  (let [secret (totp/generate-secret)
        jti    (fresh-jti)
        now    (quot (System/currentTimeMillis) 1000)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :credentials {:secret       secret
                                                        :confirmed_at (t/instant)
                                                        :used_jtis    [{:jti jti :exp (+ now 600)}]}}]
      (testing "a consumed challenge token cannot mint a second session, even with a fresh valid code"
        (is (false? (enrollment/verify-attempt! user-id (totp/generate-code secret) jti)))))))

(deftest verify-rejects-stale-step-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :credentials {:secret         secret
                                                        :confirmed_at   (t/instant)
                                                        ;; pretend a code one step ahead was already accepted
                                                        :last_used_step (inc (totp/current-time-step))}}]
      (testing "codes at or before the last accepted step are rejected"
        (is (false? (enrollment/verify-attempt! user-id (totp/generate-code secret) (fresh-jti))))))))

(deftest verify-rejects-unconfirmed-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :credentials {:secret secret}}]
      (is (false? (enrollment/verify-attempt! user-id (totp/generate-code secret) (fresh-jti)))))))

(deftest expired-jtis-are-pruned-test
  (let [secret (totp/generate-secret)
        now    (quot (System/currentTimeMillis) 1000)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity {ai-id :id} {:user_id     user-id
                                                    :provider    "totp"
                                                    :credentials {:secret       secret
                                                                  :confirmed_at (t/instant)
                                                                  :used_jtis    [{:jti "stale" :exp (- now 10)}]}}]
      (is (true? (enrollment/verify-attempt! user-id (totp/generate-code secret) (fresh-jti))))
      (let [jtis (get-in (t2/select-one :model/AuthIdentity :id ai-id) [:credentials :used_jtis])]
        (testing "the expired jti is gone; the fresh one is recorded"
          (is (= 1 (count jtis)))
          (is (not= "stale" (:jti (first jtis)))))))))
