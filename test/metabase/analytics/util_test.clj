(ns metabase.analytics.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.util :as analytics.util]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel uuid->ai-service-hex-uuid-test
  (testing "UUID string produces 32-char hex string"
    (is (re-matches #"[0-9a-f]{32}" (analytics.util/uuid->ai-service-hex-uuid (str (random-uuid))))))
  (testing "UUID object produces 32-char hex string"
    (is (re-matches #"[0-9a-f]{32}" (analytics.util/uuid->ai-service-hex-uuid (random-uuid))))))

(deftest hashed-metabase-token-or-uuid-test
  (testing "no premium token → returns oss__<analytics-uuid>"
    (let [test-uuid "test-analytics-uuid-12345"]
      (mt/with-temporary-setting-values [premium-embedding-token nil
                                         analytics-uuid          test-uuid]
        (is (= (str "oss__" test-uuid)
               (analytics.util/hashed-metabase-token-or-uuid))))))
  (testing "premium token set → returns 64-char SHA-256 hex (no oss__ prefix)"
    (mt/with-random-premium-token! [premium-token]
      (mt/with-temporary-setting-values [premium-embedding-token premium-token]
        (is (re-matches #"[0-9a-f]{64}"
                        (analytics.util/hashed-metabase-token-or-uuid)))))))
