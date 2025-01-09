(ns metabase.premium-features.token-check-test
  (:require
   [clj-http.client :as http]
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [diehard.circuit-breaker :as dh.cb]
   [mb.hawk.parallel]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.token-check :as token-check]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

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

(defn- token-status-response
  [token token-check-response]
  (http-fake/with-fake-routes-in-isolation
    {{:address      (#'token-check/token-status-url token @#'token-check/token-check-url)
      :query-params {:users      (str (#'token-check/active-users-count))
                     :site-uuid  (public-settings/site-uuid-for-premium-features-token-checks)
                     :mb-version (:tag config/mb-version-info)}}
     (constantly token-check-response)}
    (#'token-check/fetch-token-status* token)))

(def ^:private token-response-fixture
  (json/encode {:valid    true
                :status   "fake"
                :features ["test" "fixture"]
                :trial    false}))

(defn random-token
  "A random token-like string"
  []
  (let [alphabet (into [] (concat (range 0 10) (map char (range (int \a) (int \g)))))]
    (apply str (repeatedly 64 #(rand-nth alphabet)))))

(deftest ^:parallel fetch-token-status-test
  (let [token (random-token)
        print-token (apply str (concat (take 4 token) "..." (take-last 4 token)))]
    (testing "Do not log the token (#18249)"
      (mt/with-log-messages-for-level [messages :info]
        (#'token-check/fetch-token-status* token)
        (let [logs (mapv :message (messages))]
          (is (every? (complement #(re-find (re-pattern token) %)) logs))
          (is (= 1 (count (filter #(re-find (re-pattern print-token) %) logs)))))))))

(deftest ^:parallel fetch-token-status-test-2
  (testing "With the backend unavailable"
    (let [result (#'token-status-response (random-token) {:status 500})]
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
             (#'token-check/fetch-token-status (apply str (repeat 64 "b"))))))))

(deftest fetch-token-caches-successful-responses
  (testing "For successful responses, the result is cached"
    (let [call-count (atom 0)
          token      (random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               {:status 200 :body "{\"valid\": true, \"status\": \"fake\"}"})]
        (dotimes [_ 10] (#'token-check/fetch-token-status token))
        (is (= 1 @call-count))))))

(deftest fetch-token-caches-invalid-responses
  (testing "For 4XX responses, the result is cached"
    (let [call-count (atom 0)
          token      (random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               {:status 400 :body "{\"valid\": false, \"status\": \"fake\"}"})]
        (dotimes [_ 10] (#'token-check/fetch-token-status token))
        (is (= 1 @call-count))))))

(deftest fetch-token-does-not-cache-exceptions
  (testing "For timeouts, 5XX errors, etc. we don't cache the result"
    (let [call-count (atom 0)
          token      (random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               (throw (ex-info "oh, fiddlesticks" {})))]
        (dotimes [_ 5] (#'token-check/fetch-token-status token))
        ;; Note that we have a fallback URL that gets hit in this case (see
        ;; https://github.com/metabase/metabase/issues/27036) and 2x5=10
        (is (= 10 @call-count))))))

(deftest fetch-token-does-not-cache-5XX-responses
  (let [call-count (atom 0)
        token      (random-token)]
    (binding [http/request (fn [& _]
                             (swap! call-count inc)
                             {:status 500})]
      (dotimes [_ 10] (#'token-check/fetch-token-status token))
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
               (#'token-check/fetch-token-status (random-token))))
        (is (= 0 @call-count))))))

(deftest ^:parallel fetch-token-status-test-4
  (testing "With a valid token"
    (let [result (#'token-status-response (random-token) {:status 200
                                                          :body   token-response-fixture})]
      (is (:valid result))
      (is (contains? (set (:features result)) "test")))))

(deftest not-found-test
  (mt/with-log-level :fatal
    ;; `partial=` here in case the Cloud API starts including extra keys... this is a "dangerous" test since changes
    ;; upstream in Cloud could break this. We probably want to catch that stuff anyway tho in tests rather than waiting
    ;; for bug reports to come in
    (is (partial= {:valid false, :status "Token does not exist."}
                  (#'token-check/fetch-token-status* (random-token))))))

(deftest fetch-token-does-not-call-db-when-cached
  (testing "No DB calls are made for the user count when checking token status if the status is cached"
    (let [token (random-token)]
      (t2/with-call-count [call-count]
        ;; First fetch, should trigger a DB call to fetch user count
        (#'token-check/fetch-token-status token)
        (is (= 1 (call-count)))

        ;; Subsequent fetches with the same token should not trigger additional DB calls
        (#'token-check/fetch-token-status token)
        (is (= 1 (call-count)))))))

(deftest token-status-setting-test
  (testing "If a `premium-embedding-token` has been set, the `token-status` setting should return the response
            from the store.metabase.com endpoint for that token."
    (mt/with-temporary-raw-setting-values [premium-embedding-token (random-token)]
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
