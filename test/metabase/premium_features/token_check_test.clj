(ns metabase.premium-features.token-check-test
  (:require
   [clj-http.client :as http]
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [diehard.circuit-breaker :as dh.cb]
   [mb.hawk.parallel]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.premium-features.test-util :as tu]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(defn- open-circuit-breaker! [cb]
  (.open ^dev.failsafe.CircuitBreaker cb))

(defmacro with-open-circuit-breaker! [& body]
  `(binding [token-check/*store-circuit-breaker* (dh.cb/circuit-breaker
                                                  @#'token-check/store-circuit-breaker-config)]
     (open-circuit-breaker! token-check/*store-circuit-breaker*)
     (do ~@body)))

(defn reset-circuit-breaker-fixture [f]
  (binding [token-check/*store-circuit-breaker* (dh.cb/circuit-breaker
                                                 @#'token-check/store-circuit-breaker-config)]
    (f)))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each reset-circuit-breaker-fixture)

(def no-op-grace
  "Grace period that does nothing"
  (reify token-check/GracePeriod
    (save! [_ _token _features] nil)
    (retrieve [_ _token] nil)))

(defn- token-status-response
  ([token token-check-response]
   (token-status-response token token-check-response no-op-grace))
  ([token token-check-response grace-period]
   (http-fake/with-fake-routes-in-isolation
     {{:address      (#'token-check/token-status-url token @#'token-check/token-check-url)
       :query-params (merge (#'token-check/stats-for-token-request)
                            {:site-uuid  (premium-features.settings/site-uuid-for-premium-features-token-checks)
                             :mb-version (:tag config/mb-version-info)})}
      (constantly token-check-response)}
     (#'token-check/fetch-token-status* token grace-period))))

(def ^:private token-response-fixture
  (json/encode {:valid    true
                :status   "fake"
                :features ["test" "fixture"]
                :trial    false}))

(deftest ^:parallel fetch-token-status-test
  (let [token (tu/random-token)
        print-token (apply str (concat (take 4 token) "..." (take-last 4 token)))]
    (testing "Do not log the token (#18249)"
      (mt/with-log-messages-for-level [messages :info]
        (#'token-check/fetch-token-status* token no-op-grace)
        (let [logs (mapv :message (messages))]
          (is (every? (complement #(re-find (re-pattern token) %)) logs))
          (is (= 1 (count (filter #(re-find (re-pattern print-token) %) logs)))))))))

(deftest ^:parallel fetch-token-status-test-2
  (testing "With the backend unavailable"
    (let [result (token-status-response (tu/random-token) {:status 500})]
      (is (false? (:valid result))))))

(deftest ^:parallel fetch-token-status-test-3
  (testing "On other errors"
    (binding [http/request (fn [& _]
                             ;; note originally the code caught clojure.lang.ExceptionInfo so don't
                             ;; throw an ex-info here
                             (throw (Exception. "network issues")))]
      (is (= {:valid         false
              :status        "Unable to validate token"
              :error-details "network issues"}
             (#'token-check/fetch-token-status (apply str (repeat 64 "b")) no-op-grace))))))

(deftest fetch-token-caches-successful-responses
  (testing "For successful responses, the result is cached"
    (let [call-count (atom 0)
          token      (tu/random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               {:status 200 :body "{\"valid\": true, \"status\": \"fake\"}"})]
        (dotimes [_ 10] (#'token-check/fetch-token-status token no-op-grace))
        (is (= 1 @call-count))))))

(deftest fetch-token-caches-invalid-responses
  (testing "For 4XX responses, the result is cached"
    (let [call-count (atom 0)
          token      (tu/random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               {:status 400 :body "{\"valid\": false, \"status\": \"fake\"}"})]
        (dotimes [_ 10] (#'token-check/fetch-token-status token no-op-grace))
        (is (= 1 @call-count))))))

(deftest fetch-token-does-not-cache-exceptions
  (testing "For timeouts, 5XX errors, etc. we don't cache the result"
    (let [call-count (atom 0)
          token      (tu/random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               (throw (ex-info "oh, fiddlesticks" {})))]
        (dotimes [_ 5] (#'token-check/fetch-token-status token no-op-grace))
        ;; Note that we have a fallback URL that gets hit in this case (see
        ;; https://github.com/metabase/metabase/issues/27036) and 2x5=10
        (is (= 5 @call-count))))))

(deftest fetch-token-does-not-cache-5XX-responses
  (let [call-count (atom 0)
        token      (tu/random-token)]
    (binding [http/request (fn [& _]
                             (swap! call-count inc)
                             {:status 500})]
      (dotimes [_ 10] (#'token-check/fetch-token-status token no-op-grace))
      ;; Same as above, we have a fallback URL that gets hit in this case (see
      ;; https://github.com/metabase/metabase/issues/27036) and 2x10=20
      (is (= 10 @call-count)))))

(deftest fetch-token-is-circuit-broken
  (let [call-count (atom 0)]
    (with-open-circuit-breaker!
      (binding [http/request (fn [& _] (swap! call-count inc))]
        (is (= {:valid false
                :status "Unable to validate token"
                :error-details "Token validation is currently unavailable."}
               (#'token-check/fetch-token-status (tu/random-token) no-op-grace)))
        (is (= 0 @call-count))))))

(deftest ^:parallel fetch-token-status-test-4
  (testing "With a valid token"
    (let [result (token-status-response (tu/random-token) {:status 200
                                                           :body   token-response-fixture})]
      (is (:valid result))
      (is (contains? (set (:features result)) "test")))))

(deftest not-found-test
  (mt/with-log-level :fatal
    ;; `partial=` here in case the Cloud API starts including extra keys... this is a "dangerous" test since changes
    ;; upstream in Cloud could break this. We probably want to catch that stuff anyway tho in tests rather than waiting
    ;; for bug reports to come in
    (is (partial= {:valid false, :status "Token does not exist."}
                  (#'token-check/fetch-token-status* (tu/random-token) no-op-grace)))))

(deftest fetch-token-does-not-call-db-when-cached
  (testing "No DB calls are made when checking token status if the status is cached"
    (let [token (tu/random-token)
          _ (#'token-check/fetch-token-status token no-op-grace)
          ;; Sigh. This is really quite horrific. But we need some wiggle room here: any endpoint that gets some setting
          ;; inside it is going to check to see whether it's time for an update check. If it is, it'll hit the DB to see
          ;; when settings were last updated, and the count will be incremented. Therefore, let's do this a few times...
          call-counts (repeatedly 3 (fn []
                                      (t2/with-call-count [call-count]
                                        (#'token-check/fetch-token-status token no-op-grace)
                                        (call-count))))]
      ;; ... and then make sure that *some* of the times, we didn't hit the DB again.
      (is (some zero? call-counts)))))

(deftest grace-period-test
  (testing "implementation check"
    (let [token (tu/random-token)
          grace (token-check/make-grace-period 20 TimeUnit/MILLISECONDS)]
      (token-check/save! grace token {:saved :features})
      (is (= {:saved :features} (token-check/retrieve grace token)))
      (is (nil? (token-check/retrieve grace (tu/random-token))))
      (Thread/sleep 50)
      (testing "Expires tokens after grace period elapses"
        (is (nil? (token-check/retrieve grace token))))))
  (testing "Falls back last known value"
    (let [token (tu/random-token)]
      (mt/with-temporary-setting-values [premium-embedding-token token]
        (testing "Initially gets good stuff"
          (binding [http/request (fn [& _] {:status 200
                                            :body "{\"valid\":true,\"status\":\"fake\",\"features\":[\"fake\",\"features\"]}"})]
            (is (= #{"fake" "features"} (token-check/*token-features*)))))
        (testing "When service goes down, continue in grace period"
          (let [called? (atom false)]
            (binding [http/request (fn [& _]
                                     (reset! called? true)
                                     {:status 500})]
              (is (= #{"fake" "features"} (token-check/*token-features*)))
              (is (not @called?) "We should memoize token values")
              ;; simulate cache expiration after 12 hours
              (token-check/clear-cache)
              (is (= #{"fake" "features"} (token-check/*token-features*)))
              (is @called? "Did not hit the network!")
              (is (= {:valid true :status "fake" :features ["fake" "features"]}
                     (token-check/retrieve token-check/grace-period token)))))))))
  (testing "Setting a new value populates the grace period cache"
    (let [new-token (tu/random-token)]
      (binding [http/request (fn [& _] {:status 200
                                        :body "{\"valid\":true,\"status\":\"fake\",\"features\":[\"fake\",\"features\"]}"})]
        (mt/discard-setting-changes [premium-embedding-token]
          (premium-features.settings/premium-embedding-token! new-token)
          (is (= #{"fake" "features"} (token-check/*token-features*)))
          (is (= {:valid true :status "fake" :features ["fake" "features"]}
                 (token-check/retrieve token-check/grace-period new-token))))))))

(deftest token-status-setting-test
  (testing "If a `premium-embedding-token` has been set, the `token-status` setting should return the response
            from the store.metabase.com endpoint for that token."
    (mt/with-temporary-setting-values [premium-embedding-token (tu/random-token)]
      (is (= {:valid false, :status "Token does not exist."}
             (premium-features/token-status)))))
  (testing "If premium-embedding-token is nil, the token-status setting should also be nil."
    (mt/with-temporary-setting-values [premium-embedding-token nil]
      (is (nil? (premium-features/token-status))))))

(deftest active-users-count-setting-test
  (mt/with-temp
    [:model/User _ {:is_active false}]
    (testing "returns the number of active users"
      (is (= (t2/count :model/User :is_active true :type :personal)
             (premium-features/active-users-count))))

    (testing "Default to 0 if db is not setup yet"
      (binding [mdb.connection/*application-db* {:status (atom nil)}]
        (is (zero? (premium-features/active-users-count)))))))

(deftest RemoteCheckedToken-regexp
  (testing "valid tokens"
    (is (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str (repeat 64 "a"))))
    (is (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str "mb_dev_" (repeat 57 "a")))))

  (testing "invalid tokens"
    (is (not (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str (repeat 64 "x")))))
    (is (not (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str (repeat 65 "a")))))
    (is (not (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str (repeat 63 "a")))))
    (is (not (mr/validate [:re @#'token-check/RemoteCheckedToken] (apply str "mb_dev_" (repeat 53 "a")))))))
