(ns metabase.premium-features.token-check-test
  (:require
   [clj-http.client :as http]
   [clj-http.core :as http.core]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.test-util :as tu]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.api-error :as api-error]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.retry :as retry]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- do-with-clean-refresher
  "The refresher is one per JVM: start each test with no entry and a closed breaker, and put the previous entry back
  afterwards. Retries skip their backoff so a failing refresh does not sleep."
  [thunk]
  (let [entry   @#'token-check/entry
        breaker @#'token-check/breaker
        saved   @entry]
    (reset! entry nil)
    (.close ^dev.failsafe.CircuitBreaker breaker)
    (try
      (binding [retry/*test-time-config-hook* #(assoc % :initial-interval-millis 1 :max-interval-millis 2)]
        (thunk))
      (finally
        (.close ^dev.failsafe.CircuitBreaker breaker)
        (reset! entry saved)))))

(use-fixtures :each do-with-clean-refresher)

(defn- do-with-store
  "Stub the store: `respond` is called with no arguments for every HTTP fetch and returns either a status map, sent
  as a 200 with that JSON body, or a raw ring response. Calls `f` with an atom counting fetches."
  [respond f]
  (let [calls (atom 0)]
    (mt/with-dynamic-fn-redefs [token-check/http-fetch (fn [& _]
                                                         (swap! calls inc)
                                                         (let [response (respond)]
                                                           (if (contains? response :valid)
                                                             {:status 200 :body (json/encode response)}
                                                             response)))]
      (f calls))))

(defmacro ^:private with-store
  {:style/indent 1, :clj-kondo/lint-as 'clojure.core/let}
  [[calls-binding respond] & body]
  `(do-with-store ~respond (fn [~calls-binding] ~@body)))

(defn- hash-row [token]
  (t2/select-one :model/PremiumFeaturesCache :token_hash (#'token-check/hash-token token)))

(deftest successful-refresh-populates-entry-and-hash-row-test
  (let [token (tu/random-token)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [calls (constantly {:valid true :status "ok" :features ["sandboxes" "audit-app"]})]
        (testing "before any refresh there are no features"
          (is (= #{} (token-check/*token-features*))))
        (is (=? {:valid true :features ["sandboxes" "audit-app"]}
                (token-check/refresh-now!)))
        (is (= 1 @calls))
        (is (= #{"sandboxes" "audit-app"} (token-check/*token-features*)))
        (is (premium-features/has-feature? :sandboxes))
        (is (=? {:valid true :status "ok"} (premium-features/token-status)))
        (is (some? (hash-row token)))))))

(defn- age-entry!
  "Make the held entry look as though it was fetched `age` ago."
  [age]
  (swap! @#'token-check/entry update :fetched-at t/minus age))

(def ^:private good-status {:valid true :status "ok" :features ["sandboxes"]})

(deftest failed-refresh-leaves-held-status-alone-test
  (let [token (tu/random-token)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [_ (constantly good-status)]
        (token-check/refresh-now!))
      (let [row (hash-row token)]
        (with-store [calls #(throw (ex-info "network failure!" {}))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"network failure!" (token-check/refresh-now!)))
          (is (= 3 @calls) "the refresh retries before giving up")
          (is (= #{"sandboxes"} (token-check/*token-features*)) "the previously held features keep serving")
          (is (= row (hash-row token)) "the hash row is untouched"))))))

(deftest failed-first-refresh-holds-nothing-test
  (let [token (tu/random-token)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [_ #(throw (ex-info "network failure!" {}))]
        (is (thrown? clojure.lang.ExceptionInfo (token-check/refresh-now!)))
        (is (= #{} (token-check/*token-features*)))
        (is (nil? (hash-row token)))
        (is (=? {:valid false :canonical? false :status "Unable to validate token"}
                (premium-features/token-status)))))))

(deftest transient-responses-are-never-held-test
  (doseq [[description response] {"a 5xx"                       {:status 500}
                                  "a 2xx with no body"          {:status 200}
                                  "a bare 403"                  {:status 403}
                                  "a bare 404"                  {:status 404}
                                  "a proxy's HTML error page"   {:status 400 :body "<html>Bad Gateway</html>"}
                                  "an empty object"             {:status 200 :body "{}"}
                                  "a non-boolean valid"         {:status 200 :body "{\"valid\":\"yes\",\"status\":\"ok\"}"}
                                  "a blank status"              {:status 200 :body "{\"valid\":false,\"status\":\"\"}"}
                                  "features that aren't a list" {:status 200 :body "{\"valid\":true,\"status\":\"ok\",\"features\":\"sso\"}"}
                                  "a JSON value, not an object" {:status 200 :body "[1,2,3]"}}]
    (testing (format "%s carries no verdict from the store: the refresh fails and the held status stands" description)
      (reset! @#'token-check/entry nil)
      (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
        (with-store [_ (constantly good-status)]
          (token-check/refresh-now!))
        (with-store [_ (constantly response)]
          (is (thrown? clojure.lang.ExceptionInfo (token-check/refresh-now!)))
          (is (= #{"sandboxes"} (token-check/*token-features*))))))))

(deftest rejection-with-a-body-is-authoritative-test
  (testing "a 4xx carrying a status is the store's answer: it replaces the held status, and confers no features (EMB-2341)"
    (let [expired {:valid      false
                   :status     "Token is expired."
                   :features   ["sso" "snippet-collections"]
                   :plan-alias "pro-self-hosted"
                   :valid-thru "2026-08-25T12:00:00Z"}]
      (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
        (with-store [_ (constantly good-status)]
          (token-check/refresh-now!))
        (with-store [_ (constantly {:status 403 :body (json/encode expired)})]
          (is (= (assoc expired :canonical? true) (token-check/refresh-now!)))
          (is (= #{} (token-check/*token-features*)))
          (is (false? (premium-features/has-feature? :sso)))
          (is (false? (premium-features/canonically-has-feature? :sso)))
          (is (= "pro-self-hosted" (premium-features/plan-alias)))
          (is (= (assoc expired :canonical? true) (premium-features/token-status))))))))

(deftest invalid-status-in-2xx-confers-no-features-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [_ (constantly {:valid false :status "Token is expired." :features ["sso"]})]
      (token-check/refresh-now!)
      (is (= #{} (token-check/*token-features*)))
      (is (false? (premium-features/canonically-has-feature? :sso))))))

(deftest feature-check-reads-no-app-db-test
  (doseq [held? [false true]]
    (testing (if held? "with a held status" "with no held status")
      (reset! @#'token-check/entry nil)
      (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
        (when held?
          (with-store [_ (constantly good-status)]
            (token-check/refresh-now!)))
        ;; the first read may run the settings cache's own once-a-minute staleness check
        (premium-features/has-feature? :sandboxes)
        (with-store [calls (constantly good-status)]
          (t2/with-call-count [call-count]
            (dotimes [_ 10]
              (is (= held? (premium-features/has-feature? :sandboxes)))
              (premium-features/token-status))
            (is (zero? (call-count))))
          (is (zero? @calls)))))))

(deftest feature-check-does-not-wait-for-a-refresh-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [_ (constantly good-status)]
      (token-check/refresh-now!))
    (let [fetching (promise)
          release  (promise)]
      (with-store [_ (fn []
                       (deliver fetching true)
                       @release
                       {:valid true :status "ok" :features ["audit-app"]})]
        (let [refresh (future (token-check/refresh-now!))]
          (is (true? (deref fetching 5000 :timeout)))
          (is (= #{"sandboxes"} (token-check/*token-features*)) "the held status serves while the refresh is in flight")
          (deliver release true)
          (is (=? {:features ["audit-app"]} (deref refresh 5000 :timeout)))
          (is (= #{"audit-app"} (token-check/*token-features*))))))))

(deftest concurrent-refreshes-share-one-fetch-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (let [fetching (promise)
          release  (promise)]
      (with-store [calls (fn []
                           (deliver fetching true)
                           @release
                           good-status)]
        (let [first-refresh (future (token-check/refresh-now!))
              _             (deref fetching 5000 :timeout)
              others        (mapv (fn [_] (future (token-check/refresh-now!))) (range 7))]
          ;; give the other callers time to join before the fetch completes
          (Thread/sleep 100)
          (deliver release true)
          (is (every? #(= (assoc good-status :canonical? true) (deref % 5000 :timeout))
                      (cons first-refresh others)))
          (is (= 1 @calls)))))))

(deftest grace-period-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls (constantly good-status)]
      (token-check/refresh-now!)
      (testing "a status younger than 36h is honored"
        (age-entry! (t/hours 35))
        (is (= #{"sandboxes"} (token-check/*token-features*)))
        (is (true? (premium-features/canonically-has-feature? :sandboxes))))
      (testing "an older one is not"
        (age-entry! (t/hours 2))
        (is (= #{} (token-check/*token-features*)))
        (is (nil? (premium-features/canonically-has-feature? :sandboxes)))
        (is (=? {:valid false :canonical? false :status "Unable to validate token"}
                (premium-features/token-status))))
      (is (= 1 @calls) "reading never fetches"))))

(deftest no-entry-before-app-db-setup-test
  (testing "with no held status and no app DB, a feature check yields nothing and does not throw"
    (mt/with-dynamic-fn-redefs [mdb/db-is-set-up? (constantly false)]
      (is (= #{} (token-check/*token-features*)))
      (is (false? (premium-features/has-feature? :sandboxes))))))

(deftest status-for-another-token-is-never-served-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [_ (constantly good-status)]
      (token-check/refresh-now!)))
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (is (= #{} (token-check/*token-features*)))
    (is (=? {:valid false :canonical? false} (premium-features/token-status)))))

(deftest airgap-refresh-makes-no-http-call-test
  (let [airgap-status {:valid true :status "Token is valid" :features ["sandboxes"] :max-users 10}]
    (mt/with-dynamic-fn-redefs [token-check/decode-airgap-token (constantly airgap-status)]
      (mt/with-temporary-raw-setting-values [premium-embedding-token "airgap_fake.token"]
        (with-store [calls #(throw (ex-info "no HTTP call expected" {}))]
          (is (= (assoc airgap-status :canonical? true) (token-check/refresh-now!)))
          (is (= #{"sandboxes"} (token-check/*token-features*)))
          (is (zero? @calls)))))))

(deftest refresh-mirrors-locked-meters-test
  (mt/with-temporary-setting-values [locked-meters {}]
    (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
      (let [response (atom nil)]
        (with-store [_ #(deref response)]
          (testing "a status with :meters writes through"
            (reset! response {:valid true :status "ok" :meters {:transform-basic-runs    {:is-locked true}
                                                                :transform-advanced-runs {:is-locked false}}})
            (token-check/refresh-now!)
            (is (= {:transform-basic-runs true :transform-advanced-runs false} (premium-features/locked-meters))))
          (testing "a status without :meters leaves the setting alone"
            (reset! response {:valid true :status "ok"})
            (token-check/refresh-now!)
            (is (= {:transform-basic-runs true :transform-advanced-runs false} (premium-features/locked-meters))))
          (testing "an empty :meters unlocks everything"
            (reset! response {:valid true :status "ok" :meters {}})
            (token-check/refresh-now!)
            (is (= {} (premium-features/locked-meters))))
          (testing "a failed refresh leaves the setting alone (a network blip must never unlock)"
            (reset! response {:valid true :status "ok" :meters {:transform-basic-runs {:is-locked true}}})
            (token-check/refresh-now!)
            (reset! response {:status 503})
            (is (thrown? clojure.lang.ExceptionInfo (token-check/refresh-now!)))
            (is (= {:transform-basic-runs true} (premium-features/locked-meters)))))))))

(deftest breaker-stops-fetching-after-consecutive-failures-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls #(throw (ex-info "network failure!" {}))]
      (dotimes [_ 3]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"network failure!" (token-check/refresh-now!))))
      (reset! calls 0)
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Token validation is currently unavailable"
                            (token-check/refresh-now!)))
      (is (zero? @calls)))))

(deftest clear-cache-refreshes-and-never-throws-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [_ (constantly good-status)]
      (is (nil? (premium-features/clear-cache!)))
      (is (= #{"sandboxes"} (token-check/*token-features*))))
    (with-store [_ #(throw (ex-info "network failure!" {}))]
      (is (nil? (premium-features/clear-cache!)))
      (is (= #{"sandboxes"} (token-check/*token-features*))))))

(deftest clear-local-cache-refreshes-unless-just-refreshed-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls (constantly good-status)]
      (testing "with nothing held, a hint refreshes"
        (premium-features/clear-local-cache!)
        (is (= 1 @calls)))
      (testing "a hint right after a refresh does not"
        (premium-features/clear-local-cache!)
        (is (= 1 @calls)))
      (testing "a hint once the held status is older than the floor does"
        (age-entry! (t/minutes 1))
        (premium-features/clear-local-cache!)
        (is (= 2 @calls))))))

(deftest quotas-and-meters-reflect-a-fresh-fetch-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (let [usage (atom 1)]
      (with-store [calls (fn [] {:valid  true
                                 :status "ok"
                                 :quotas [{:hosting-feature "metabase-ai-tokens" :usage @usage}]
                                 :meters {:metabase-ai-tokens {:meter-value @usage}}})]
        (is (=? [{:usage 1}] (premium-features/quotas)))
        (swap! usage inc)
        (is (=? {:metabase-ai-tokens {:meter-value 2}} (premium-features/meters)))
        (is (= 2 @calls))))))

(deftest log-test
  (let [token       (tu/random-token)
        print-token (apply str (concat (take 4 token) "..." (take-last 4 token)))]
    (testing "Do not log the token (#18249)"
      (mt/with-temporary-raw-setting-values [premium-embedding-token token]
        (with-store [_ (constantly good-status)]
          (mt/with-log-messages-for-level [messages :info]
            (token-check/refresh-now!)
            (let [logs (mapv :message (messages))]
              (is (every? (complement #(re-find (re-pattern token) %)) logs))
              (is (= 1 (count (filter #(re-find (re-pattern print-token) %) logs)))))))))))

(deftest ^:parallel extract-locks-test
  (testing "empty :meters map yields empty result"
    (is (= {} (#'token-check/extract-locks {}))))
  (testing "meters without :is-locked are filtered out"
    (is (= {:transform-basic-runs true}
           (#'token-check/extract-locks {:transform-basic-runs    {:is-locked    true
                                                                   :meter-value  10}
                                         :transform-advanced-runs {:meter-value  5}}))))
  (testing "false :is-locked is preserved (only nil/missing is dropped)"
    (is (= {:transform-basic-runs    false
            :transform-advanced-runs true}
           (#'token-check/extract-locks {:transform-basic-runs    {:is-locked false}
                                         :transform-advanced-runs {:is-locked true}}))))
  (testing "non-transform meter keys pass through (e.g. :metabase-ai-tokens)"
    (is (= {:transform-basic-runs true
            :metabase-ai-tokens    false}
           (#'token-check/extract-locks {:transform-basic-runs {:is-locked true}
                                         :metabase-ai-tokens   {:is-locked false}})))))

(deftest token-status-without-token-test
  (testing "If premium-embedding-token is nil, the token-status setting should also be nil."
    (mt/with-temporary-setting-values [premium-embedding-token nil]
      (is (nil? (premium-features/token-status))))))

(deftest active-users-count-setting-test
  (testing "returns the number of active users"
    (is (= (t2/count :model/User :is_active true :type :personal)
           (premium-features/active-users-count))))
  (testing "Default to 0 if db is not setup yet"
    (binding [mdb.connection/*application-db* {:status (atom nil)}]
      (is (zero? (premium-features/active-users-count))))))

(deftest RemoteCheckedToken-regexp
  (testing "valid tokens"
    (is (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str (repeat 64 "a"))))
    (is (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str "mb_dev_" (repeat 57 "a")))))
  (testing "invalid tokens"
    (is (not (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str (repeat 64 "x")))))
    (is (not (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str (repeat 65 "a")))))
    (is (not (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str (repeat 63 "a")))))
    (is (not (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str "mb_dev_" (repeat 53 "a")))))))

(deftest assert-valid-airgap-user-count-test
  (testing "no limit set - no error"
    (mt/with-dynamic-fn-redefs [token-check/max-users-allowed (constantly nil)]
      (is (nil? (token-check/assert-valid-airgap-user-count!)))))
  (testing "under limit - no error"
    (mt/with-dynamic-fn-redefs [token-check/max-users-allowed    (constantly 10)
                                token-check/active-user-count (constantly 5)]
      (is (nil? (token-check/assert-valid-airgap-user-count!)))))
  (testing "at limit - no error"
    (mt/with-dynamic-fn-redefs [token-check/max-users-allowed    (constantly 10)
                                token-check/active-user-count (constantly 10)]
      (is (nil? (token-check/assert-valid-airgap-user-count!)))))
  (testing "over limit - throws"
    (mt/with-dynamic-fn-redefs [token-check/max-users-allowed    (constantly 10)
                                token-check/active-user-count (constantly 11)]
      (is (thrown-with-msg? Exception
                            #"You have reached the maximum number of users"
                            (token-check/assert-valid-airgap-user-count!))))))

(deftest assert-airgap-allows-user-creation-test
  (testing "no limit set - no error"
    (mt/with-dynamic-fn-redefs [token-check/max-users-allowed (constantly nil)]
      (is (nil? (token-check/assert-airgap-allows-user-creation!)))))
  (testing "under limit - no error (room for one more)"
    (mt/with-dynamic-fn-redefs [token-check/max-users-allowed    (constantly 10)
                                token-check/active-user-count (constantly 9)]
      (is (nil? (token-check/assert-airgap-allows-user-creation!)))))
  (testing "at limit - throws (no room for another)"
    (mt/with-dynamic-fn-redefs [token-check/max-users-allowed    (constantly 10)
                                token-check/active-user-count (constantly 10)]
      (is (thrown-with-msg? Exception
                            #"Adding another user would exceed the maximum"
                            (token-check/assert-airgap-allows-user-creation!)))))
  (testing "over limit - throws"
    (mt/with-dynamic-fn-redefs [token-check/max-users-allowed    (constantly 10)
                                token-check/active-user-count (constantly 11)]
      (is (thrown-with-msg? Exception
                            #"Adding another user would exceed the maximum"
                            (token-check/assert-airgap-allows-user-creation!))))))

(deftest send-metering-events-test
  (testing "send-metering-events! makes a POST request with correct data"
    (let [request-data (atom nil)]
      (mt/with-random-premium-token! [_token]
        (mt/with-dynamic-fn-redefs [http/post (fn [url opts]
                                                (reset! request-data {:url url :opts opts})
                                                {:status 200 :body "{}"})]
          (token-check/send-metering-events!)
          (is (some? @request-data) "POST request should have been made")
          (when @request-data
            (is (re-find #"/v2/metering$" (:url @request-data))
                "URL should end with /v2/metering")
            (is (= :json (get-in @request-data [:opts :content-type]))
                "Content-Type should be JSON")
            (is (false? (get-in @request-data [:opts :throw-exceptions]))
                "throw-exceptions should be false")
            (let [body (json/decode (get-in @request-data [:opts :body]))]
              (is (contains? body "site-uuid")
                  "Request body should include site-uuid")
              (is (contains? body "mb-version")
                  "Request body should include mb-version")
              (is (contains? body "users")
                  "Request body should include users count"))))))))

(deftest send-metering-events-preserves-value-types-test
  (testing "metering values are not converted to strings before sending"
    (let [fake-usage {"anthropic:claude-sonnet-4-6:tokens" 500
                      "openai:gpt-4:tokens"                300}
          request-data (atom nil)]
      (mt/with-random-premium-token! [_token]
        (mt/with-dynamic-fn-redefs [token-check/metering-stats (constantly {:users          10
                                                                            :external-users 2
                                                                            :internal-users 8
                                                                            :domains        1
                                                                            :metabot-usage  fake-usage
                                                                            :metabot-tokens 800})
                                    http/post                 (fn [_url opts]
                                                                (reset! request-data opts)
                                                                {:status 200 :body "{}"})]
          (token-check/send-metering-events!)
          (let [body (json/decode (:body @request-data) keyword)]
            (is (= 10 (:users body))
                "numeric values should remain numeric after JSON round-trip")
            (is (map? (:metabot-usage body))
                "map values should remain maps after JSON round-trip")
            (is (= fake-usage
                   (update-keys (:metabot-usage body) name))
                "nested map values should round-trip intact")))))))

(deftest send-metering-events-error-handling-test
  (testing "send-metering-events! handles errors gracefully"
    (mt/with-random-premium-token! [_token]
      (mt/with-dynamic-fn-redefs [http.core/request (fn [& _] (throw (Exception. "Network error")))]
        ;; Should not throw, just log the error
        (is (nil? (token-check/send-metering-events!)))))))

(deftest send-metering-events-no-token-test
  (testing "send-metering-events! does nothing when no token is set"
    (let [request-made (atom false)]
      (mt/with-temporary-setting-values [premium-embedding-token nil]
        (mt/with-dynamic-fn-redefs [http/post (fn [_url _opts]
                                                (reset! request-made true)
                                                {:status 200 :body "{}"})]
          (token-check/send-metering-events!)
          (is (false? @request-made) "No request should be made without a token"))))))

(deftest send-metering-events-airgap-token-test
  (testing "send-metering-events! does nothing for airgap tokens"
    (let [;; This is a fake airgap token format (starts with "airgap_")
          airgap-token "airgap_eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ90faketoken"
          request-made (atom false)]
      (mt/with-temporary-raw-setting-values [premium-embedding-token airgap-token]
        (mt/with-dynamic-fn-redefs [http/post (fn [_url _opts]
                                                (reset! request-made true)
                                                {:status 200 :body "{}"})]
          (token-check/send-metering-events!)
          (is (false? @request-made) "No request should be made for airgap tokens"))))))

(deftest metering-stats-test
  (testing "metering-stats returns expected keys"
    (let [stats (token-check/metering-stats)]
      (is (map? stats))
      (is (contains? stats :users))
      (is (contains? stats :external-users))
      (is (contains? stats :internal-users))
      (is (contains? stats :domains))
      (is (contains? stats :embedding-dashboard-count))
      (is (contains? stats :embedding-question-count)))))

(defn- capture-compiled-queries
  "Call `f` and return every compiled `[sql & params]` query it ran against the app DB."
  [f]
  (let [queries (atom [])]
    (methodical/add-aux-method-with-unique-key!
     #'t2.pipeline/transduce-execute-with-connection
     :around :default
     (fn [next-method rf conn query-type model query]
       (swap! queries conj query)
       (next-method rf conn query-type model query))
     ::query-capture)
    (try
      (f)
      (finally
        (methodical/remove-aux-method-with-unique-key!
         #'t2.pipeline/transduce-execute-with-connection
         :around :default
         ::query-capture)))
    @queries))

(deftest metering-stats-uses-started-at-index-test
  (testing "GHY-4651: the metering query on query_execution must use idx_query_execution_started_at, not a full table scan.
            SendMeteringEvents runs this every 15 minutes, and query_execution can hold millions of rows."
    ;; H2 names the access path in its EXPLAIN output, so the check does not depend on table size or planner costs.
    (when (= :h2 (mdb/db-type))
      (let [qe-queries (->> (capture-compiled-queries token-check/metering-stats)
                            (filter (fn [[sql]] (re-find #"(?i)from\s+\"?query_execution\"?" sql))))]
        (is (seq qe-queries))
        (doseq [[sql & params] qe-queries
                :let [plan (-> (t2/query (into [(str "EXPLAIN " sql)] params)) first :plan)]]
          (is (re-find #"IDX_QUERY_EXECUTION_STARTED_AT: STARTED_AT" plan)))))))

(deftest license-server-fields-we-do-not-read-test
  (testing "a token status response carrying fields we don't read still validates the token"
    (let [body {:valid       true
                :status      "ok"
                :features    ["sso-jwt"]
                :plan-alias  "pro-self-hosted"
                :new-field   "added by the license server"
                :store-users [{:email "owner@example.com" :id 42 :first-name "Owner" :last-name "Person"}]
                :quotas      [{:hosting-feature "metabase-ai-tokens"
                               :soft-limit      100
                               :usage           5
                               :locked          false
                               :updated-at      "2026-09-01T00:00:00Z"
                               :quota-type      "monthly"}]}]
      (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
        (with-store [_ (constantly body)]
          (is (= (assoc body :canonical? true) (token-check/refresh-now!)))
          (is (= #{"sso-jwt"} (token-check/*token-features*))))))))

;;; ------------------------------------------------ -set-premium-embedding-token! ------------------------------------------------

(deftest set-premium-embedding-token-canonical-invalid-test
  (testing "When MetaStore says the token is invalid (canonical), throws 400 with MetaStore's message"
    (let [old-token (tu/random-token)]
      (mt/with-temporary-raw-setting-values [premium-embedding-token old-token]
        (with-store [_ (constantly good-status)]
          (token-check/refresh-now!))
        (with-store [_ (constantly {:status 403 :body (json/encode {:valid         false
                                                                    :status        "Token expired"
                                                                    :error-details "Expired 2024-01-01"})})]
          (let [e (try (token-check/-set-premium-embedding-token! (tu/random-token))
                       nil
                       (catch Exception e e))]
            (is (= "Token expired" (ex-message e)))
            (is (= 400 (:status-code (ex-data e))))
            (is (= "Expired 2024-01-01" (:error-details (ex-data e)))))
          (testing "the rejected token is not stored, and the old token's features keep serving"
            (is (= old-token (premium-features/premium-embedding-token)))
            (is (= #{"sandboxes"} (token-check/*token-features*)))))))))

(deftest set-premium-embedding-token-failure-test
  (testing "When the store cannot be reached, throws 503"
    (with-store [_ #(throw (ex-info "Connection refused" {}))]
      (let [e (try (token-check/-set-premium-embedding-token! (tu/random-token))
                   nil
                   (catch Exception e e))]
        (is (= "Unable to validate token" (ex-message e)))
        (is (= 503 (:status-code (ex-data e))))
        (is (= "Connection refused" (:error-details (ex-data e))))))))

(deftest set-premium-embedding-token-valid-test
  (testing "When the token is valid, it is persisted and its features serve at once"
    (let [token (tu/random-token)]
      (mt/with-temporary-setting-values [premium-embedding-token nil]
        (with-store [calls (constantly good-status)]
          (token-check/-set-premium-embedding-token! token)
          (is (= token (premium-features/premium-embedding-token)))
          (is (= #{"sandboxes"} (token-check/*token-features*)))
          (is (some? (hash-row token)))
          (is (= 1 @calls)))))))

(deftest set-premium-embedding-token-revalidates-test
  (testing "re-entering a token after renewal revalidates with the store instead of the held expired verdict (EMB-2341)"
    (let [token (tu/random-token)
          state (atom :expired)]
      (mt/with-temporary-setting-values [premium-embedding-token nil]
        (with-store [_ #(case @state
                          :expired {:status 403 :body (json/encode {:valid false :status "Token is expired."})}
                          :renewed {:valid true :status "Token is valid." :features ["sso"]})]
          (mt/with-temporary-raw-setting-values [premium-embedding-token token]
            (is (=? {:valid false :canonical? true} (token-check/refresh-now!))))
          (reset! state :renewed)
          (token-check/-set-premium-embedding-token! token)
          (is (= token (premium-features/premium-embedding-token)))
          (is (= #{"sso"} (token-check/*token-features*))))))))

(deftest invalid-token-error-response-test
  (testing "an invalid token's error response carries its `:error-details`, and nothing else from the ex-data"
    (let [data (try (token-check/-set-premium-embedding-token! "not-a-token")
                    (catch clojure.lang.ExceptionInfo e (ex-data e)))]
      (is (= {:message       "Token format is invalid."
              :error-details "Token should be 64 hexadecimal characters."}
             (api-error/response-data data)))
      (is (= 400 (:status-code data))))))
