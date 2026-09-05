(ns metabase.server.routes-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test.http-client :as client]))

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

(defn- get-static-asset
  "Fetches a file under `/app` through the real server, so the security middleware,
  gzip and the not-modified handling all take part."
  ([path] (get-static-asset path 200 nil))
  ([path expected-status if-modified-since]
   (binding [client/*url-prefix* ""]
     (client/client-full-response
      :get expected-status path
      {:request-options
       {:headers (cond-> {}
                   if-modified-since (assoc "if-modified-since" if-modified-since))}}))))

(deftest static-asset-revalidation-test
  (testing "an unhashed static asset is revalidated rather than cached outright"
    (let [response (get-static-asset "app/index.html")]
      (is (= "max-age=0, no-cache, must-revalidate, proxy-revalidate"
             (get-in response [:headers "Cache-Control"])))

      (testing "and reports the time it was modified, not the time it was served"
        (let [modified (get-in response [:headers "Last-Modified"])]
          (is (some? modified))

          (testing "so a client that already holds it gets a body-less 304"
            (let [not-modified (get-static-asset "app/index.html" 304 modified)]
              (is (= 304 (:status not-modified)))
              (is (str/blank? (:body not-modified)))))

          (testing "while a client holding an older copy is sent the file"
            (let [stale (get-static-asset "app/index.html" 200 "Tue, 03 Jul 2001 06:00:00 GMT")]
              (is (= 200 (:status stale)))
              (is (not (str/blank? (:body stale)))))))))))
