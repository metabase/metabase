(ns metabase.server.lib.etag-cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.server.lib.etag-cache :as lib.etag-cache]))

(set! *warn-on-reflection* true)

(defn- base-response
  ([] (base-response {}))
  ([headers]
   {:status 200
    :headers headers
    :body "dummy js"}))

(deftest with-etag-returns-304-when-etag-matches
  (testing "Exact strong ETag match returns 304 with only ETag header added"
    (let [etag (format "\"%s\"" config/mb-version-hash)
          resp (lib.etag-cache/with-etag (base-response) {:headers {"if-none-match" etag}} {})]
      (is (=? {:status  304
               :body    ""
               :headers {"ETag" etag}}
              resp))
      (is (nil? (get-in resp [:headers "Cache-Control"])))
      (is (nil? (get-in resp [:headers "Content-Type"])))))

  (testing "Weak ETag (W/) in request is treated as match"
    (let [etag-weak (format "W/\"%s\"" config/mb-version-hash)
          resp      (lib.etag-cache/with-etag (base-response) {:headers {"if-none-match" etag-weak}} {})]
      (is (=? {:status  304
               :body    ""
               :headers {"ETag" (format "\"%s\"" config/mb-version-hash)}}
              resp))))

  (testing "Multiple ETags in If-None-Match; any match triggers 304"
    (let [header (format "\"other\", W/\"%s\", \"another\"" config/mb-version-hash)
          resp   (lib.etag-cache/with-etag (base-response) {:headers {"if-none-match" header}} {})]
      (is (=? {:status  304
               :headers {"ETag" (format "\"%s\"" config/mb-version-hash)}}
              resp)))))

(deftest with-etag-returns-200-and-adds-etag-when-no-match
  (testing "ETag does not match -> 200; adds ETag, preserves existing headers; no Cache-Control/Content-Type"
    (let [resp (lib.etag-cache/with-etag
                 (base-response {"X-Foo" "bar"})
                 {:headers {"if-none-match" "\"different\""}}
                 {})]
      (is (=? {:status  200
               :body    "dummy js"
               :headers {"ETag"  (format "\"%s\"" config/mb-version-hash)
                         "X-Foo" "bar"}}
              resp))
      (is (nil? (get-in resp [:headers "Cache-Control"])))
      (is (nil? (get-in resp [:headers "Content-Type"])))))

  (testing "Missing If-None-Match -> 200; adds ETag only"
    (let [resp (lib.etag-cache/with-etag (base-response) {:headers {}} {})]
      (is (=? {:status  200
               :body    "dummy js"
               :headers {"ETag" (format "\"%s\"" config/mb-version-hash)}}
              resp))
      (is (nil? (get-in resp [:headers "Cache-Control"])))
      (is (nil? (get-in resp [:headers "Content-Type"]))))))

(deftest with-etag-returns-304-on-wildcard
  (testing "If-None-Match: * (or with whitespace) returns 304 and only adds ETag"
    (doseq [if-none-match-value ["*" "   *   " "*  " "  *"]]
      (let [resp (lib.etag-cache/with-etag
                   {:status 200 :headers {} :body "dummy js"}
                   {:headers {"if-none-match" if-none-match-value}}
                   {})]
        (is (=? {:status  304
                 :body    ""
                 :headers {"ETag" (format "\"%s\"" config/mb-version-hash)}}
                resp))
        (is (nil? (get-in resp [:headers "Cache-Control"])))
        (is (nil? (get-in resp [:headers "Content-Type"])))))))

(deftest with-etag-weak-returns-304-when-etag-matches
  (testing "Strong ETag match returns 304 with weak ETag in response"
    (let [etag (format "\"%s\"" config/mb-version-hash)
          weak-etag (format "W/\"%s\"" config/mb-version-hash)
          resp (lib.etag-cache/with-etag (base-response) {:headers {"if-none-match" etag}} {:weak? true})]
      (is (=? {:status  304
               :body    ""
               :headers {"ETag" weak-etag}}
              resp))))

  (testing "Weak ETag in request matches and response contains weak ETag"
    (let [etag-weak (format "W/\"%s\"" config/mb-version-hash)
          resp      (lib.etag-cache/with-etag (base-response) {:headers {"if-none-match" etag-weak}} {:weak? true})]
      (is (=? {:status  304
               :body    ""
               :headers {"ETag" etag-weak}}
              resp))))

  (testing "Multiple ETags in If-None-Match; match triggers 304 with weak ETag in response"
    (let [header (format "\"other\", \"%s\", \"another\"" config/mb-version-hash)
          resp   (lib.etag-cache/with-etag (base-response) {:headers {"if-none-match" header}} {:weak? true})]
      (is (=? {:status  304
               :headers {"ETag" (format "W/\"%s\"" config/mb-version-hash)}}
              resp)))))

