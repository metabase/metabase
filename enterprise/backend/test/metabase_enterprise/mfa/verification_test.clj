(ns metabase-enterprise.mfa.verification-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.recovery-codes :as recovery-codes]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.encryption.impl :as encryption.impl]
   [metabase.encryption.impl-test :as encryption-test]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util.password :as u.password]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- fresh-jti [] (str (random-uuid)))

;;; -------------------------------------------------- verify-attempt! unit tests --------------------------------------------------

(deftest verify-consumes-time-step-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :confirmed_at (t/instant)
                                          :credentials  {:secret secret}}]
      (let [code (totp/generate-code secret)]
        (is (true? (verification/verify-attempt! user-id code (fresh-jti))))
        (testing "the same code is rejected on replay, even with a fresh challenge token (RFC 6238 SS5.2)"
          (is (false? (verification/verify-attempt! user-id code (fresh-jti)))))))))

(deftest verify-rejects-used-jti-test
  (let [secret (totp/generate-secret)
        jti    (fresh-jti)
        now    (quot (System/currentTimeMillis) 1000)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :confirmed_at (t/instant)
                                          :credentials {:secret       secret
                                                        :used_jtis    [{:jti jti :exp (+ now 600)}]}}]
      (testing "a consumed challenge token cannot mint a second session, even with a fresh valid code"
        (is (false? (verification/verify-attempt! user-id (totp/generate-code secret) jti)))))))

(deftest verify-rejects-stale-step-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :confirmed_at (t/instant)
                                          :credentials {:secret         secret
                                                        ;; pretend a code one step ahead was already accepted
                                                        :last_used_step (inc (totp/current-time-step))}}]
      (testing "codes at or before the last accepted step are rejected"
        (is (false? (verification/verify-attempt! user-id (totp/generate-code secret) (fresh-jti))))))))

(deftest verify-rejects-unconfirmed-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :credentials {:secret secret}}]
      (is (false? (verification/verify-attempt! user-id (totp/generate-code secret) (fresh-jti)))))))

(deftest expired-jtis-are-pruned-test
  (let [secret (totp/generate-secret)
        now    (quot (System/currentTimeMillis) 1000)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity {ai-id :id} {:user_id     user-id
                                                    :provider    "totp"
                                                    :confirmed_at (t/instant)
                                                    :credentials {:secret       secret
                                                                  :used_jtis    [{:jti "stale" :exp (- now 10)}]}}]
      (is (true? (verification/verify-attempt! user-id (totp/generate-code secret) (fresh-jti))))
      (let [jtis (get-in (t2/select-one :model/AuthIdentity :id ai-id) [:credentials :used_jtis])]
        (testing "the expired jti is gone; the fresh one is recorded"
          (is (= 1 (count jtis)))
          (is (not= "stale" (:jti (first jtis)))))))))

;;; -------------------------------------------------- Concurrency tests --------------------------------------------------

;; These tests verify the security invariant: two concurrent requests with the same one-time
;; credential cannot both succeed. The invariant relies on SELECT FOR UPDATE inside
;; t2/with-transaction.
;;
;; Implementation note: we must use with-model-cleanup (committed data) rather than mt/with-temp
;; (rollback-only transaction) here, because each future gets its own fresh DB connection via
;; `binding [t2.conn/*current-connectable* nil]`. Fresh connections can only see committed rows;
;; rows in an uncommitted test transaction are invisible to them.

