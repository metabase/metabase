(ns metabase.auth-identity.totp-test
  (:require
   [clojure.test :refer :all]
   [metabase.auth-identity.totp :as totp]
   [metabase.util.password :as u.password])
  (:import
   (org.apache.commons.codec.binary Base32)))

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

;;; -------------------------------------------------- RFC Test Vectors --------------------------------------------------

(def ^:private rfc4226-secret-b32
  "Base32 encoding of the ASCII string \"12345678901234567890\" used in RFC 4226 Appendix D."
  (.encodeToString (Base32.) (.getBytes "12345678901234567890" "ASCII")))

(deftest rfc4226-appendix-d-test
  (testing "HOTP codes match RFC 4226 Appendix D test vectors (secret = \"12345678901234567890\")"
    (let [expected ["755224" "287082" "359152" "969429" "338314"
                    "254676" "287922" "162583" "399871" "520489"]]
      (doseq [[count expected-code] (map-indexed vector expected)]
        (testing (str "count=" count)
          (is (= expected-code (totp/totp-code rfc4226-secret-b32 count))))))))

(deftest rfc6238-appendix-b-test
  (testing "TOTP codes match RFC 6238 Appendix B test vectors for SHA1"
    ;; RFC 6238 Appendix B test values (SHA1, 8-digit codes with T0=0 X=30)
    ;; We use the 6-digit implementation so we verify the last 6 digits match
    (let [test-cases [[59          "287082"]
                      [1111111109  "081804"]
                      [1111111111  "050471"]
                      [1234567890  "005924"]
                      [2000000000  "279037"]
                      [20000000000 "353130"]]]
      (doseq [[unix-time expected-6digit] test-cases]
        (testing (str "time=" unix-time)
          (let [step (quot unix-time 30)]
            (is (= expected-6digit (totp/totp-code rfc4226-secret-b32 step)))))))))

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
