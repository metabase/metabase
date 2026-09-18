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
                               "/auth/login?redirect=%2Fapps%2Fsales%2Fsub%2Froute%3Ftab%3D1")))
         (testing "with site-url not yet set, the redirect is relative rather than prefixed with nil"
           (mt/with-temporary-setting-values [site-url nil]
             (is (= "/auth/login?redirect=%2Fapps%2Fsales"
                    (get-in (serve-data-app {:uri "/embed/apps/sales"}) [:headers "Location"]))))))))
    (testing "without the feature it still falls through, so the instance reveals nothing about data apps"
      (mt/with-premium-features #{}
        (is (nil? (serve-data-app {:uri "/embed/apps/sales"})))))))

(def ^:private static-asset-path
  "A checked-in asset under `/app` that carries no content hash, so it is served
  `no-cache, must-revalidate` and has to be revalidated on every load."
  "app/assets/img/browserconfig.xml")

(defn- body-text
  "The response body as text. A static resource is served as a `File` from a source
  checkout and as an `InputStream` from a jar, and is absent altogether on a 304."
  [body]
  (cond
    (nil? body)    ""
    (string? body) body
    :else          (slurp body)))

(defn- get-static-asset
  "Fetches a file under `/app` through the real server, so the security middleware,
  gzip and the validator handling all take part."
  ([] (get-static-asset 200 nil))
  ([expected-status validators]
   (binding [client/*url-prefix* ""]
     (client/client-full-response
      :get expected-status static-asset-path
      {:request-options {:headers (or validators {})}}))))

(deftest static-asset-revalidation-test
  (testing "an unhashed static asset is revalidated rather than cached outright"
    (let [response (get-static-asset)]
      (is (= "max-age=0, no-cache, must-revalidate, proxy-revalidate"
             (get-in response [:headers "Cache-Control"])))
      (testing "and is validated by a strong hash of its bytes"
        (let [etag (get-in response [:headers "ETag"])]
          (is (re-matches #"\"[0-9a-f]{64}\"" etag))
          (testing "so a client that already holds it gets a body-less 304"
            (let [not-modified (get-static-asset 304 {"if-none-match" etag})]
              (is (= 304 (:status not-modified)))
              (is (str/blank? (body-text (:body not-modified))))
              (testing "carrying the validator and the directives a cache needs"
                (is (= etag (get-in not-modified [:headers "ETag"])))
                (is (= "max-age=0, no-cache, must-revalidate, proxy-revalidate"
                       (get-in not-modified [:headers "Cache-Control"]))))))
          (testing "while a client holding different bytes is sent the file"
            (let [stale (get-static-asset 200 {"if-none-match" "\"not-the-one\""})]
              (is (= 200 (:status stale)))
              (is (not (str/blank? (body-text (:body stale))))))))))))

(deftest static-asset-is-never-validated-by-date-test
  (testing "a date validator alone never produces a 304, so a downgrade replaces the client's copy"
    (let [served (get-in (get-static-asset) [:headers "Last-Modified"])]
      (is (some? served) "the header stays on the response")
      (doseq [held [served "Fri, 01 Jan 2100 00:00:00 GMT"]]
        (testing (str "if-modified-since " held)
          (let [response (get-static-asset 200 {"if-modified-since" held})]
            (is (= 200 (:status response)))
            (is (not (str/blank? (body-text (:body response)))))))))))
