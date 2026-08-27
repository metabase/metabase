(ns metabase.server.routes.static-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.routes.static :as static]))

(deftest ^:parallel parse-accept-encoding-nil-header-test
  (testing "nil header returns identity-only defaults"
    (is (= {:identity 1.0 :* 0.0}
           (#'static/parse-accept-encoding nil)))))

(deftest ^:parallel parse-accept-encoding-simple-test
  (testing "single encoding without q-value defaults to 1.0"
    (is (= {:identity 1.0 :* 0.0 :gzip 1.0}
           (#'static/parse-accept-encoding "gzip")))))

(deftest ^:parallel parse-accept-encoding-multiple-test
  (testing "multiple encodings without q-values"
    (is (= {:identity 1.0 :* 0.0 :gzip 1.0 :brotli 1.0}
           (#'static/parse-accept-encoding "gzip, br")))))

(deftest ^:parallel parse-accept-encoding-with-quality-test
  (testing "encodings with explicit q-values"
    (is (= {:identity 1.0 :* 0.0 :brotli 1.0 :gzip 0.5}
           (#'static/parse-accept-encoding "br, gzip;q=0.5")))))

(deftest ^:parallel parse-accept-encoding-identity-override-test
  (testing "explicit identity q-value overrides the default"
    (is (= {:identity 0.5 :* 0.0 :gzip 1.0}
           (#'static/parse-accept-encoding "gzip, identity;q=0.5")))))

(deftest ^:parallel parse-accept-encoding-wildcard-test
  (testing "wildcard encoding is parsed"
    (is (= {:identity 1.0 :* 0.5 :brotli 1.0}
           (#'static/parse-accept-encoding "br, *;q=0.5")))))

(deftest ^:parallel parse-accept-encoding-zero-quality-test
  (testing "q=0 means encoding is explicitly refused"
    (is (= {:identity 1.0 :* 0.0 :gzip 0.0 :brotli 1.0}
           (#'static/parse-accept-encoding "gzip;q=0, br")))))

(deftest ^:parallel parse-accept-encoding-whitespace-test
  (testing "extra whitespace is tolerated"
    (is (= {:identity 1.0 :* 0.0 :gzip 1.0 :brotli 0.8}
           (#'static/parse-accept-encoding "  gzip ,  br ; q=0.8  ")))))

(deftest ^:parallel parse-accept-encoding-unknown-encoding-test
  (testing "unknown encodings are ignored"
    (is (= {:identity 1.0 :* 0.0 :gzip 1.0}
           (#'static/parse-accept-encoding "gzip, zstd")))))

(defn- request-with-encoding [header-value]
  {:headers {"accept-encoding" header-value}})

(deftest ^:parallel accepts-encoding-basic-test
  (testing "returns true when encoding is listed"
    (is (true? (#'static/accepts-encoding? (request-with-encoding "gzip, br") :brotli)))
    (is (true? (#'static/accepts-encoding? (request-with-encoding "gzip, br") :gzip)))))

(deftest ^:parallel accepts-encoding-refused-test
  (testing "returns false when encoding has q=0"
    (is (false? (#'static/accepts-encoding? (request-with-encoding "gzip;q=0, br") :gzip)))))

(deftest ^:parallel accepts-encoding-wildcard-fallback-test
  (testing "falls back to wildcard when specific encoding not listed"
    (is (true? (#'static/accepts-encoding? (request-with-encoding "*") :brotli)))
    (is (true? (#'static/accepts-encoding? (request-with-encoding "*;q=0.5") :brotli)))))

(deftest ^:parallel accepts-encoding-wildcard-zero-test
  (testing "wildcard q=0 means unlisted encodings are refused"
    (is (false? (#'static/accepts-encoding? (request-with-encoding "gzip, *;q=0") :brotli)))))

(deftest ^:parallel accepts-encoding-no-header-test
  (testing "missing header accepts identity only"
    (is (true?  (#'static/accepts-encoding? {} :identity)))
    (is (false? (#'static/accepts-encoding? {} :gzip)))
    (is (false? (#'static/accepts-encoding? {} :brotli)))))

(deftest ^:parallel static-resource-prefers-brotli-test
  (testing "serves brotli when client supports it and .br file exists"
    (let [response (static/static-resource
                    (request-with-encoding "gzip, br")
                    "static_test/app.js")]
      (is (some? response))
      (is (= "br" (get-in response [:headers "Content-Encoding"])))
      (is (= "text/javascript" (get-in response [:headers "Content-Type"]))))))

(deftest ^:parallel static-resource-falls-back-to-gzip-test
  (testing "serves gzip when client doesn't support brotli"
    (let [response (static/static-resource
                    (request-with-encoding "gzip")
                    "static_test/app.js")]
      (is (some? response))
      (is (= "gzip" (get-in response [:headers "Content-Encoding"]))))))

(deftest ^:parallel static-resource-falls-back-to-identity-test
  (testing "serves uncompressed when client refuses compressed encodings"
    (let [response (static/static-resource
                    (request-with-encoding "gzip;q=0, br;q=0")
                    "static_test/app.js")]
      (is (some? response))
      (is (= "identity" (get-in response [:headers "Content-Encoding"]))))))

(deftest ^:parallel static-resource-no-header-test
  (testing "serves uncompressed when no Accept-Encoding header"
    (let [response (static/static-resource {} "static_test/app.js")]
      (is (some? response))
      (is (= "identity" (get-in response [:headers "Content-Encoding"]))))))

(deftest ^:parallel static-resource-missing-file-test
  (testing "returns nil for a resource that doesn't exist"
    (is (nil? (static/static-resource
               (request-with-encoding "gzip, br")
               "static_test/nonexistent.js")))))

(deftest ^:parallel static-resource-sets-vary-header-test
  (testing "response includes Vary: Accept-Encoding"
    (let [response (static/static-resource
                    (request-with-encoding "gzip, br")
                    "static_test/app.js")]
      (is (= "Accept-Encoding" (get-in response [:headers "Vary"]))))))
