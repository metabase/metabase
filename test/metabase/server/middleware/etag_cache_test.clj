(ns metabase.server.middleware.etag-cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.server.middleware.etag-cache :as mw.etag-cache]
   [ring.util.response :as response]))

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
          resp (mw.etag-cache/with-etag (base-response) {:headers {"if-none-match" etag}})]
      (is (= 304 (:status resp)))
      (is (= "" (:body resp)))
      (is (= etag (get-in resp [:headers "ETag"])))
      (is (nil? (get-in resp [:headers "Cache-Control"])))
      (is (nil? (get-in resp [:headers "Content-Type"])))))

  (testing "Weak ETag (W/) is treated as match"
    (let [etag-weak (format "W/\"%s\"" config/mb-version-hash)
          resp      (mw.etag-cache/with-etag (base-response) {:headers {"if-none-match" etag-weak}})]
      (is (= 304 (:status resp)))
      (is (= "" (:body resp)))
      (is (= (format "\"%s\"" config/mb-version-hash)
             (get-in resp [:headers "ETag"])))))

  (testing "Multiple ETags in If-None-Match; any match triggers 304"
    (let [header (format "\"other\", W/\"%s\", \"another\"" config/mb-version-hash)
          resp   (mw.etag-cache/with-etag (base-response) {:headers {"if-none-match" header}})]
      (is (= 304 (:status resp)))
      (is (= (format "\"%s\"" config/mb-version-hash)
             (get-in resp [:headers "ETag"]))))))

(deftest with-etag-returns-200-and-adds-etag-when-no-match
  (testing "ETag does not match → 200; adds ETag, preserves existing headers; no Cache-Control/Content-Type"
    (let [resp (mw.etag-cache/with-etag
                 (base-response {"X-Foo" "bar"})
                 {:headers {"if-none-match" "\"different\""}})]
      (is (= 200 (:status resp)))
      (is (= "dummy js" (:body resp)))
      (is (= (format "\"%s\"" config/mb-version-hash)
             (get-in resp [:headers "ETag"])))
      (is (= "bar" (get-in resp [:headers "X-Foo"])))
      (is (nil? (get-in resp [:headers "Cache-Control"])))
      (is (nil? (get-in resp [:headers "Content-Type"])))))

  (testing "Missing If-None-Match → 200; adds ETag only"
    (let [resp (mw.etag-cache/with-etag (base-response) {:headers {}})]
      (is (= 200 (:status resp)))
      (is (= "dummy js" (:body resp)))
      (is (= (format "\"%s\"" config/mb-version-hash)
             (get-in resp [:headers "ETag"])))
      (is (nil? (get-in resp [:headers "Cache-Control"])))
      (is (nil? (get-in resp [:headers "Content-Type"]))))))

