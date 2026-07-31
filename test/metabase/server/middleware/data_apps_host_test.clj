(ns metabase.server.middleware.data-apps-host-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.server.middleware.data-apps-host :as mw.data-apps-host]
   [metabase.server.settings :as server.settings]
   [metabase.test :as mt]))

(def ^:private apps-origin "https://apps.example.com")

(defn- run
  "Run the middleware over `request`; returns the response it produced, or
  `:passed-through` if it delegated to the inner handler."
  [request]
  (let [inner   (fn [_req respond _raise] (respond :passed-through))
        handler (mw.data-apps-host/data-apps-host-middleware inner)
        result  (atom nil)]
    (handler request #(reset! result %) #(reset! result %))
    @result))

(defn- req [host uri]
  {:uri uri, :request-method :get, :headers {"host" host}})

(deftest unset-is-a-no-op-test
  (with-redefs [server.settings/data-apps-host (constantly nil)]
    (is (= :passed-through (run (req "mb.example.com" "/embed/apps/sales"))))
    (is (= :passed-through (run (req "mb.example.com" "/api/dataset"))))))

(deftest a-forged-forwarded-host-cannot-leave-the-apps-host-test
  (testing "a forged X-Forwarded-Host must not move a request off the apps host, where
            login/SSO could set a session cookie"
    (with-redefs [server.settings/data-apps-host (constantly apps-origin)]
      (let [forged (assoc-in (req "apps.example.com" "/auth/sso")
                             [:headers "x-forwarded-host"] "mb.example.com")]
        (is (= 404 (:status (run forged)))))
      (testing "and a proxy that forwards the apps host is still honored"
        (is (= 404 (:status (run (assoc-in (req "metabase-internal:3000" "/auth/sso")
                                           [:headers "x-forwarded-host"] "apps.example.com")))))))))

(deftest main-host-redirects-the-doc-test
  (with-redefs [server.settings/data-apps-host (constantly apps-origin)]
    (testing "the data-app document is 307-redirected to the apps host"
      (let [resp (run (req "mb.example.com" "/embed/apps/sales"))]
        (is (= 307 (:status resp)))
        (is (= (str apps-origin "/embed/apps/sales")
               (get-in resp [:headers "Location"])))))
    (testing "the query string is preserved on the redirect"
      (is (= (str apps-origin "/embed/apps/sales?tab=1")
             (get-in (run (assoc (req "mb.example.com" "/embed/apps/sales")
                                 :query-string "tab=1"))
                     [:headers "Location"]))))
    (testing "non-data-app requests on the main host pass through untouched"
      (is (= :passed-through (run (req "mb.example.com" "/api/dataset")))))))

(deftest apps-host-restricts-surface-test
  (with-redefs [server.settings/data-apps-host (constantly apps-origin)]
    (testing "allowed on the apps host: the public shell + static assets"
      (is (= :passed-through (run (req "apps.example.com" "/embed/apps/sales"))))
      (is (= :passed-through (run (req "apps.example.com" "/app/dist/app-data-app.js"))))
      (is (= :passed-through (run (req "apps.example.com" "/favicon.ico")))))
    (testing "refused on the apps host: anything that could set a cookie or reach the authed API"
      (doseq [uri ["/api/session" "/auth/sso" "/api/dataset" "/api/user/current"
                   "/" "/api/apps/sales/bundle"]]
        (is (= 404 (:status (run (req "apps.example.com" uri))))
            (str uri " must be refused on the apps host"))))
    (testing "the apps host is matched by the x-forwarded-host header too"
      (is (= :passed-through
             (run {:uri "/embed/apps/sales", :request-method :get
                   :headers {"host" "internal:3000"
                             "x-forwarded-host" "apps.example.com"}}))))))

(deftest apps-host-fails-closed-on-leaked-session-cookie-test
  (with-redefs [server.settings/data-apps-host (constantly apps-origin)]
    (let [with-cookie (fn [request cookie] (assoc-in request [:headers "cookie"] cookie))]
      (testing "the app document is refused (403) when a session cookie reaches the apps host"
        (is (= 403 (:status (run (with-cookie (req "apps.example.com" "/embed/apps/sales")
                                   "metabase.SESSION=abc123"))))))
      (testing "the embedded session cookie is caught too, among others"
        (is (= 403 (:status (run (with-cookie (req "apps.example.com" "/embed/apps/sales")
                                   "foo=1; metabase.EMBEDDED_SESSION=xyz"))))))
      (testing "an unrelated cookie (e.g. the timeout marker) does not trip the guard"
        (is (= :passed-through (run (with-cookie (req "apps.example.com" "/embed/apps/sales")
                                      "metabase.TIMEOUT=alive")))))
      (testing "only the app document is gated — static assets still serve"
        (is (= :passed-through (run (with-cookie (req "apps.example.com" "/app/dist/x.js")
                                      "metabase.SESSION=abc123"))))))))

(deftest apps-host-warns-once-when-site-url-missing-test
  (with-redefs [server.settings/data-apps-host (constantly apps-origin)]
    (reset! @#'mw.data-apps-host/warned-missing-site-url? false)
    (mt/with-temporary-setting-values [site-url nil]
      (testing "logs once when MB_DATA_APPS_HOST is set without a site URL"
        (mt/with-log-messages-for-level [messages [metabase.server.middleware.data-apps-host :error]]
          (run (req "mb.example.com" "/api/dataset"))
          (is (some #(str/includes? (:message %) "MB_DATA_APPS_HOST is set but MB_SITE_URL")
                    (messages)))))
      (testing "and does not repeat the warning on later requests"
        (mt/with-log-messages-for-level [messages [metabase.server.middleware.data-apps-host :error]]
          (run (req "mb.example.com" "/api/dataset"))
          (is (empty? (messages))))))
    (testing "no warning when a site URL is configured"
      (reset! @#'mw.data-apps-host/warned-missing-site-url? false)
      (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
        (mt/with-log-messages-for-level [messages [metabase.server.middleware.data-apps-host :error]]
          (run (req "mb.example.com" "/api/dataset"))
          (is (empty? (messages))))))))
