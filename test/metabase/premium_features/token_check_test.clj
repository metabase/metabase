(ns metabase.premium-features.token-check-test
  (:require
   [clj-http.client :as http]
   [clj-http.core :as http.core]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.db :as premium-features.db]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.premium-features.test-util :as tu]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
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
  [thunk]
  (let [entry   @#'token-check/entry
        breaker @#'token-check/breaker
        saved   @entry]
    (reset! entry nil)
    (reset! @#'token-check/refresh-requested? false)
    (reset! @#'token-check/last-failure nil)
    (reset! @#'token-check/ticked-for-token-hash nil)
    (.close ^dev.failsafe.CircuitBreaker breaker)
    (try
      (binding [retry/*test-time-config-hook* #(assoc % :initial-interval-millis 1 :max-interval-millis 2)]
        (thunk))
      (finally
        (.close ^dev.failsafe.CircuitBreaker breaker)
        (reset! entry saved)))))

(use-fixtures :each do-with-clean-refresher)

(defn- do-with-store
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

(deftest fetch-is-capped-by-a-timeout-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-redefs [token-check/fetch-timeout-ms 100]
      (with-store [_ #(do (Thread/sleep 5000) good-status)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Token validation timed out"
                              (token-check/refresh-now!)))))))

(deftest checked-fetch-exceptions-are-unwrapped-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [_ #(throw (java.net.ConnectException. "Connection refused"))]
      (is (thrown-with-msg? java.net.ConnectException #"Connection refused" (token-check/refresh-now!))))))

(deftest token-status-reports-the-latest-failure-test
  (let [token (tu/random-token)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [_ #(throw (java.net.ConnectException. "Connection refused"))]
        (premium-features/clear-cache!)
        (is (=? {:valid false :canonical? false :error-details "Connection refused"}
                (premium-features/token-status))))
      (testing "a successful refresh clears it"
        (with-store [_ (constantly good-status)]
          (token-check/refresh-now!))
        (is (=? {:valid true :status "ok"} (premium-features/token-status)))))
    (testing "another token's failure is not reported"
      (mt/with-temporary-raw-setting-values [premium-embedding-token token]
        (with-store [_ #(throw (java.net.ConnectException. "Connection refused"))]
          (premium-features/clear-cache!)))
      (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
        (is (=? {:valid false :canonical? false :error-details #"No current token status is held.*"}
                (premium-features/token-status)))))))

(deftest clear-cache-refreshes-and-never-throws-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [_ (constantly good-status)]
      (is (nil? (premium-features/clear-cache!)))
      (is (= #{"sandboxes"} (token-check/*token-features*))))
    (with-store [_ #(throw (ex-info "network failure!" {}))]
      (is (nil? (premium-features/clear-cache!)))
      (is (= #{"sandboxes"} (token-check/*token-features*))))))

(defn- do-with-refresher-started!
  [thunk]
  ;; an hour between ticks, so none runs during the test
  (premium-features/start-refresher! (u/hours->ms 1))
  (try
    (thunk)
    (finally
      (premium-features/stop-refresher!))))

(deftest tick-with-no-entry-held-fetches-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls (constantly good-status)]
      (token-check/tick!)
      (is (= 1 @calls))
      (is (premium-features/has-feature? :sandboxes)))))

(deftest tick-with-a-fresh-matching-entry-does-nothing-test
  (let [token (tu/random-token)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [calls (constantly good-status)]
        (token-check/refresh-now!)
        (let [row (hash-row token)]
          (token-check/tick!)
          (is (= 1 @calls))
          (is (= row (hash-row token)))
          (is (=? {:valid true :status "ok"} (premium-features/token-status))))))))

(def ^:private audit-app-status {:valid true :status "ok" :features ["audit-app"]})

(defn- change-hash-row!
  [token]
  (t2/update! :model/PremiumFeaturesCache :token_hash (#'token-check/hash-token token)
              {:token_status_hash (#'token-check/hash-token-status audit-app-status)}))

(deftest clear-local-cache-with-a-matching-hash-row-does-not-fetch-test
  (do-with-refresher-started!
   (fn []
     (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
       (with-store [calls (constantly good-status)]
         (token-check/refresh-now!)
         (dotimes [_ 3]
           (premium-features/clear-local-cache!))
         (is (= 1 @calls))
         (is (not @@#'token-check/refresh-requested?))
         (is (premium-features/has-feature? :sandboxes)))))))

(deftest clear-local-cache-with-a-differing-hash-row-fetches-test
  (do-with-refresher-started!
   (fn []
     (let [token    (tu/random-token)
           response (atom good-status)]
       (mt/with-temporary-raw-setting-values [premium-embedding-token token]
         (with-store [calls #(deref response)]
           (token-check/refresh-now!)
           (reset! response audit-app-status)
           (change-hash-row! token)
           (premium-features/clear-local-cache!)
           (is (= 2 @calls))
           (is (premium-features/has-feature? :audit-app))
           (is (not (premium-features/has-feature? :sandboxes)))
           (is (=? {:valid true :features ["audit-app"]} (premium-features/token-status)))
           (testing "the hash row now matches the held status, so the next hint does nothing"
             (premium-features/clear-local-cache!)
             (is (= 2 @calls)))))))))

(deftest clear-local-cache-with-no-held-status-fetches-test
  (do-with-refresher-started!
   (fn []
     (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
       (with-store [calls (constantly good-status)]
         (premium-features/clear-local-cache!)
         (is (= 1 @calls))
         (is (premium-features/has-feature? :sandboxes)))))))

(deftest read-for-a-newly-configured-token-ticks-early-test
  (do-with-refresher-started!
   (fn []
     (let [calls (atom 0)]
       ;; the tick runs on the refresher thread, which does not see `with-dynamic-fn-redefs`
       #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
       (with-redefs [token-check/http-fetch (fn [& _]
                                              (swap! calls inc)
                                              {:status 200 :body (json/encode good-status)})]
         (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
           (is (not (premium-features/has-feature? :sandboxes))
               "the read itself does not wait for the fetch")
           (is (true? (u/poll {:thunk       #(premium-features/has-feature? :sandboxes)
                               :done?       true?
                               :timeout-ms  5000
                               :interval-ms 10})))
           (is (= 1 @calls))
           (testing "a token whose early tick already ran gets no second one"
             (reset! @#'token-check/entry nil)
             (premium-features/has-feature? :sandboxes)
             (Thread/sleep 200)
             (is (= 1 @calls)))))
       (testing "a token whose refresh already failed waits for the scheduled tick"
         (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
           ;; a tick, if one ran, would be on the refresher thread
           #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
           (with-redefs [token-check/http-fetch (fn [& _]
                                                  (swap! calls inc)
                                                  (throw (java.net.ConnectException. "Connection refused")))]
             (premium-features/refresh-at-startup!)
             (reset! calls 0)
             (premium-features/has-feature? :sandboxes)
             (Thread/sleep 200)
             (is (zero? @calls)))))))))

(deftest clear-local-cache-whose-fetch-fails-does-not-throw-test
  (do-with-refresher-started!
   (fn []
     (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
       (with-store [calls #(throw (ex-info "network failure!" {}))]
         (is (nil? (premium-features/clear-local-cache!)))
         (is (pos? @calls)))))))

(deftest clear-local-cache-before-the-refresher-starts-only-requests-a-refresh-test
  (let [token (tu/random-token)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [calls (constantly good-status)]
        (testing "with nothing held"
          (premium-features/clear-local-cache!)
          (is (zero? @calls) "a hint that arrives during initialization does not fetch")
          (is @@#'token-check/refresh-requested?)
          (token-check/tick!)
          (is (= 1 @calls) "the first tick makes the refresh the hint asked for"))
        (testing "with a differing hash row"
          (change-hash-row! token)
          (premium-features/clear-local-cache!)
          (is (= 1 @calls))
          (is @@#'token-check/refresh-requested?)
          (token-check/tick!)
          (is (= 2 @calls))
          (is (premium-features/has-feature? :sandboxes)))))))

(deftest tick-after-another-instance-changed-the-hash-fetches-test
  (let [token    (tu/random-token)
        response (atom good-status)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [calls #(deref response)]
        (token-check/refresh-now!)
        (reset! response audit-app-status)
        (change-hash-row! token)
        (token-check/tick!)
        (is (= 2 @calls))
        (is (premium-features/has-feature? :audit-app))
        (is (not (premium-features/has-feature? :sandboxes)))
        (testing "the next tick sees the hash it now holds and does nothing"
          (token-check/tick!)
          (is (= 2 @calls)))))))

(deftest tick-with-a-missing-hash-row-fetches-and-writes-it-back-test
  (let [token (tu/random-token)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [calls (constantly good-status)]
        (token-check/refresh-now!)
        (t2/delete! :model/PremiumFeaturesCache :token_hash (#'token-check/hash-token token))
        (token-check/tick!)
        (is (= 2 @calls) "a missing row triggers one fetch")
        (is (= (:status-hash @@#'token-check/entry) (:token_status_hash (hash-row token))))
        (is (premium-features/has-feature? :sandboxes))
        (testing "the row is back, so the next tick does nothing"
          (token-check/tick!)
          (is (= 2 @calls)))))))

(deftest tick-after-the-refresh-interval-fetches-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls (constantly good-status)]
      (token-check/refresh-now!)
      (testing "an entry younger than 11h, the shortest jittered interval, is not refreshed"
        (age-entry! (t/minus (t/hours 11) (t/minutes 1)))
        (token-check/tick!)
        (is (= 1 @calls)))
      (testing "an entry older than 12h, the longest jittered interval, is"
        (age-entry! (t/minutes 62))
        (token-check/tick!)
        (is (= 2 @calls))
        (is (premium-features/has-feature? :sandboxes)))
      (testing "the refreshed entry is fresh again"
        (token-check/tick!)
        (is (= 2 @calls))))))

(deftest tick-after-a-requested-refresh-fetches-once-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls (constantly good-status)]
      (token-check/refresh-now!)
      (token-check/request-refresh!)
      (is (= 1 @calls) "requesting a refresh does not fetch")
      (token-check/tick!)
      (is (= 2 @calls))
      (testing "the request is cleared, so the next tick does nothing"
        (token-check/tick!)
        (is (= 2 @calls))))))

(deftest tick-whose-fetch-fails-leaves-the-entry-alone-test
  (let [token (tu/random-token)]
    (mt/with-temporary-raw-setting-values [premium-embedding-token token]
      (with-store [_ (constantly good-status)]
        (token-check/refresh-now!))
      (let [held @@#'token-check/entry
            row  (hash-row token)]
        (with-store [calls #(throw (ex-info "network failure!" {}))]
          (token-check/request-refresh!)
          (is (nil? (token-check/tick!)))
          (is (pos? @calls))
          (is (= held @@#'token-check/entry))
          (is (= row (hash-row token)))
          (is (premium-features/has-feature? :sandboxes)))
        (testing "the request stands, so the next tick tries again"
          (with-store [calls (constantly good-status)]
            (token-check/tick!)
            (is (= 1 @calls))
            (token-check/tick!)
            (is (= 1 @calls))))))))

(deftest tick-whose-hash-read-fails-does-not-throw-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls (constantly good-status)]
      (token-check/refresh-now!)
      (mt/with-dynamic-fn-redefs [premium-features.db/token-status-cache (fn [_] (throw (ex-info "app DB down" {})))]
        (is (nil? (token-check/tick!))))
      (is (= 1 @calls))
      (is (premium-features/has-feature? :sandboxes)))))

(deftest tick-reads-the-app-db-at-most-once-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls (constantly good-status)]
      (token-check/refresh-now!)
      ;; the first read may run the settings cache's own once-a-minute staleness check
      (token-check/tick!)
      (t2/with-call-count [call-count]
        (token-check/tick!)
        (is (= 1 (call-count)) "a tick with nothing due reads the hash row and nothing else"))
      (t2/with-call-count [call-count]
        (is (premium-features/has-feature? :sandboxes))
        (is (zero? (call-count)) "a feature check reads nothing"))
      (is (= 1 @calls)))))

(defn- fetch-log-count
  [messages]
  (count (filter #(re-find #"Checking with the MetaStore" (:message %)) messages)))

(deftest startup-refresh-on-a-healthy-store-fetches-once-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls (constantly good-status)]
      (mt/with-log-messages-for-level [messages :info]
        (is (nil? (premium-features/refresh-at-startup!)))
        (is (= 1 (fetch-log-count (messages)))))
      (is (= 1 @calls))
      (is (premium-features/has-feature? :sandboxes)))))

(deftest startup-refresh-on-an-unreachable-store-tries-once-test
  (mt/with-temporary-raw-setting-values [premium-embedding-token (tu/random-token)]
    (with-store [calls #(throw (java.net.SocketTimeoutException. "Read timed out"))]
      (is (nil? (premium-features/refresh-at-startup!)) "the failure does not escape")
      (is (= 1 @calls) "the attempt is not retried")
      (is (not (premium-features/has-feature? :sandboxes)))
      (is (=? {:valid false :canonical? false} (premium-features/token-status))))
    (testing "a later tick picks up features once the store returns"
      (with-store [calls (constantly good-status)]
        (token-check/tick!)
        (is (= 1 @calls))
        (is (premium-features/has-feature? :sandboxes))))))

(defn- refresher-threads []
  (filter #(= "premium-features-token-refresher" (.getName ^Thread %)) (keys (Thread/getAllStackTraces))))

(deftest refresher-ticks-until-stopped-test
  (let [ticks (atom 0)]
    ;; the executor's thread does not inherit dynamic bindings
    #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
    (with-redefs [token-check/tick! (fn []
                                      (when (odd? (swap! ticks inc))
                                        (throw (ex-info "tick failure!" {}))))]
      (try
        (is (true? (premium-features/start-refresher! 1)))
        (is (false? (premium-features/start-refresher! 1)) "a second start leaves the running refresher alone")
        (is (u/poll {:thunk #(deref ticks) :done? #(>= % 4) :interval-ms 1})
            "it keeps ticking after a tick throws")
        (is (= 1 (count (refresher-threads))))
        (finally
          (premium-features/stop-refresher!)))
      (is (u/poll {:thunk refresher-threads :done? empty? :interval-ms 1}) "stopping leaves no thread behind")
      (testing "it can be started again after a stop"
        (try
          (is (true? (premium-features/start-refresher! 1)))
          (finally
            (premium-features/stop-refresher!)))))))

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

(deftest refresh-for-a-replaced-token-does-not-overwrite-the-new-one-test
  (testing "a refresh for the old token that finishes after the setter stored a new one leaves the new status held"
    (let [old-token (tu/random-token)
          new-token (tu/random-token)
          fetching  (promise)
          release   (promise)]
      (mt/with-temporary-raw-setting-values [premium-embedding-token old-token]
        (mt/with-dynamic-fn-redefs [token-check/http-fetch
                                    (fn [_base-url token _site-uuid]
                                      (if (= token old-token)
                                        (do (deliver fetching true)
                                            @release
                                            {:status 200 :body (json/encode {:valid true :status "ok" :features ["old"]})})
                                        {:status 200 :body (json/encode {:valid true :status "ok" :features ["new"]})}))]
          (let [old-refresh (future (token-check/refresh-now!))]
            (is (true? (deref fetching 5000 :timeout)))
            (token-check/-set-premium-embedding-token! new-token)
            (is (= #{"new"} (token-check/*token-features*)))
            (deliver release true)
            (is (=? {:features ["old"]} (deref old-refresh 5000 :timeout)))
            (is (= #{"new"} (token-check/*token-features*)))))))))

(deftest no-app-db-with-a-token-configured-test
  (testing "with a token configured and no app DB, a feature check reads only memory and does not throw"
    (let [token (tu/random-token)]
      (mt/with-temporary-raw-setting-values [premium-embedding-token token]
        (with-store [_ (constantly good-status)]
          (token-check/refresh-now!)))
      (mt/with-dynamic-fn-redefs [premium-features.settings/premium-embedding-token (constantly token)
                                  mdb/db-is-set-up?                                 (constantly false)]
        (is (= #{"sandboxes"} (token-check/*token-features*)))
        (reset! @#'token-check/entry nil)
        (is (= #{} (token-check/*token-features*)))
        (is (=? {:valid false :canonical? false} (premium-features/token-status)))))))
