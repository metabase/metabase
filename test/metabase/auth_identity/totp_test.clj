(ns metabase.auth-identity.totp-test
  (:require
   [clojure.test :refer :all]
   [metabase.auth-identity.totp :as totp]
   [metabase.util.password :as u.password]))

(set! *warn-on-reflection* true)

(deftest generate-secret-test
  (testing "generates a non-empty Base32 string"
    (let [secret (totp/generate-secret)]
      (is (string? secret))
      (is (pos? (count secret)))
      (is (re-matches #"[A-Z2-7=]+" secret))))

  (testing "generates unique secrets"
    (let [secrets (repeatedly 10 totp/generate-secret)]
      (is (= 10 (count (set secrets)))))))

(deftest totp-code-test
  (testing "generates 6-digit codes"
    (let [secret (totp/generate-secret)
          code   (totp/totp-code secret 1000000)]
      (is (string? code))
      (is (= 6 (count code)))
      (is (re-matches #"\d{6}" code))))

  (testing "same secret + step produces same code"
    (let [secret (totp/generate-secret)]
      (is (= (totp/totp-code secret 12345)
             (totp/totp-code secret 12345)))))

  (testing "different steps produce different codes (most of the time)"
    (let [secret (totp/generate-secret)
          codes  (set (map #(totp/totp-code secret %) (range 100 110)))]
      ;; At least 5 out of 10 should be different (collisions possible but rare)
      (is (>= (count codes) 5)))))

(deftest valid-code-test
  (testing "accepts the current code"
    (let [secret     (totp/generate-secret)
          time-step  (quot (quot (System/currentTimeMillis) 1000) 30)
          valid-code (totp/totp-code secret time-step)]
      (is (true? (totp/valid-code? secret valid-code)))))

  (testing "rejects an incorrect code"
    (let [secret (totp/generate-secret)]
      (is (false? (totp/valid-code? secret "000000")))
      (is (false? (totp/valid-code? secret "123456"))))))

(deftest generate-recovery-codes-test
  (testing "generates the right number of codes"
    (let [{:keys [plaintext hashed]} (totp/generate-recovery-codes)]
      (is (= 10 (count plaintext)))
      (is (= 10 (count hashed)))))

  (testing "plaintext codes are 8-char alphanumeric"
    (let [{:keys [plaintext]} (totp/generate-recovery-codes)]
      (doseq [code plaintext]
        (is (= 8 (count code)))
        (is (re-matches #"[a-z0-9]+" code)))))

  (testing "hashed codes are valid bcrypt hashes"
    (let [{:keys [plaintext hashed]} (totp/generate-recovery-codes)]
      (doseq [[plain hash] (map vector plaintext hashed)]
        (is (u.password/bcrypt-verify plain hash))))))

(deftest verify-recovery-code-test
  (testing "verifies a valid recovery code and removes it"
    (let [{:keys [plaintext hashed]} (totp/generate-recovery-codes)
          code-to-use                (first plaintext)
          {:keys [valid? remaining]} (totp/verify-recovery-code code-to-use hashed)]
      (is (true? valid?))
      (is (= 9 (count remaining)))))

  (testing "rejects an invalid recovery code"
    (let [{:keys [hashed]}           (totp/generate-recovery-codes)
          {:keys [valid? remaining]} (totp/verify-recovery-code "invalidx" hashed)]
      (is (false? valid?))
      (is (= 10 (count remaining))))))

(deftest otpauth-uri-test
  (testing "builds a valid otpauth URI"
    (let [uri (totp/otpauth-uri "JBSWY3DPEHPK3PXP" "user@example.com" "Metabase")]
      (is (clojure.string/starts-with? uri "otpauth://totp/"))
      (is (clojure.string/includes? uri "secret=JBSWY3DPEHPK3PXP"))
      (is (clojure.string/includes? uri "issuer=Metabase"))
      (is (clojure.string/includes? uri "digits=6"))
      (is (clojure.string/includes? uri "period=30")))))
