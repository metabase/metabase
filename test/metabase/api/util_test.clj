(ns metabase.api.util-test
  "Tests for /api/util endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest ^:parallel timezones-test
  (testing "GET /api/util/timezones"
    (let [timezones (mt/user-http-request :rasta :get 200 "util/timezones")]
      (testing "returns the JVM's timezones, sorted"
        (is (contains? (set timezones) "UTC"))
        (is (= (sort timezones) timezones))))))

(deftest ^:parallel timezones-etag-test
  (testing "GET /api/util/timezones"
    (let [response (mt/user-http-request-full-response :rasta :get 200 "util/timezones")
          etag     (get-in response [:headers "ETag"])]
      (testing "carries an ETag for the list it just served"
        (is (some? etag)))
      (testing "and answers a client that already holds that list without the body"
        (let [not-modified (mt/user-http-request-full-response
                            :rasta :get 304 "util/timezones"
                            {:request-options {:headers {"if-none-match" etag}}})]
          (is (= etag (get-in not-modified [:headers "ETag"])))
          (is (str/blank? (str (:body not-modified))))))
      (testing "while a client holding a different list is sent the timezones"
        (let [stale (mt/user-http-request-full-response
                     :rasta :get 200 "util/timezones"
                     {:request-options {:headers {"if-none-match" "\"not-the-current-list\""}}})]
          (is (contains? (set (:body stale)) "UTC")))))))
