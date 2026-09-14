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

(defn- serve-data-app [request]
  (let [p (promise)]
    (index/data-app request #(deliver p %) #(deliver p %))
    @p))

(deftest data-app-entrypoint-is-gated-by-the-data-apps-feature-test
  (testing "the /embed/apps/:name entrypoint is served only with :data-apps-preview; without it it
            responds nil so routing falls through to the generic embed handler — exactly as if data
            apps did not exist"
    ;; Stub the raw shell so the test needs no built frontend HTML; the feature gate lives in
    ;; `index/data-app` itself, which is what we're exercising here.
    (with-redefs [index/data-app-shell (fn [_req respond _raise] (respond {:status 200 :body "DATA-APP"}))]
      (let [request {:uri "/embed/apps/sales" :metabase-user-id (mt/user->id :rasta)}]
        ;; `enable-data-apps?` also requires the EE code to be present (`config/ee-available?`), so the
        ;; served path exists only on EE; on OSS the entrypoint always falls through.
        (mt/when-ee-evailable
         (mt/with-premium-features #{:data-apps-preview}
           (is (= "DATA-APP" (:body (serve-data-app request))) "with the feature, serves the data-app shell")))
        (mt/with-premium-features #{}
          (is (nil? (serve-data-app request)) "without the feature, responds nil so routing falls through"))))))

(deftest data-app-entrypoint-requires-a-signed-in-user-test
  (testing "a signed-out visitor is redirected to the login page instead of getting the iframe document,
            whose CSP carries the app's allowed_hosts; the redirect returns them to the top-level page"
    (mt/when-ee-evailable
     (mt/with-premium-features #{:data-apps-preview}
       (with-redefs [index/data-app-shell (fn [_req respond _raise] (respond {:status 200 :body "DATA-APP"}))]
         (let [response (serve-data-app {:uri "/embed/apps/sales/sub/route" :query-string "tab=1"})]
           (is (= 302 (:status response)))
           (is (str/ends-with? (get-in response [:headers "Location"])
                               "/auth/login?redirect=%2Fapps%2Fsales%2Fsub%2Froute%3Ftab%3D1"))))))
    (testing "without the feature it still falls through, so the instance reveals nothing about data apps"
      (mt/with-premium-features #{}
        (is (nil? (serve-data-app {:uri "/embed/apps/sales"})))))))
