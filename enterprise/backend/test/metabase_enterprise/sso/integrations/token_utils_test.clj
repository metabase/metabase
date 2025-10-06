(ns metabase-enterprise.sso.integrations.token-utils-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.sso.integrations.token-utils :as token-utils]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption])
  (:import
   (java.net URLDecoder URLEncoder)))

(set! *warn-on-reflection* true)

(deftest generate-token-test
  (testing "generate-token"
    (testing "should generate a URL-encoded string"
      (let [token (token-utils/generate-token)]
        (is (string? token))
        ;; The token should be URL-encoded, so it shouldn't contain characters like + or / that need encoding
        (is (re-matches #"[A-Za-z0-9%._-]+" token))
        ;; Should be decodable as a URL-encoded string
        (is (string? (URLDecoder/decode token "UTF-8")))))

    (testing "should contain valid timestamp, expiration, and nonce when decrypted"
      (mt/with-temporary-setting-values [sdk-encryption-validation-key "1FlZMdousOLX9d3SSL+KuWq2+l1gfKoFM7O4ZHqKjTgabo7QdqP8US2bNPN+PqisP1QOKvesxkxOigIrvvd5OQ=="]
        (let [token           (token-utils/generate-token)
              decoded-token   (URLDecoder/decode token "UTF-8")
              decrypted       (encryption/decrypt (encryption/secret-key->hash "1FlZMdousOLX9d3SSL+KuWq2+l1gfKoFM7O4ZHqKjTgabo7QdqP8US2bNPN+PqisP1QOKvesxkxOigIrvvd5OQ==") decoded-token)
              [ts exp nonce]  (str/split decrypted #"\." 3)
              timestamp       (Long/parseLong ts)
              expiration      (Long/parseLong exp)]
          ;; Timestamp should be recent (within last 5 seconds)
          (is (> timestamp (- (/ (System/currentTimeMillis) 1000) 5)))
          ;; Expiration should be about 5 minutes (300 seconds) in the future
          (is (< (- expiration timestamp) 301))
          (is (> (- expiration timestamp) 299))
          ;; Nonce should be a valid UUID string
          (is (re-matches #"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" nonce)))))

    (testing "should generate different tokens on each call"
      (let [token1 (token-utils/generate-token)
            token2 (token-utils/generate-token)]
        (is (not= token1 token2))))))

(deftest validate-token-test
  (testing "validate-token"
    (mt/with-temporary-setting-values [sdk-encryption-validation-key "1FlZMdousOLX9d3SSL+KuWq2+l1gfKoFM7O4ZHqKjTgabo7QdqP8US2bNPN+PqisP1QOKvesxkxOigIrvvd5OQ=="]
      (let [encryption-key (encryption/secret-key->hash "1FlZMdousOLX9d3SSL+KuWq2+l1gfKoFM7O4ZHqKjTgabo7QdqP8US2bNPN+PqisP1QOKvesxkxOigIrvvd5OQ==")]

        (testing "returns true for valid non-expired token"
          (let [now (t/instant)
                expiration (t/instant (t/plus now (t/seconds 300)))
                nonce (random-uuid)
                payload (str (.getEpochSecond now) "." (.getEpochSecond expiration) "." nonce)
                encrypted (encryption/encrypt encryption-key payload)
                token (URLEncoder/encode encrypted "UTF-8")]
            (is (true? (token-utils/validate-token token)))))

        (testing "returns false for expired token"
          (let [now (t/instant)
                expiration (t/instant (t/minus now (t/seconds 10))) ;; 10 seconds in the past
                nonce (random-uuid)
                payload (str (.getEpochSecond now) "." (.getEpochSecond expiration) "." nonce)
                encrypted (encryption/encrypt encryption-key payload)
                token (URLEncoder/encode encrypted "UTF-8")]
            (is (false? (token-utils/validate-token token)))))

        (testing "returns false for nil token"
          (is (false? (token-utils/validate-token nil))))

        (testing "returns false for empty string token"
          (is (false? (token-utils/validate-token ""))))

        (testing "returns false for invalid token format"
          (is (false? (token-utils/validate-token "not-a-valid-token"))))

        (testing "returns false for tampered token"
          (let [now (t/instant)
                expiration (t/instant (t/plus now (t/seconds 300)))
                nonce (random-uuid)
                payload (str (.getEpochSecond now) "." (.getEpochSecond expiration) "." nonce)
                encrypted (encryption/encrypt encryption-key payload)
                token (URLEncoder/encode (str encrypted "tampered") "UTF-8")]
            (is (false? (token-utils/validate-token token)))))))))
