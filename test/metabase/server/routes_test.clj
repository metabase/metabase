(ns metabase.server.routes-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.http-client :as client]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest test-public-routes
  (binding [client/*url-prefix* ""]
    (is (str/ends-with? (-> (client/client-full-response :get 302 "public/question/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.csv" {})
                            :headers
                            (get "Location"))
                        "/api/public/card/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/query/csv?"))
    (is (str/ends-with? (-> (client/client-full-response :get 302 "public/question/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json" {})
                            :headers
                            (get "Location"))
                        "/api/public/card/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/query/json?"))
    (is (str/ends-with? (-> (client/client-full-response :get 302 "public/question/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.xlsx" {})
                            :headers
                            (get "Location"))
                        "/api/public/card/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/query/xlsx?"))))

(deftest test-embed-routes
  (binding [client/*url-prefix* ""]
    (is (str/ends-with? (-> (client/client-full-response :get 302 "embed/question/token-string.csv" {})
                            :headers
                            (get "Location"))
                        "/api/embed/card/token-string/query/csv?"))))

(deftest test-app-img-route
  (testing "GET /app/img/:key"
    (binding [client/*url-prefix* ""]
      (testing "should return 404 if the setting key does not correspond to a valid image setting"
        (let [response (client/client-full-response :get 404 "app/img/this-is-not-a-valid-image-setting-key" {})]
          (is (str/includes? (:body response) "Not found."))))
      (testing "should return 200 with image data if the setting is a valid image"
        (let [base64-data  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" ; 1x1 black PNG
              content-type "image/png"
              image-setting-value (str "data:" content-type ";base64," base64-data)
              expected-bytes (u/decode-base64 base64-data)]
          (mt/with-temporary-setting-values [no-data-illustration-custom image-setting-value]
            (let [response (client/client-full-response :get 200 "app/img/no-data-illustration-custom" {})]
              (is (= content-type
                     (get-in response [:headers "content-type"])))
              (is (= expected-bytes (:body response))
                  "Response body should match the expected image bytes"))))))))