(deftest concurrent-recovery-code-single-use-test
  (testing "only one of N concurrent threads can consume the same recovery code"
    (let [secret    (totp/generate-secret)
          all-codes (recovery-codes/generate-codes)
          code      (first all-codes)]
      (tu/with-model-cleanup [:model/User :model/AuthIdentity]
        (let [{user-id :id} (t2/insert-returning-instance! :model/User {:first_name "Conc" :last_name "Test"
                                                                        :email      (str (random-uuid) "@test.com")
                                                                        :password   "unused"})]
          (t2/insert! :model/AuthIdentity {:user_id     user-id
                                           :provider    "totp"
                                           :confirmed_at (t/instant)
                                           :credentials {:secret         secret
                                                         :recovery_codes (mapv u.password/hash-bcrypt all-codes)}})
          (let [latch   (java.util.concurrent.CountDownLatch. 1)
                threads 8
                ;; Each future binds *current-connectable* to nil to acquire a fresh independent
                ;; DB connection (not the test-transaction connection), so SELECT FOR UPDATE
                ;; actually serializes concurrent access.
                futures (doall
                         (repeatedly threads
                                     (fn []
                                       (future
                                         (.await latch)
                                         (binding [t2.conn/*current-connectable* nil]
                                           (verification/verify-attempt! user-id code (fresh-jti)))))))]
            ;; release the gate -- all threads race
            (.countDown latch)
            (let [results (mapv #(deref % 10000 :timeout) futures)]
              (testing "no timeouts"
                (is (not-any? #{:timeout} results)))
              (testing "exactly one attempt succeeds"
                (is (= 1 (count (filter true? results)))))
              (testing "the code is fully consumed (0 of that code remain)"
                (binding [t2.conn/*current-connectable* nil]
                  (is (= 0 (count (filter #(u.password/bcrypt-verify code %)
                                          (get-in (t2/select-one :model/AuthIdentity
                                                                 :user_id user-id :provider "totp")
                                                  [:credentials :recovery_codes]))))))))))))))

(deftest concurrent-totp-code-single-use-test
  (testing "only one of N concurrent threads can consume the same TOTP time step"
    (let [secret (totp/generate-secret)]
      (tu/with-model-cleanup [:model/User :model/AuthIdentity]
        (let [{user-id :id} (t2/insert-returning-instance! :model/User {:first_name "Conc" :last_name "Totp"
                                                                        :email      (str (random-uuid) "@test.com")
                                                                        :password   "unused"})]
          (t2/insert! :model/AuthIdentity {:user_id     user-id
                                           :provider    "totp"
                                           :confirmed_at (t/instant)
                                           :credentials  {:secret secret}})
          (let [code    (totp/generate-code secret)
                latch   (java.util.concurrent.CountDownLatch. 1)
                threads 8
                futures (doall
                         (repeatedly threads
                                     (fn []
                                       (future
                                         (.await latch)
                                         (binding [t2.conn/*current-connectable* nil]
                                           (verification/verify-attempt! user-id code (fresh-jti)))))))]
            (.countDown latch)
            (let [results (mapv #(deref % 10000 :timeout) futures)]
              (testing "no timeouts"
                (is (not-any? #{:timeout} results)))
              (testing "exactly one attempt succeeds"
                (is (= 1 (count (filter true? results))))))))))))

;;; -------------------------------------------------- Encryption-key rollover --------------------------------------------------

(deftest key-rollover-test
  (testing "an enrollment written under key A verifies after the column is rotated to key B"
    ;; The full `rotate-encryption-key` walk over `encrypted-json-columns` (which includes
    ;; [:auth_identity :credentials]) is exercised by metabase.cmd.rotate-encryption-key-test;
    ;; this covers the MFA-specific end of it: rotate this row the way the command does —
    ;; decrypt raw value with the old key, re-encrypt with the new — then verify a login code
    ;; under the new key.
    (let [secret (totp/generate-secret)
          k1     "0123456789abcdef-key-A"
          k2     "fedcba9876543210-key-B"]
      (mt/with-temp [:model/User {user-id :id} {}]
        (encryption-test/with-secret-key k1
          (t2/insert! :model/AuthIdentity {:user_id     user-id
                                           :provider    "totp"
                                           :confirmed_at (t/instant)
                                           :credentials  {:secret secret}}))
        (let [ai-id     (t2/select-one-fn :id :auth_identity :user_id user-id :provider "totp")
              raw       (t2/select-one-fn :credentials :auth_identity :id ai-id)
              plaintext (encryption-test/with-secret-key k1
                          (encryption.impl/maybe-decrypt raw))
              rotated   (encryption-test/with-secret-key k2
                          (encryption.impl/maybe-encrypt plaintext))]
          (is (encryption.impl/possibly-encrypted-string? raw) "sanity: stored under key A as ciphertext")
          (t2/update! :auth_identity ai-id {:credentials rotated}))
        (encryption-test/with-secret-key k2
          (is (true? (verification/verify-attempt! user-id (totp/generate-code secret) (fresh-jti)))
              "the rotated enrollment verifies under the new key"))
        (encryption-test/with-secret-key k1
          ;; encrypted-json-out falls back to the raw ciphertext string, on which the
          ;; timestamp-parsing transform then blows up — either way the old key can't read the row
          (is (thrown? Exception
                       (t2/select-one-fn :credentials :model/AuthIdentity
                                         :user_id user-id :provider "totp"))
              "sanity: the old key can no longer read the row"))))))

(deftest lost-encryption-key-fails-closed-test
  (testing "an instance started with the wrong key: verify errors (no bypass, no session), and
            admin removal — which never decrypts — still recovers the account"
    (let [secret (totp/generate-secret)
          k1     "0123456789abcdef-key-A"
          k2     "totally-different-key-B!"]
      (mt/with-temp [:model/User {user-id :id} {}]
        (encryption-test/with-secret-key k1
          (t2/insert! :model/AuthIdentity {:user_id     user-id
                                           :provider    "totp"
                                           :confirmed_at (t/instant)
                                           :credentials  {:secret secret}}))
        (encryption-test/with-secret-key k2
          (testing "verification fails closed — an error, never a false-positive login"
            (is (thrown? Exception
                         (verification/verify-attempt! user-id (totp/generate-code secret) (fresh-jti)))))
          (testing "the enrollment row survives the failed attempt"
            (is (= 1 (t2/count :auth_identity :user_id user-id :provider "totp"))))
          (testing "disable! deletes without decrypting, so the admin escape hatch works"
            (is (true? (enrollment/disable! user-id)))
            (is (zero? (t2/count :auth_identity :user_id user-id :provider "totp")))))))))
