(ns metabase.server.middleware.log-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.usage :as api-keys.usage]
   [metabase.api.macros :as api.macros]
   [metabase.server.middleware.log :as mw.log]
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
   :headers               {"user-agent" "metabase-cli/1.2.3"}
   :remote-addr           "203.0.113.7"
   :embedding/auth-method "api-key"
   :api-key-id            7
   :metabase-user-id      3
   :tenant-id             9})

(defn- run-log-api-call!
  "Send `request` through [[mw.log/log-api-call]] with a downstream handler that stands in for routing — recording
  `route-template` into the carrier the middleware installed, the way `metabase.api.macros` does — and then responds
  with `response`. Returns what the two API-key usage recorders were called with (`::not-called` if they weren't)
  plus the final response."
  [request route-template response]
  (let [recorded-request   (atom ::not-called)
        recorded-last-used (atom ::not-called)
        final-response     (atom ::no-response)
        handler            (fn [request respond _raise]
                             (some-> (get request api.macros/route-template-carrier-key)
                                     (vreset! route-template))
                             (respond response))]
    (with-redefs [api-keys.usage/record-api-key-request!   #(reset! recorded-request %)
                  api-keys.usage/record-api-key-last-used! #(reset! recorded-last-used %)]
      ((mw.log/log-api-call handler)
       request
       #(reset! final-response %)
       identity))
    {:recorded-request @recorded-request
     :last-used        @recorded-last-used
     :response         @final-response}))

(deftest log-api-call-records-api-key-usage-test
  (testing "an API-key-authenticated request records one usage row and stamps last_used_at"
    (let [{:keys [recorded-request last-used]}
          (run-log-api-call! api-key-request "/api/card/:id" {:status 200, :body "ok"})]
      (is (= 7 last-used))
      (is (=? {:api-key-id     7
               :user-id        3
               :tenant-id      9
               :route-template "/api/card/:id"
               :http-method    "GET"
               :status         200
               :user-agent     "metabase-cli/1.2.3"
               :ip-address     "203.0.113.7"}
              recorded-request))
      (testing "duration is measured, and nothing from the URI or query string is recorded"
        (is (int? (:duration-ms recorded-request)))
        (is (= #{:api-key-id :user-id :tenant-id :route-template :http-method :status :duration-ms
                 :user-agent :ip-address}
               (set (keys recorded-request))))))))

(deftest log-api-call-records-nothing-for-other-auth-methods-test
  (testing "session-authenticated requests are untouched"
    (let [{:keys [recorded-request last-used]}
          (run-log-api-call! (assoc api-key-request :embedding/auth-method "session")
                             "/api/card/:id" {:status 200, :body "ok"})]
      (is (= ::not-called recorded-request))
      (is (= ::not-called last-used))))
  (testing "so are unauthenticated ones"
    (let [{:keys [recorded-request last-used]}
          (run-log-api-call! (dissoc api-key-request :embedding/auth-method)
                             nil {:status 401, :body "Unauthenticated"})]
      (is (= ::not-called recorded-request))
      (is (= ::not-called last-used)))))

(deftest log-api-call-does-not-install-a-carrier-for-other-auth-methods-test
  (testing "nothing but an API-key request pays for route-template tracking"
    (let [carrier (atom ::not-installed)]
      ((mw.log/log-api-call (fn [request respond _raise]
                              (reset! carrier (get request api.macros/route-template-carrier-key))
                              (respond {:status 200, :body "ok"})))
       (assoc api-key-request :embedding/auth-method "session")
       identity
       identity)
      (is (nil? @carrier)))))

(deftest log-api-call-records-api-key-usage-without-a-route-template-test
  (testing "a request that matched no endpoint still stamps last_used_at; the row is dropped downstream because
           route_template is NOT NULL"
    (let [{:keys [recorded-request last-used]}
          (run-log-api-call! api-key-request nil {:status 404, :body "Not found."})]
      (is (= 7 last-used))
      (is (=? {:api-key-id 7, :route-template nil, :status 404} recorded-request)))))

(deftest log-api-call-api-key-usage-is-best-effort-test
  (testing "a recorder that throws never breaks the response"
    (with-redefs [api-keys.usage/record-api-key-last-used! (fn [& _] (throw (ex-info "boom" {})))]
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
      (with-redefs [mw.log/log-info (fn [info]
                                      (deliver logged-user-id (get-in info [:log-context :metabase-user-id])))]
        (handler {:request-method :post :uri "/api/session"}
                 identity
                 identity)
        (is (= 42 (deref logged-user-id 1000 :timed-out)))))))
