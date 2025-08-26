(ns metabase.server.middleware.etag-cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.server.middleware.etag-cache :as mw.etag-cache]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(deftest js-etag-handler-test
  (testing "returns 304 when ETag matches and not in dev mode"
    (with-redefs [config/is-dev? false
                  response/resource-response
                  (constantly {:status 200 :headers {} :body "dummy js"})]
      (let [etag     (format "\"%s\"" config/mb-version-hash)
            handler  (mw.etag-cache/js-etag-handler "frontend_client/app/embedding-sdk.js")
            response (handler {:headers {"if-none-match" etag}})]
        (is (= 304 (:status response)))
        (is (= "" (:body response)))
        (is (= mw.etag-cache/etag-header (:headers response))))))

  (testing "returns 200 with correct headers when ETag does not match"
    (with-redefs [config/is-dev? false
                  response/resource-response
                  (constantly {:status 200 :headers {} :body "dummy js"})]
      (let [etag     (format "\"different\"")
            handler  (mw.etag-cache/js-etag-handler "frontend_client/app/embedding-sdk.js")
            response (handler {:headers {"if-none-match" etag}})
            headers  (:headers response)]
        (is (= 200 (:status response)))
        (is (= "application/javascript; charset=UTF-8"
               (get headers "Content-Type")))
        (is (= mw.etag-cache/etag-header
               (select-keys headers (keys mw.etag-cache/etag-header))))))))

(testing "returns 200 when in dev mode, ignoring ETag match"
  (with-redefs [config/is-dev? true
                response/resource-response
                (constantly {:status 200 :headers {} :body "dummy js"})]
    (let [etag     (format "\"%s\"" config/mb-version-hash)
          handler  (mw.etag-cache/js-etag-handler "frontend_client/app/embedding-sdk.js")
          response (handler {:headers {"if-none-match" etag}})]
      (is (= 200 (:status response)))
      (is (= mw.etag-cache/etag-header
             (select-keys (:headers response) (keys mw.etag-cache/etag-header)))))))
