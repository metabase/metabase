(ns metabase-enterprise.mfa.totp-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.test :as mt]))

(def ^:private rfc-secret
  "RFC 6238 Appendix B seed (ASCII \"12345678901234567890\") encoded as Base32, for HMAC-SHA1."
  "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")

(deftest ^:parallel rfc6238-vectors-test
  (testing "6-digit truncations of the RFC 6238 Appendix B SHA1 test vectors (proves interop with authenticator apps)"
    (are [unix expected] (= expected (totp/code-for-unix-time rfc-secret unix))
      59          "287082"
      1111111109  "081804"
      1111111111  "050471"
      1234567890  "005924"
      2000000000  "279037"
      ;; T > 32 bits — proves 64-bit time-step handling (RFC 6238 Appendix A note)
      20000000000 "353130")))

(deftest ^:parallel round-trip-test
  (let [secret (totp/generate-secret)]
    (testing "a generated secret is unpadded Base32"
      (is (re-matches #"[A-Z2-7]+" secret)))
    (testing "a freshly generated code validates"
      (is (totp/valid-code? secret (totp/generate-code secret))))
    (testing "malformed codes never validate"
      (is (not (totp/valid-code? secret "12")))
      (is (not (totp/valid-code? secret "abcdef")))
      (is (not (totp/valid-code? secret nil))))))

(deftest ^:parallel validation-window-test
  (let [secret  (totp/generate-secret)
        now     (totp/current-time-step)
        code-at (fn [^long step] (totp/code-for-unix-time secret (* step 30)))]
    ;; pin the clock so a step boundary mid-test can't move the window
    (mt/with-dynamic-fn-redefs [totp/current-time-step (constantly now)]
      (testing "the current step and one step either side validate, and report their step"
        (are [step] (= step (totp/matching-time-step secret (code-at step)))
          (dec now)
          now
          (inc now)))
      (testing "steps two or more away do not validate"
        (are [step] (nil? (totp/matching-time-step secret (code-at step)))
          (- now 2)
          (+ now 2))))))
