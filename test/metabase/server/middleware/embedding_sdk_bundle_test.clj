(ns metabase.server.middleware.embedding-sdk-bundle-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.server.lib.etag-cache :as lib.etag-cache]
   [metabase.server.middleware.embedding-sdk-bundle :as mw.embedding-sdk-bundle]
   [metabase.server.routes.static :as static]))

(set! *warn-on-reflection* true)

(def ^:private cache-header "public, max-age=60")
(def ^:private far-future-cache-header "public, max-age=31536000, immutable")
(def ^:private js-ct "text/javascript")

(defn- fake-static-resource
  "A fake for `static/static-resource` that returns a response with Content-Type
   and Vary headers, mimicking what the real implementation does."
  [_request _resource-path]
  {:status 200
   :headers {"Content-Type" js-ct
             "Vary"         "Accept-Encoding"}
   :body "dummy"})

(deftest serve-bundle-handler-prod-returns-304-and-adds-cache-header
  (testing "Prod + ETag match → 304 with Cache-Control, ETag, Vary; no Content-Type"
    (with-redefs [config/is-prod? true
                  static/static-resource fake-static-resource
                  lib.etag-cache/with-etag (fn [_base _req _opts]
                                             {:status 304
                                              :headers {"ETag" "\"abc\""}
                                              :body ""})]
      (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
            resp    (handler {:headers {"if-none-match" "\"abc\""}})]
        (is (= 304 (:status resp)))
        (is (= "" (:body resp)))
        (is (= cache-header (get-in resp [:headers "Cache-Control"])))
        (is (= "\"abc\"" (get-in resp [:headers "ETag"])))))))

(deftest serve-bundle-handler-prod-returns-200-and-adds-cache-and-content-type
  (testing "Prod + ETag miss → 200 with Cache-Control, ETag, Content-Type, Vary"
    (with-redefs [config/is-prod? true
                  static/static-resource fake-static-resource
                  lib.etag-cache/with-etag (fn [base _req _opts]
                                             (update base :headers assoc "ETag" "\"abc\""))]
      (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
            resp    (handler {:headers {}})]
        (is (= 200 (:status resp)))
        (is (= cache-header (get-in resp [:headers "Cache-Control"])))
        (is (= "\"abc\"" (get-in resp [:headers "ETag"])))
        (is (= js-ct (get-in resp [:headers "Content-Type"])))
        (is (= "Accept-Encoding" (get-in resp [:headers "Vary"])))
        (is (= "dummy" (:body resp)))))))

(deftest serve-bundle-handler-dev-skips-etag-and-sets-no-store
  (testing "Dev skips with-etag and sets no-store + Content-Type"
    (with-redefs [config/is-prod? false
                  static/static-resource fake-static-resource
                  lib.etag-cache/with-etag (fn [& _]
                                             (throw (ex-info "with-etag should not be called in dev" {})))]
      (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
            resp    (handler {:headers {}})]
        (is (= 200 (:status resp)))
        (is (= "no-store" (get-in resp [:headers "Cache-Control"])))
        (is (= js-ct (get-in resp [:headers "Content-Type"])))
        (is (= "Accept-Encoding" (get-in resp [:headers "Vary"])))
        (is (= "dummy" (:body resp)))))))

(deftest serve-bundle-handler-404-propagates
  (testing "Missing resource → 404 with no-store"
    (with-redefs [config/is-prod? true
                  static/static-resource (constantly nil)
                  lib.etag-cache/with-etag (fn [& args] (throw (ex-info "Not expected for 404" {:args args})))]
      (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
            resp    (handler {:headers {}})]
        (is (= 404 (:status resp)))
        (is (= "no-store" (get-in resp [:headers "Cache-Control"])))))))

;; -- Bundle routing: packageVersion triggers bootstrap, absence → legacy --

