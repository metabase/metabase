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
