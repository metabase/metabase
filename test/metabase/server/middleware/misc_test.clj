(ns metabase.server.middleware.misc-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.public-settings :as public-settings]
            [metabase.server.middleware.misc :as mw.misc]
            [metabase.test :as mt]
            [ring.mock.request :as ring.mock]))

(defn- maybe-set-site-url
  [request]
  ((mw.misc/maybe-set-site-url (fn [request respond _] (respond request)))
   request
   identity
   (fn [e] (throw e))))

(defn- mock-request
  [uri origin-header x-forwarded-host-header host-header]
  (cond-> (m/dissoc-in (ring.mock/request :get uri) [:headers "host"])
    origin-header           (ring.mock/header "Origin" origin-header)
    x-forwarded-host-header (ring.mock/header "X-Forwarded-Host" x-forwarded-host-header)
    host-header             (ring.mock/header "Host" host-header)))

(deftest maybe-set-site-url-test
  (testing "Make sure `maybe-set-site-url` middleware looks at the correct headers in the correct order (#12528)"
    (doseq [origin-header           ["https://mb1.example.com" nil]
            x-forwarded-host-header ["https://mb2.example.com" nil]
            host-header             ["https://mb3.example.com" nil]
            :let                    [request (mock-request "/" origin-header x-forwarded-host-header host-header)]]
      (testing (format "headers = %s" (pr-str (:headers request)))
        (mt/with-temporary-setting-values [site-url nil]
          (maybe-set-site-url request)
          (is (= (or origin-header x-forwarded-host-header host-header)
                 (public-settings/site-url)))))))
  (testing "Site URL should not be inferred from healthcheck requests"
    (mt/with-temporary-setting-values [site-url nil]
      (let [request (mock-request "/api/health" "https://mb1.example.com" nil nil)]
        (maybe-set-site-url request)
        (is (nil? (public-settings/site-url))))))
  (testing "Site URL should not be inferred if already set in DB"
    (mt/with-temporary-setting-values [site-url "https://mb1.example.com"]
        (let [request (mock-request "/" "https://mb2.example.com" nil nil)]
          (maybe-set-site-url request)
          (is (= "https://mb1.example.com" (public-settings/site-url))))))
  (testing "Site URL should not be inferred if already set by env variable"
    (mt/with-temporary-setting-values [site-url nil]
      (mt/with-temp-env-var-value [mb-site-url "https://mb1.example.com"]
        (let [request (mock-request "/" "https://mb2.example.com" nil nil)]
          (maybe-set-site-url request)
          (is (= "https://mb1.example.com" (public-settings/site-url))))))))
