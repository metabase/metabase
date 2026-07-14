(ns metabase-enterprise.mfa.recovery-codes-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.recovery-codes :as recovery-codes]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- fresh-jti [] (str (random-uuid)))

(deftest ^:parallel generate-codes-test
  (let [codes (recovery-codes/generate-codes)]
    (is (= recovery-codes/num-codes (count codes)))
    (is (every? recovery-codes/recovery-code? codes))
    (is (= (count codes) (count (distinct codes))))
    (testing "a TOTP code never looks like a recovery code"
      (is (not (recovery-codes/recovery-code? "123456"))))))

(defmacro ^:private with-confirmed-enrollment! [[user-id-binding secret-binding] & body]
  `(let [~secret-binding (totp/generate-secret)]
     (mt/with-temp [:model/User {~user-id-binding :id} {}
                    :model/AuthIdentity ~'_ {:user_id     ~user-id-binding
                                             :provider    "totp"
                                             :confirmed_at (t/instant)
                                             :credentials  {:secret ~secret-binding}}]
       ~@body)))

(deftest reset-recovery-codes-test
  (with-confirmed-enrollment! [user-id _secret]
    (let [codes (enrollment/reset-recovery-codes! user-id)]
      (is (= recovery-codes/num-codes (count codes)))
      (is (= recovery-codes/num-codes (enrollment/recovery-codes-remaining user-id)))
      (testing "only hashes are stored"
        (let [stored (get-in (t2/select-one :model/AuthIdentity :user_id user-id :provider "totp")
                             [:credentials :recovery_codes])]
          (is (every? #(.startsWith ^String % "$2a$") stored))
          (is (empty? (set/intersection (set codes) (set stored)))))))))

(deftest reset-requires-confirmed-enrollment-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :credentials {:secret secret}}]
      (is (nil? (enrollment/reset-recovery-codes! user-id))))))

(deftest recovery-code-single-use-test
  (with-confirmed-enrollment! [user-id _secret]
    (let [[code & _] (enrollment/reset-recovery-codes! user-id)]
      (is (true? (verification/verify-attempt! user-id code (fresh-jti))))
      (is (= (dec recovery-codes/num-codes) (enrollment/recovery-codes-remaining user-id)))
      (testing "consumed — never accepted again"
        (is (false? (verification/verify-attempt! user-id code (fresh-jti))))))))

(deftest regenerate-invalidates-old-set-test
  (with-confirmed-enrollment! [user-id _secret]
    (let [[old-code & _] (enrollment/reset-recovery-codes! user-id)
          new-codes      (enrollment/reset-recovery-codes! user-id)]
      (testing "old set is dead in its entirety"
        (is (false? (verification/verify-attempt! user-id old-code (fresh-jti)))))
      (testing "new set works"
        (is (true? (verification/verify-attempt! user-id (first new-codes) (fresh-jti))))))))

(deftest recovery-path-consumes-jti-test
  (with-confirmed-enrollment! [user-id secret]
    (let [[code-a code-b & _] (enrollment/reset-recovery-codes! user-id)
          jti                 (fresh-jti)]
      (is (true? (verification/verify-attempt! user-id code-a jti)))
      (testing "the jti is burned across factor kinds — a second unused recovery code can't reuse it"
        (is (false? (verification/verify-attempt! user-id code-b jti))))
      (testing "nor can a fresh TOTP code"
        (is (false? (verification/verify-attempt! user-id (totp/generate-code secret) jti)))))))

(deftest wrong-recovery-code-rejected-test
  (with-confirmed-enrollment! [user-id _secret]
    (enrollment/reset-recovery-codes! user-id)
    (is (false? (verification/verify-attempt! user-id "aaaaa-aaaaa" (fresh-jti))))
    (is (= recovery-codes/num-codes (enrollment/recovery-codes-remaining user-id)))))
