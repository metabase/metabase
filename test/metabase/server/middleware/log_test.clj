(ns metabase.server.middleware.log-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.usage :as api-keys.usage]
   [metabase.api.macros :as api.macros]
   [metabase.server.middleware.log :as mw.log]
   [metabase.server.middleware.route-template-carrier :as mw.route-template-carrier]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest log-info-input-tests
  (testing "log-info handles nil status input"
    (is (true?
         (try
           (#'mw.log/log-info nil)
           true
           (catch Throwable _
             false)))))) ; Make sure it didn't throw NPE

;; just make sure `stats-test` can report application DB information correctly without barfing.
(deftest stats-test
  (testing `log/stats
    (is (re= #"^App DB connections:.*"
             (#'mw.log/stats (fn [] {:info true}))))))

(deftest should-log-request?-test
  (testing "Health check logging can be disabled via env var"
    (mt/with-temp-env-var-value! [mb-health-check-logging-enabled true]
      (is (#'mw.log/should-log-request? {:uri "/api/health"}))
      (is (#'mw.log/should-log-request? {:uri "/livez"}))
      (is (#'mw.log/should-log-request? {:uri "/readyz"})))
    (mt/with-temp-env-var-value! [mb-health-check-logging-enabled false]
      (is (not (#'mw.log/should-log-request? {:uri "/api/health"})))
      (is (not (#'mw.log/should-log-request? {:uri "/livez"})))
      (is (not (#'mw.log/should-log-request? {:uri "/readyz"}))))))

;;; ------------------------------------------- API key usage analytics -------------------------------------------

(def ^:private api-key-request
  {:request-method        :get
   :uri                   "/api/card/1"
   :headers               {"user-agent" "metabase-cli/1.2.3", "x-metabase-client" "embedding-sdk-react"
                           "x-metabase-embed-referrer" "https://example.com/app"}
   :remote-addr           "203.0.113.7"
   :embedding/auth-method "api-key"
   :api-key-id            7
   :metabase-user-id      3})

(defn- run-log-api-call!
  "Send `request` through [[mw.route-template-carrier/wrap-route-template-carrier]] wrapping
  [[mw.log/log-api-call]] — mirroring their order in the real middleware stack — with a downstream
  handler that stands in for routing — recording `route-template` into the carrier the outer
  middleware installed, the way `metabase.api.macros` does — and then responds with `response`.
  Returns what the API-key usage recorder was called with (`::not-called` if it wasn't) plus the
  final response.

  The recorder now takes the raw `request`/`response` plus a small `extra-info` map — see
  `metabase-enterprise.api-keys.usage/record-api-key-usage!`. Header/field extraction from `request` is the
  recorder's job, not this middleware's, so it's exercised in `metabase-enterprise.api-keys.usage-test`, not here."
  [request route-template response]
  (let [recorded       (atom ::not-called)
        final-response (atom ::no-response)
        handler        (fn [request respond _raise]
                         (some-> (get request api.macros/route-template-carrier-key)
                                 (vreset! route-template))
                         (respond response))]
    (mt/with-dynamic-fn-redefs [api-keys.usage/record-api-key-usage!
                                (fn [request response extra-info]
                                  (reset! recorded {:request request, :response response, :extra-info extra-info}))]
      ((mw.route-template-carrier/wrap-route-template-carrier (mw.log/log-api-call handler))
       request
       #(reset! final-response %)
       identity))
    {:recorded @recorded, :response @final-response}))

(deftest log-api-call-records-api-key-usage-test
  (testing "an API-key-authenticated request records one usage event"
    (let [{:keys [recorded]}
          (run-log-api-call! api-key-request "/api/card/:id" {:status 200, :body "ok"})]
      (testing "the raw request and response are forwarded unchanged"
        (is (=? api-key-request (:request recorded)))
        (is (= {:status 200, :body "ok"} (:response recorded))))
      (testing "extra-info carries only what the middleware alone can supply"
        (is (= "/api/card/:id" (:route-template (:extra-info recorded))))
        (is (int? (:duration-ms (:extra-info recorded))))
        (is (instance? java.time.OffsetDateTime (:occurred-at (:extra-info recorded))))
        (is (= #{:route-template :duration-ms :occurred-at}
               (set (keys (:extra-info recorded)))))))))

(deftest log-api-call-records-api-key-usage-even-when-console-logging-is-suppressed-test
  (testing "usage recording and console-log suppression are independent eligibility checks"
    (let [{:keys [recorded response]}
          (run-log-api-call! (assoc api-key-request :uri "/api/logger/logs")
                             "/api/logger/logs" {:status 200, :body "ok"})]
      (testing "/api/logger/logs is always excluded from the console log, but usage still recorded"
        (is (not= ::not-called recorded))
        (is (= "/api/logger/logs" (:route-template (:extra-info recorded)))))
      (testing "the response passes through unaffected"
        (is (= {:status 200, :body "ok"} response))))))

(deftest log-api-call-records-nothing-for-other-auth-methods-test
  (testing "session-authenticated requests are untouched"
    (let [{:keys [recorded]}
          (run-log-api-call! (assoc api-key-request :embedding/auth-method "session")
                             "/api/card/:id" {:status 200, :body "ok"})]
      (is (= ::not-called recorded))))
  (testing "so are unauthenticated ones"
    (let [{:keys [recorded]}
          (run-log-api-call! (dissoc api-key-request :embedding/auth-method)
                             nil {:status 401, :body "Unauthenticated"})]
      (is (= ::not-called recorded)))))

(deftest log-api-call-records-api-key-usage-without-a-route-template-test
  (testing "a request that matched no endpoint still records the event, with a nil route-template. Whether the
           usage-log row gets dropped downstream because route_template is NOT NULL, and whether last_used_at
           still gets stamped regardless, are decisions the recorder makes — see
           metabase-enterprise.api-keys.usage-test."
    (let [{:keys [recorded]}
          (run-log-api-call! api-key-request nil {:status 404, :body "Not found."})]
      (is (= 7 (:api-key-id (:request recorded))))
      (is (nil? (:route-template (:extra-info recorded))))
      (is (= 404 (:status (:response recorded)))))))

(deftest log-api-call-api-key-usage-is-best-effort-test
  (testing "a recorder that throws never breaks the response"
    (mt/with-dynamic-fn-redefs [api-keys.usage/record-api-key-usage! (fn [& _] (throw (ex-info "boom" {})))]
      (let [response (atom ::no-response)]
        ((mw.log/log-api-call (fn [_request respond _raise] (respond {:status 200, :body "ok"})))
         api-key-request
         #(reset! response %)
         identity)
        (is (= {:status 200, :body "ok"} @response))))))

(deftest log-api-call-captures-user-id-from-response-metadata-test
  (testing "log-api-call reads :metabase-user-id from response metadata (#74017)"
    (let [logged-user-id (promise)
          handler        (mw.log/log-api-call
                          (fn [_request respond _raise]
                            (respond (with-meta {:status 200 :body "ok"}
                                                {:metabase-user-id 42}))))]
      (mt/with-dynamic-fn-redefs [mw.log/log-info (fn [info]
                                                    (deliver logged-user-id (get-in info [:log-context :metabase-user-id])))]
        (handler {:request-method :post :uri "/api/session"}
                 identity
                 identity)
        (is (= 42 (deref logged-user-id 1000 :timed-out)))))))
