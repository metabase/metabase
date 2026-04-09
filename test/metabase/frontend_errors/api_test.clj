(ns metabase.frontend-errors.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.frontend-errors.api :as frontend-errors.api]
   [metabase.request.settings :as request.settings]
   [metabase.server.middleware.browser-cookie :as mw.browser-cookie]
   [metabase.test :as mt]
   [throttle.core :as throttle]))

(deftest post-frontend-errors-test
  (testing "POST /api/frontend-errors increments the counter for component-crash and returns 204"
    (mt/with-prometheus-system! [_ system]
      (let [initial (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
        (is (nil? (mt/user-http-request :rasta :post 204 "frontend-errors" {:type "component-crash"})))
        (is (< initial (mt/metric-value system :metabase-frontend/errors {:type "component-crash"}))))))

  (testing "POST /api/frontend-errors with type=chart-render-error tracks separately"
    (mt/with-prometheus-system! [_ system]
      (let [initial (mt/metric-value system :metabase-frontend/errors {:type "chart-render-error"})]
        (mt/user-http-request :rasta :post 204 "frontend-errors" {:type "chart-render-error"})
        (is (< initial (mt/metric-value system :metabase-frontend/errors {:type "chart-render-error"}))))))

  (testing "POST /api/frontend-errors rejects unknown type values"
    (is (= {:errors {:type "enum of component-crash, chart-render-error"}}
           (select-keys (mt/user-http-request :rasta :post 400 "frontend-errors" {:type "bogus"})
                        [:errors]))))

  (testing "POST /api/frontend-errors is throttled for the same IP once the threshold is exceeded"
    (mt/with-prometheus-system! [_ system]
      (with-redefs [frontend-errors.api/frontend-errors-throttler
                    (throttle/make-throttler :frontend-errors :attempts-threshold 1)
                    request.settings/source-address-header
                    (constantly "x-forwarded-for")]
        (let [browser-id-cookie-name @#'mw.browser-cookie/browser-id-cookie-name
              request-options {:request-options {:headers {"x-forwarded-for" "10.1.2.3"
                                                           "cookie"          (str browser-id-cookie-name "=device-a")}}}
              initial-count   (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
          (is (nil? (mt/user-http-request :rasta :post 204 "frontend-errors" request-options
                                          {:type "component-crash"})))
          (let [count-after-first-request (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})
                resp                      (mt/user-http-request-full-response :crowberto :post 429 "frontend-errors"
                                                                              request-options
                                                                              {:type "component-crash"})
                count-after-throttling    (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
            (is (< initial-count count-after-first-request))
            (is (= count-after-first-request count-after-throttling))
            (is (str/starts-with? (get-in resp [:body :error]) "Too many attempts!"))
            (is (string? (get-in resp [:headers "Retry-After"])))))))

    (testing "POST /api/frontend-errors throttles requests from the same IP even if the browser ID changes"
      (mt/with-prometheus-system! [_ system]
        (with-redefs [frontend-errors.api/frontend-errors-throttler
                      (throttle/make-throttler :frontend-errors :attempts-threshold 1)
                      request.settings/source-address-header
                      (constantly "x-forwarded-for")]
          (let [browser-id-cookie-name @#'mw.browser-cookie/browser-id-cookie-name
                device-a-opts          {:request-options {:headers {"x-forwarded-for" "10.1.2.3"
                                                                    "cookie"          (str browser-id-cookie-name "=device-a")}}}
                device-b-opts          {:request-options {:headers {"x-forwarded-for" "10.1.2.3"
                                                                    "cookie"          (str browser-id-cookie-name "=device-b")}}}
                initial-count          (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
            (is (nil? (mt/user-http-request :rasta :post 204 "frontend-errors" device-a-opts
                                            {:type "component-crash"})))
            (let [resp                   (mt/user-http-request-full-response :crowberto :post 429 "frontend-errors"
                                                                             device-b-opts
                                                                             {:type "component-crash"})
                  count-after-throttling   (mt/metric-value system :metabase-frontend/errors {:type "component-crash"})]
              (is (= (inc initial-count) count-after-throttling))
              (is (str/starts-with? (get-in resp [:body :error]) "Too many attempts!")))))))

    (testing "POST /api/frontend-errors throttles repeated invalid payloads before validation"
      (with-redefs [frontend-errors.api/frontend-errors-throttler
                    (throttle/make-throttler :frontend-errors :attempts-threshold 1)
                    request.settings/source-address-header
                    (constantly "x-forwarded-for")]
        (let [browser-id-cookie-name @#'mw.browser-cookie/browser-id-cookie-name
              request-options {:request-options {:headers {"x-forwarded-for" "10.1.2.3"
                                                           "cookie"          (str browser-id-cookie-name "=device-a")}}}]
          (is (= {:errors {:type "enum of component-crash, chart-render-error"}}
                 (select-keys (mt/user-http-request :rasta :post 400 "frontend-errors" request-options
                                                    {:type "bogus"})
                              [:errors])))
          (let [resp (mt/user-http-request-full-response :crowberto :post 429 "frontend-errors"
                                                         request-options
                                                         {:type "still-bogus"})]
            (is (str/starts-with? (get-in resp [:body :error]) "Too many attempts!"))
            (is (string? (get-in resp [:headers "Retry-After"])))))))))
