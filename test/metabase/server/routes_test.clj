(ns metabase.server.routes-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.server.routes.index :as index]
   [metabase.test :as mt]
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

(deftest data-app-entrypoint-is-gated-by-the-data-apps-feature-test
  (testing "the /embed/apps/:name entrypoint is served only with :data-apps-preview; without it it
            responds nil so routing falls through to the generic embed handler — exactly as if data
            apps did not exist"
    ;; Stub the raw shell so the test needs no built frontend HTML; the feature gate lives in
    ;; `index/data-app` itself, which is what we're exercising here.
    (with-redefs [index/data-app-shell (fn [_req respond _raise] (respond {:status 200 :body "DATA-APP"}))]
      (let [serve (fn []
                    (let [p (promise)]
                      (index/data-app {} #(deliver p %) #(deliver p %))
                      @p))]
        ;; `enable-data-apps?` also requires the EE code to be present (`config/ee-available?`), so the
        ;; served path exists only on EE; on OSS the entrypoint always falls through.
        (mt/when-ee-evailable
         (mt/with-premium-features #{:data-apps-preview}
           (is (= "DATA-APP" (:body (serve))) "with the feature, serves the data-app shell")))
        (mt/with-premium-features #{}
          (is (nil? (serve)) "without the feature, responds nil so routing falls through"))))))

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