(deftest serve-bundle-handler-routes-by-query-param
  (testing "No query params (old package) → serves legacy resource"
    (let [requested-resource (atom nil)]
      (with-redefs [config/is-prod? false
                    static/static-resource (fn [_request resource]
                                             (reset! requested-resource resource)
                                             {:status 200 :headers {} :body "legacy-js"})]
        (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
              resp    (handler {:headers {}})]
          (is (= 200 (:status resp)))
          (is (str/includes? @requested-resource "legacy/"))))))

  (testing "packageVersion present → serves bootstrap resource"
    (let [requested-resource (atom nil)]
      (with-redefs [config/is-prod? false
                    static/static-resource (fn [_request resource]
                                             (reset! requested-resource resource)
                                             {:status 200 :headers {} :body "bootstrap-js"})]
        (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
              resp    (handler {:headers {}
                                :query-params {"packageVersion" "0.59.0"}})]
          (is (= 200 (:status resp)))
          (is (str/includes? @requested-resource "chunks/"))))))

  (testing "packageVersion + useLegacyMonolithicBundle=true → serves legacy resource"
    (let [requested-resource (atom nil)]
      (with-redefs [config/is-prod? false
                    static/static-resource (fn [_request resource]
                                             (reset! requested-resource resource)
                                             {:status 200 :headers {} :body "legacy-js"})]
        (let [handler (mw.embedding-sdk-bundle/serve-bundle-handler)
              resp    (handler {:headers {}
                                :query-params {"packageVersion" "0.59.0"
                                               "useLegacyMonolithicBundle" "true"}})]
          (is (= 200 (:status resp)))
          (is (str/includes? @requested-resource "legacy/")))))))

;; -- Chunk handler (dynamic filenames with content hashes) --

(deftest serve-chunk-handler-returns-far-future-cache
  (testing "Chunk handler always returns far-future cache + Content-Type + Vary"
    (with-redefs [static/static-resource (constantly {:status 200
                                                      :headers {"Content-Type" js-ct
                                                                "Vary"         "Accept-Encoding"}
                                                      :body "chunk-js"})]
      (let [handler (mw.embedding-sdk-bundle/serve-chunk-handler "embedding-sdk-chunk-runtime.a1b2c3d4.js")
            resp    (handler {:headers {}})]
        (is (= 200 (:status resp)))
        (is (= far-future-cache-header (get-in resp [:headers "Cache-Control"])))
        (is (= js-ct (get-in resp [:headers "Content-Type"])))
        (is (= "Accept-Encoding" (get-in resp [:headers "Vary"]))))))

  (testing "Missing chunk resource → 404"
    (with-redefs [static/static-resource (constantly nil)]
      (let [handler (mw.embedding-sdk-bundle/serve-chunk-handler "embedding-sdk-chunk-nonexistent.js")
            resp    (handler {:headers {}})]
        (is (= 404 (:status resp)))
        (is (= "no-store" (get-in resp [:headers "Cache-Control"])))))))

;; -- Path traversal protection --

(deftest serve-chunk-handler-traversal-returns-404
  (testing "traversal filenames return 404 even when the target file exists"
    ;; Place a real .js file on the classpath (inside resources/) and verify
    ;; that path traversal from the chunks directory cannot reach it.
    (let [tmp-file (java.io.File. "resources" "traversal-test-secret.js")]
      (try
        (spit tmp-file "should-not-be-served")
        ;; Sanity: the file IS reachable via resource-response directly
        (is (some? (ring.util.response/resource-response "traversal-test-secret.js"))
            "Sanity check: temp file is on the classpath")
        ;; None of these traversal filenames should be able to reach it
        (doseq [filename ["../../../../traversal-test-secret.js"
                          "../some/thing" "/etc/passwd" "." ".."]]
          (let [handler (mw.embedding-sdk-bundle/serve-chunk-handler filename)
                resp    (handler {:headers {}})]
            (is (= 404 (:status resp))
                (str "Expected 404 for filename: " (pr-str filename)))))
        (finally
          (.delete tmp-file))))))
