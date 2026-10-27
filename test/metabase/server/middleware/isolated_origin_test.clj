(ns metabase.server.middleware.isolated-origin-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.initialization-status.core :as init-status]
   [metabase.server.middleware.isolated-origin :as mw.isolated-origin]
   [metabase.server.routes.index :as index]
   [metabase.server.settings :as server.settings]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.server.handler :as test.server.handler]
   [toucan2.core :as t2]))

(def ^:private isolated-origin "https://apps.example.com")

(defn- run
  "Run the middleware over `request`; returns the response it produced, or
  `:passed-through` if it delegated to the inner handler."
  [request]
  (let [inner   (fn [_req respond _raise] (respond :passed-through))
        handler (mw.isolated-origin/isolated-origin-middleware inner)
        result  (atom nil)]
    (handler request #(reset! result %) #(reset! result %))
    @result))

(defn- req [host uri]
  {:uri uri, :request-method :get, :headers {"host" host}})

(defn- run-through-handler
  "Like [[run]], but through the full Ring handler: every middleware and route."
  [request]
  (let [response (promise)]
    ((test.server.handler/test-handler) (merge {:scheme :https, :remote-addr "127.0.0.1"} request)
                                        #(deliver response %)
                                        #(deliver response %))
    (deref response 10000 ::timed-out)))

(deftest unset-is-a-no-op-test
  (mt/with-dynamic-fn-redefs [server.settings/isolated-origin (constantly nil)]
    (is (= :passed-through (run (req "mb.example.com" "/embed/apps/sales"))))
    (is (= :passed-through (run (req "mb.example.com" "/api/dataset"))))))

(deftest a-forged-forwarded-host-cannot-leave-the-isolated-origin-test
  (testing "a forged X-Forwarded-Host doesn't let an isolated-origin request reach login/SSO, which could set a
            session cookie there"
    (mt/with-dynamic-fn-redefs [server.settings/isolated-origin (constantly isolated-origin)]
      (let [forged (assoc-in (req "apps.example.com" "/auth/sso")
                             [:headers "x-forwarded-host"] "mb.example.com")]
        (is (= 404 (:status (run forged)))))
      (testing "and a proxy that forwards the isolated origin is still honored"
        (is (= 404 (:status (run (assoc-in (req "metabase-internal:3000" "/auth/sso")
                                           [:headers "x-forwarded-host"] "apps.example.com")))))))))

(deftest main-host-redirects-the-doc-test
  (mt/with-dynamic-fn-redefs [server.settings/isolated-origin (constantly isolated-origin)]
    (testing "the data-app document is 307-redirected to the isolated origin"
      (let [resp (run (req "mb.example.com" "/embed/apps/sales"))]
        (is (= 307 (:status resp)))
        (is (= (str isolated-origin "/embed/apps/sales")
               (get-in resp [:headers "Location"])))))
    (testing "the query string is preserved on the redirect"
      (is (= (str isolated-origin "/embed/apps/sales?tab=1")
             (get-in (run (assoc (req "mb.example.com" "/embed/apps/sales")
                                 :query-string "tab=1"))
                     [:headers "Location"]))))
    (testing "non-data-app requests on the main host pass through untouched"
      (is (= :passed-through (run (req "mb.example.com" "/api/dataset")))))))

(deftest main-host-redirect-uses-the-normalized-isolated-origin-test
  (testing "a trailing slash in MB_ISOLATED_ORIGIN doesn't reach the redirect, where the apps
            host would refuse the resulting `//embed/apps/...`"
    (mt/with-temp-env-var-value! [mb-isolated-origin "https://apps.example.com/"]
      (is (= "https://apps.example.com/embed/apps/sales"
             (get-in (run (req "mb.example.com" "/embed/apps/sales"))
                     [:headers "Location"]))))))

(deftest main-host-redirect-keeps-the-site-url-path-test
  (testing "on a subpath deployment the redirect keeps the site URL path, as the iframe src does"
    (mt/with-temporary-setting-values [site-url "https://mb.example.com/metabase"]
      (mt/with-temp-env-var-value! [mb-isolated-origin isolated-origin]
        (is (= (str isolated-origin "/metabase/embed/apps/sales")
               (get-in (run (req "mb.example.com" "/embed/apps/sales"))
                       [:headers "Location"])))))))

(deftest isolated-origin-restricts-surface-test
  (mt/with-dynamic-fn-redefs [server.settings/isolated-origin (constantly isolated-origin)]
    (testing "allowed on the isolated origin: the app document + static assets"
      (is (= :passed-through (run (req "apps.example.com" "/embed/apps/sales"))))
      (is (= :passed-through (run (req "apps.example.com" "/app/dist/app-data-app.js"))))
      (is (= :passed-through (run (req "apps.example.com" "/favicon.ico")))))
    (testing "refused on the isolated origin: anything that could set a cookie or reach the API, which the app
              reaches only through the top page"
      (doseq [uri ["/api/session" "/auth/sso" "/api/dataset" "/api/user/current"
                   "/" "/api/ee/apps/sales/bundle" "/api/analytics-proxy"]]
        (is (= 404 (:status (run (req "apps.example.com" uri))))
            (str uri " must be refused on the isolated origin"))))
    (testing "the isolated origin is matched by the x-forwarded-host header too"
      (is (= :passed-through
             (run {:uri "/embed/apps/sales", :request-method :get
                   :headers {"host" "internal:3000"
                             "x-forwarded-host" "apps.example.com"}}))))))

(deftest isolated-origin-is-matched-in-a-forwarded-host-list-test
  (testing "a proxy chain's comma-separated X-Forwarded-Host that names the isolated origin first is the isolated
            origin"
    (mt/with-temp-env-var-value! [mb-isolated-origin isolated-origin]
      (let [forwarded (fn [uri]
                        (assoc-in (req "metabase:3000" uri)
                                  [:headers "x-forwarded-host"] "apps.example.com, edge.internal"))]
        (is (= :passed-through (run (forwarded "/embed/apps/sales"))))
        (is (=? {:status 404} (run (forwarded "/api/session/properties"))))))))

(deftest main-app-works-when-the-isolated-origin-shares-its-host-name-test
  (testing "an isolated origin on another port of the main host is refused, and main-host requests pass through"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (mt/with-temp-env-var-value! [mb-isolated-origin "http://localhost:3001"]
        (is (= :passed-through (run (req "localhost:3000" "/api/session/properties")))))))
  (testing "an IPv6 isolated origin leaves requests to another IPv6 main host alone"
    (mt/with-temporary-setting-values [site-url "http://[2001:db8::1]:3000"]
      (mt/with-temp-env-var-value! [mb-isolated-origin "http://[2001:db8::2]:3001"]
        (is (= :passed-through (run (req "[2001:db8::1]:3000" "/api/session/properties"))))))))

(defmacro ^:private with-isolated-origin-data-app
  "Run `body` with the isolated origin configured and a data app named `sales`, whose document renders as `DATA-APP`."
  [& body]
  `(mt/when-ee-evailable
    (mt/with-premium-features #{:data-apps}
      (mt/with-temporary-setting-values [~'site-url "https://mb.example.com"]
        (mt/with-temp-env-var-value! [~'mb-isolated-origin isolated-origin]
          (mt/with-temp [:model/DataApp _# {:name         "sales"
                                            :display_name "Sales"
                                            :bundle_path  "dist/index.js"
                                            :enabled      true}]
            (with-redefs [index/data-app-shell (fn [_req# respond# _raise#] (respond# {:status 200 :body "DATA-APP"}))]
              ~@body)))))))

(deftest isolated-origin-fails-closed-on-leaked-session-test
  ;; Until initialization completes, no request resolves to a session, which would hide the refusal.
  (init-status/set-complete!)
  (with-isolated-origin-data-app
    (let [doc-with-cookie (fn [cookie]
                            (run-through-handler (assoc-in (req "apps.example.com" "/embed/apps/sales")
                                                           [:headers "cookie"] cookie)))
          session-key     (str (random-uuid))
          session-id      (session/generate-session-id)]
      (try
        (t2/insert! :model/Session {:id         session-id
                                    :key_hashed (session/hash-session-key session-key)
                                    :user_id    (mt/user->id :rasta)})
        (testing "the app document is refused when a live session reaches the isolated origin"
          (is (=? {:status 403} (doc-with-cookie (str "metabase.SESSION=" session-key)))))
        (testing "a session cookie that is no live session does not block the app: app code can plant one"
          (is (=? {:status 200, :body "DATA-APP"} (doc-with-cookie (str "metabase.SESSION=" (random-uuid))))))
        (testing "an unrelated cookie does not block the app"
          (is (=? {:status 200, :body "DATA-APP"} (doc-with-cookie "metabase.TIMEOUT=alive"))))
        (finally
          (t2/delete! :model/Session :id session-id))))))

(deftest isolated-origin-links-go-to-the-main-host-test
  (testing "a link into an app page, opened on the isolated origin, goes to the same page on the site URL"
    (mt/with-temporary-setting-values [site-url "https://mb.example.com/metabase"]
      (mt/with-temp-env-var-value! [mb-isolated-origin isolated-origin]
        (is (=? {:status  307
                 :headers {"Location" "https://mb.example.com/metabase/apps/sales/customers/42?tab=1"}}
                (run (assoc (req "apps.example.com" "/apps/sales/customers/42") :query-string "tab=1"))))))))

(deftest isolated-origin-assets-are-inert-and-own-answers-uncached-test
  (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
    (mt/with-temp-env-var-value! [mb-isolated-origin isolated-origin]
      (let [run-asset (fn [request]
                        (let [inner   (fn [_req respond _raise]
                                        (respond {:status 200 :headers {"Content-Security-Policy" "default-src 'self'"}}))
                              result  (atom nil)]
                          ((mw.isolated-origin/isolated-origin-middleware inner)
                           request #(reset! result %) #(reset! result %))
                          @result))]
        (testing "a static asset on the isolated origin can't be scripted or submit a form, if app code opens it as a
                  page"
          (is (= "sandbox; form-action 'none'; frame-ancestors 'none'"
                 (get-in (run-asset (req "apps.example.com" "/app/dist/x.js")) [:headers "Content-Security-Policy"]))))
        (testing "the app document keeps its own policy"
          (is (= "default-src 'self'"
                 (get-in (run-asset (req "apps.example.com" "/embed/apps/sales")) [:headers "Content-Security-Policy"])))))
      (testing "a shared cache does not keep the middleware's own answers, which depend on X-Forwarded-Host"
        (doseq [[label request] [["refusal on the isolated origin" (req "apps.example.com" "/api/dataset")]
                                 ["redirect to the isolated origin" (req "mb.example.com" "/embed/apps/sales")]
                                 ["forged X-Forwarded-Host on the main host"
                                  (assoc-in (req "mb.example.com" "/") [:headers "x-forwarded-host"] "apps.example.com")]]]
          (is (= "no-store" (get-in (run request) [:headers "Cache-Control"])) label))))))

(deftest main-host-refuses-requests-from-the-isolated-origin-test
  (testing "the app document sends no requests to the main host, so the main host refuses anything from its origin"
    (mt/with-temp-env-var-value! [mb-isolated-origin isolated-origin]
      (doseq [method [:get :post]]
        (is (=? {:status 403}
                (run (-> (req "mb.example.com" "/api/user")
                         (assoc :request-method method)
                         (assoc-in [:headers "origin"] isolated-origin))))
            method))
      (testing "but not requests from the main host itself"
        (is (= :passed-through (run (assoc-in (req "mb.example.com" "/api/user") [:headers "origin"]
                                              "https://mb.example.com"))))))))

(deftest unusable-setting-fails-closed-test
  (testing "with MB_ISOLATED_ORIGIN set to a value it can't use, data apps are refused rather than served without it"
    (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
      (mt/with-temp-env-var-value! [mb-isolated-origin "https://mb.example.com:8443"]
        (is (=? {:status 503} (run (req "mb.example.com" "/embed/apps/sales"))))
        (testing "the rest of the main app keeps working"
          (is (= :passed-through (run (req "mb.example.com" "/api/session/properties")))))))))

(deftest isolated-origin-warns-once-when-site-url-missing-test
  (mt/with-dynamic-fn-redefs [server.settings/isolated-origin (constantly isolated-origin)]
    (reset! @#'mw.isolated-origin/warned-missing-site-url? false)
    (mt/with-temporary-setting-values [site-url nil]
      (testing "logs once when MB_ISOLATED_ORIGIN is set without a site URL"
        (mt/with-log-messages-for-level [messages [metabase.server.middleware.isolated-origin :error]]
          (run (req "mb.example.com" "/api/dataset"))
          (is (some #(str/includes? (:message %) "MB_ISOLATED_ORIGIN is set but the site URL is not")
                    (messages)))))
      (testing "and does not repeat the warning on later requests"
        (mt/with-log-messages-for-level [messages [metabase.server.middleware.isolated-origin :error]]
          (run (req "mb.example.com" "/api/dataset"))
          (is (empty? (messages))))))
    (testing "no warning when a site URL is configured"
      (reset! @#'mw.isolated-origin/warned-missing-site-url? false)
      (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
        (mt/with-log-messages-for-level [messages [metabase.server.middleware.isolated-origin :error]]
          (run (req "mb.example.com" "/api/dataset"))
          (is (empty? (messages))))))))

(deftest isolated-origin-serves-the-document-without-a-session-test
  (testing "the isolated origin serves the app document to a request without the session cookie, which never reaches it"
    (with-isolated-origin-data-app
      (is (=? {:status 200, :body "DATA-APP"}
              (run-through-handler (req "apps.example.com" "/embed/apps/sales")))))))

(deftest isolated-origin-keeps-every-app-allowed-hosts-private-test
  (testing "an anonymous request on the isolated origin learns no app's allowed_hosts, and can't tell an app from a
            missing one: every slug gets the same CSP"
    (with-isolated-origin-data-app
      (mt/with-temp [:model/DataApp _ {:name          "billing"
                                       :display_name  "Billing"
                                       :bundle_path   "dist/index.js"
                                       :enabled       true
                                       :allowed_hosts ["https://billing-api.corp.example.org"]}
                     :model/DataApp _ {:name          "internal-tools"
                                       :display_name  "Internal tools"
                                       :bundle_path   "dist/index.js"
                                       :enabled       false
                                       :allowed_hosts ["https://tools-api.corp.example.org"]}]
        (let [csp       (fn [slug]
                          (let [response (run-through-handler (req "apps.example.com" (str "/embed/apps/" slug)))]
                            (is (= 200 (:status response)) slug)
                            (get-in response [:headers "Content-Security-Policy"])))
              published (csp "billing")]
          (is (not (str/includes? published "corp.example.org")))
          (is (= published (csp "internal-tools") (csp "no-such-app"))))))))

(deftest isolated-origin-refusals-forbid-form-submissions-test
  (testing "the isolated origin's own 404 forbids form submissions"
    (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
      (mt/with-temp-env-var-value! [mb-isolated-origin isolated-origin]
        (let [response (run-through-handler (req "apps.example.com" "/no-such-page"))]
          (is (= 404 (:status response)))
          (is (re-find #"form-action 'none'|(?:^|;)\s*sandbox\b"
                       (str (get-in response [:headers "Content-Security-Policy"])))))))))