(deftest with-etag-weak-returns-200-and-adds-weak-etag-when-no-match
  (testing "ETag does not match -> 200; adds weak ETag, preserves existing headers"
    (let [resp (lib.etag-cache/with-etag
                 (base-response {"X-Foo" "bar"})
                 {:headers {"if-none-match" "\"different\""}}
                 {:weak? true})]
      (is (=? {:status  200
               :body    "dummy js"
               :headers {"ETag"  (format "W/\"%s\"" config/mb-version-hash)
                         "X-Foo" "bar"}}
              resp))))

  (testing "Missing If-None-Match -> 200; adds weak ETag only"
    (let [resp (lib.etag-cache/with-etag (base-response) {:headers {}} {:weak? true})]
      (is (=? {:status  200
               :body    "dummy js"
               :headers {"ETag" (format "W/\"%s\"" config/mb-version-hash)}}
              resp)))))

(deftest with-etag-weak-returns-304-on-wildcard
  (testing "If-None-Match: * returns 304 with weak ETag in response"
    (doseq [if-none-match-value ["*" "   *   "]]
      (let [resp (lib.etag-cache/with-etag
                   {:status 200 :headers {} :body "dummy js"}
                   {:headers {"if-none-match" if-none-match-value}}
                   {:weak? true})]
        (is (=? {:status  304
                 :body    ""
                 :headers {"ETag" (format "W/\"%s\"" config/mb-version-hash)}}
                resp))))))

(deftest with-etag-304-carries-over-rfc-9110-headers
  (testing "304 echoes Vary, Cache-Control, Content-Location, and Expires from original response"
    (let [original-headers {"Vary"             "Accept-Encoding"
                            "Cache-Control"    "max-age=31536000"
                            "Content-Location" "/static/app/main.js"
                            "Expires"          "Thu, 16 Apr 2026 12:00:00 GMT"}
          etag             (format "\"%s\"" config/mb-version-hash)
          resp             (lib.etag-cache/with-etag
                             (base-response original-headers)
                             {:headers {"if-none-match" etag}}
                             {})]
      (is (=? {:status  304
               :body    ""
               :headers {"Vary"             "Accept-Encoding"
                         "Cache-Control"    "max-age=31536000"
                         "Content-Location" "/static/app/main.js"
                         "Expires"          "Thu, 16 Apr 2026 12:00:00 GMT"
                         "ETag"             etag}}
              resp))))

  (testing "304 does NOT carry over non-cacheable headers like Content-Type or X-Custom"
    (let [original-headers {"Content-Type" "application/javascript"
                            "X-Custom"     "secret"
                            "Vary"         "Accept-Encoding"}
          etag             (format "\"%s\"" config/mb-version-hash)
          resp             (lib.etag-cache/with-etag
                             (base-response original-headers)
                             {:headers {"if-none-match" etag}}
                             {})]
      (is (=? {:status  304
               :headers {"Vary" "Accept-Encoding"}}
              resp))
      (is (nil? (get-in resp [:headers "Content-Type"])))
      (is (nil? (get-in resp [:headers "X-Custom"])))))

  (testing "304 with weak ETag also carries over cacheable headers"
    (let [original-headers {"Vary" "Accept-Encoding" "Cache-Control" "no-cache"}
          etag             (format "\"%s\"" config/mb-version-hash)
          resp             (lib.etag-cache/with-etag
                             (base-response original-headers)
                             {:headers {"if-none-match" etag}}
                             {:weak? true})]
      (is (=? {:status  304
               :headers {"Vary"          "Accept-Encoding"
                         "Cache-Control" "no-cache"
                         "ETag"          (format "W/\"%s\"" config/mb-version-hash)}}
              resp))))

  (testing "304 carries over headers regardless of case in original response"
    (let [original-headers {"vary"          "Accept-Encoding"
                            "cache-control" "max-age=600"
                            "content-type"  "application/javascript"}
          etag             (format "\"%s\"" config/mb-version-hash)
          resp             (lib.etag-cache/with-etag
                             (base-response original-headers)
                             {:headers {"if-none-match" etag}}
                             {})]
      (is (=? {:status  304
               :headers {"Vary"          "Accept-Encoding"
                         "Cache-Control" "max-age=600"}}
              resp))
      (is (nil? (get-in resp [:headers "Content-Type"])))
      (is (nil? (get-in resp [:headers "content-type"]))))))
