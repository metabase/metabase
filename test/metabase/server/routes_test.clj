(ns metabase.server.routes-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.server.routes :as routes]
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
  (testing "the /embed/apps/:name shell is served only with :data-apps-preview; without it the
            request falls through to the generic embed handler — exactly as if data apps did not exist"
    ;; stub the entrypoints so the test doesn't depend on the built frontend HTML templates
    (with-redefs [index/data-app (fn [_req respond _raise] (respond {:status 200 :body "DATA-APP"}))
                  index/embed    (fn [_req respond _raise] (respond {:status 200 :body "EMBED"}))]
      (let [serve (fn [uri]
                    (let [p (promise)]
                      (#'routes/embed-routes {:request-method :get :uri uri}
                                             (fn [response] (deliver p response))
                                             (fn [e] (deliver p e)))
                      @p))]
        (mt/with-premium-features #{:data-apps-preview}
          (is (= "DATA-APP" (:body (serve "/apps/orders"))))
          (is (= "DATA-APP" (:body (serve "/apps/orders/some/inner/route")))))
        (mt/with-premium-features #{}
          (is (= "EMBED" (:body (serve "/apps/orders")))
              "falls through to the generic embed shell")
          (is (= "EMBED" (:body (serve "/apps/orders/some/inner/route")))))))))
