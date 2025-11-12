(ns metabase.server.middleware.misc-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.system.core :as system]
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
                 (system/site-url)))))))
  (testing "Site URL should not be inferred from healthcheck requests"
    (mt/with-temporary-setting-values [site-url nil]
      (doseq [uri ["/api/health" "/livez" "/readyz"]]
        (let [request (mock-request uri "https://mb1.example.com" nil nil)]
          (maybe-set-site-url request)
          (is (nil? (system/site-url)))))))
  (testing "Site URL should not be inferred if already set in DB"
    (mt/with-temporary-setting-values [site-url "https://mb1.example.com"]
      (let [request (mock-request "/" "https://mb2.example.com" nil nil)]
        (maybe-set-site-url request)
        (is (= "https://mb1.example.com" (system/site-url))))))
  (testing "Site URL should not be inferred if already set by env variable"
    (mt/with-temporary-setting-values [site-url nil]
      (mt/with-temp-env-var-value! [mb-site-url "https://mb1.example.com"]
        (let [request (mock-request "/" "https://mb2.example.com" nil nil)]
          (maybe-set-site-url request)
          (is (= "https://mb1.example.com" (system/site-url))))))))

(deftest add-version-header-test
  (testing "x-metabase-version is only added on API calls"
    (with-redefs [config/mb-version-info {:tag "v42"}]
      (let [dummy-response {:status 200 :headers {} :body "ok"}
            handler       (mw.misc/add-version (fn [_ respond _] (respond dummy-response)))]
        (testing "API call"
          (let [captured (atom nil)]
            (handler (ring.mock/request :get "/api/foo")
                     (fn [resp] (reset! captured resp))
                     (fn [_] (is false "should not go to raise")))
            (is (= "v42"
                   (get-in @captured [:headers "x-metabase-version"]))
                "header should be set for API calls")))
        (testing "non-API call"
          (let [captured (atom nil)]
            (handler (ring.mock/request :get "/not-api")
                     (fn [resp] (reset! captured resp))
                     (fn [_] (is false "should not go to raise")))
            (is (nil?
                 (get-in @captured [:headers "x-metabase-version"]))
                "header should not be set for non-API calls")))))))
