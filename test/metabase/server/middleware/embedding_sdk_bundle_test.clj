(ns metabase.server.middleware.embedding-sdk-bundle-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.server.lib.etag-cache :as lib.etag-cache]
   [metabase.server.middleware.embedding-sdk-bundle :as mw.embedding-sdk-bundle]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private cache-header "public, max-age=60")
(def ^:private js-ct "application/javascript; charset=UTF-8")

(deftest serve-bundle-handler-prod-returns-304-and-adds-cache-header
  (testing "Prod + ETag match → 304 with Cache-Control, ETag, Vary, TAO; no Content-Type"
    (with-redefs [config/is-prod? true
                  response/resource-response (constantly {:status 200 :headers {} :body "dummy"})
                         ;; with-etag returns a 304 response with an ETag
                  lib.etag-cache/with-etag (fn [_base _req]
                                             {:status 304
                                              :headers {"ETag" "\"abc\""}
                                              :body ""})]
      (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
            resp    (handler {:headers {"if-none-match" "\"abc\""}})]
        (is (= 304 (:status resp)))
        (is (= "" (:body resp)))
        (is (= cache-header (get-in resp [:headers "Cache-Control"])))
        (is (= "\"abc\"" (get-in resp [:headers "ETag"])))
        (is (= "Accept-Encoding" (get-in resp [:headers "Vary"])))
        (is (nil? (get-in resp [:headers "Content-Type"])) "304 should not include Content-Type")))))

(deftest serve-bundle-handler-prod-returns-200-and-adds-cache-and-content-type
  (testing "Prod + ETag miss → 200 with Cache-Control, ETag, Content-Type, Vary, TAO"
    (with-redefs [config/is-prod? true
                  response/resource-response (constantly {:status 200 :headers {} :body "dummy"})
                                ;; with-etag returns a 200 response with an ETag applied
                  lib.etag-cache/with-etag (fn [base _req]
                                             (update base :headers assoc "ETag" "\"abc\""))]
      (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
            resp    (handler {:headers {}})]
        (is (= 200 (:status resp)))
        (is (= cache-header (get-in resp [:headers "Cache-Control"])))
        (is (= "\"abc\"" (get-in resp [:headers "ETag"])))
        (is (= js-ct (get-in resp [:headers "Content-Type"])))
        (is (= "Accept-Encoding" (get-in resp [:headers "Vary"])))
        (is (= "dummy" (:body resp))))))

  (deftest serve-bundle-handler-dev-skips-etag-and-sets-no-store
    (testing "Dev skips with-etag and sets no-store + Content-Type, no prod-only headers"
      (with-redefs [config/is-prod? false
                    response/resource-response (constantly {:status 200 :headers {} :body "dummy"})
                                         ;; If it were called in dev, we’d see this exception
                    lib.etag-cache/with-etag (fn [& _]
                                               (throw (ex-info "with-etag should not be called in dev" {})))]
        (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
              resp    (handler {:headers {}})]
          (is (= 200 (:status resp)))
          (is (= "no-store" (get-in resp [:headers "Cache-Control"])))
          (is (= js-ct (get-in resp [:headers "Content-Type"])))
          (is (nil? (get-in resp [:headers "Vary"])))
          (is (= "dummy" (:body resp))))))

    (deftest serve-bundle-handler-404-propagates
      (testing "Missing resource → 404 with no-store; no prod-only headers"
        (with-redefs [config/is-prod? true
                      response/resource-response (constantly nil)
                      lib.etag-cache/with-etag (fn [& args] (throw (ex-info "Not expected for 404" {:args args})))]
          (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
                resp    (handler {:headers {}})]
            (is (= 404 (:status resp)))
            (is (= "no-store" (get-in resp [:headers "Cache-Control"])))
            (is (nil? (get-in resp [:headers "Vary"])))))))))
