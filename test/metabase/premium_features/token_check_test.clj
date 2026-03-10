(ns metabase.premium-features.token-check-test
  (:require
   [clj-http.client :as http]
   [clj-http.core :as http.core]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [mb.hawk.parallel]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.task.clear-token-cache]
   [metabase.premium-features.test-util :as tu]
   [metabase.premium-features.token-check :as token-check]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest log-tests
  (let [token (tu/random-token)
        print-token (apply str (concat (take 4 token) "..." (take-last 4 token)))]
    (testing "Do not log the token (#18249)"
      (mt/with-log-messages-for-level [messages :info]
        (token-check/check-token token)
        (let [logs (mapv :message (messages))]
          (is (every? (complement #(re-find (re-pattern token) %)) logs))
          (is (= 1 (count (filter #(re-find (re-pattern print-token) %) logs)))))))))

(deftest fetch-token-caches-invalid-responses
  (testing "For 4XX responses, the result is cached"
    (let [call-count (atom 0)
          token      (tu/random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               {:status 400 :body "{\"valid\": false, \"status\": \"fake\"}"})]
        (token-check/-clear-cache! token-check/token-checker)
        (dotimes [_ 10] (token-check/check-token token))
        (is (= 1 @call-count))))))

(deftest fetch-token-does-not-cache-exceptions
  (let [call-count (atom 0)
        token      (tu/random-token)
        response   (atom :error)
        ;; i've removed the circuit breaker from the stack. that sometimes shuts down the tests in a way we don't want
        ;; to exercise here
        checker    (binding [token-check/*customize-checker* true]
                     (token-check/make-checker {:local-ttl (t/seconds 5)
                                                :soft-ttl  (t/minutes 1)
                                                :hard-ttl  (t/minutes 2)}))]
    (with-redefs [token-check/http-fetch (fn [& _]
                                           (swap! call-count inc)
                                           (case @response
                                             :error (throw (ex-info "kaboom" {:ka :boom}))
                                             :500   {:status 500}))]
      (testing "For timeouts, 5XX errors, etc. we don't cache the result"
        (dotimes [_ 5] (token-check/check-token checker token))
        (is (= 5 @call-count)))
      (testing "Does not cache 500 responses"
        (reset! call-count 0)
        (reset! response :500)
        (dotimes [_ 5] (token-check/check-token checker token))
        (is (= 5 @call-count))))))

(deftest not-found-test
  (mt/with-log-level :fatal
    (is (=? {:valid false, :status "Token does not exist."}
            (token-check/check-token (tu/random-token))))))

(deftest fetch-token-does-not-call-db-when-cached
  (testing "No DB calls are made when checking token status if the status is in local cache"
    (let [token (tu/random-token)
          _ (token-check/check-token token)
          ;; The local cache has a 5s TTL, so repeated checks within that window should not hit the DB.
          call-counts (repeatedly 3 (fn []
                                      (t2/with-call-count [call-count]
                                        (token-check/check-token token)
                                        (call-count))))]
      ;; At least some of these should be zero (served from local in-memory cache)
      (is (some zero? call-counts)))))

(deftest token-checker-test
  (let [token          (tu/random-token)
        behavior       (atom :success)
        call-count     (atom 0)
        good-response  {:valid    true
                        :status   "fake"
                        :features ["feature1" "feature2"]}
        token-response (fn [_token]
                         (swap! call-count inc)
                         (case @behavior
                           :success good-response
                           :timeout (Thread/sleep 200)
                           :error   (throw (ex-info "network issues!" {:ka :boom}))))
        checker        (token-check/make-checker
                        {:base            (reify token-check/TokenChecker
                                            (-check-token [_ token]
                                              (token-response token))
                                            (-clear-cache! [_]))
                         :circuit-breaker {:failure-threshold-ratio-in-period [4 4 1000]
                                           :delay-ms                          50
                                           :success-threshold                 1}
                         :timeout-ms      100
                         :local-ttl       (t/millis 50)
                         :soft-ttl        (t/millis 200)
                         :hard-ttl        (t/seconds 1)})]
    (testing "when no information is present, hits the underlying"
      (is (= good-response (token-check/-check-token checker token)))
      (is (= 1 @call-count)))
    (testing "hitting it again in the same timeperiod does not hit the underlying checker"
      (is (= good-response (token-check/-check-token checker token)))
      (is (= 1 @call-count)))
    (testing "While it errors, we have circuit breaking"
      (reset! behavior :error)
      (Thread/sleep 200)
      (dotimes [_ 1000] (token-check/-check-token checker token))
      (is (< @call-count 50)))
    (testing "When connectivity is restored we get successful token checks"
      (reset! behavior :success)
      (Thread/sleep 100) ;; wait for circuit breaker to open back up
      (is (= good-response (token-check/-check-token checker token)))))
  (testing "App db not setup yet does not invoke the circuit breaker (#65294)"
    (let [token          (tu/random-token)
          good-response  {:valid    true
                          :status   "fake"
                          :features ["feature1" "feature2"]}
          token-response (fn [_token]
                           good-response)
          checker        (token-check/make-checker
                          {:base            (reify token-check/TokenChecker
                                              (-check-token [_ token]
                                                (token-response token))
                                              (-clear-cache! [_]))
                           :circuit-breaker {:failure-threshold-ratio-in-period [4 4 1000]
                                             :delay-ms                          5000
                                             :success-threshold                 1}
                           :timeout-ms      100
                           :local-ttl       (t/millis 50)
                           :soft-ttl        (t/millis 200)
                           :hard-ttl        (t/seconds 1)})]
      (with-redefs [mdb/db-is-set-up? (constantly false)]
        (is (= {:valid false
                :status "Unable to validate token"
                :error-details "Metabase DB is not yet set up"}
               (token-check/-check-token checker token)))
        (dotimes [_ 50] (token-check/-check-token checker token))
        (is (= {:valid false
                :status "Unable to validate token"
                :error-details "Metabase DB is not yet set up"}
               (token-check/-check-token checker token))))
      (testing "When the db-is-set-up? we are not blocked by the circuit breaker"
        (with-redefs [mdb/db-is-set-up? (constantly true)]
          (is (= good-response (token-check/-check-token checker token))))))))

(defn- age-cache-entry!
  "Rewrite the `updated_at` timestamp for `token` in the cache table to be `age-ms` milliseconds in the past.
   Also ages the local cache entry if a `local-cache` atom is provided."
  ([token age-ms]
   (age-cache-entry! token age-ms nil))
  ([token age-ms local-cache]
   (let [token-hash (#'token-check/hash-token token)
         new-ts     (t/minus (t/offset-date-time) (t/millis age-ms))]
     (t2/update! :model/PremiumFeaturesCache :token_hash token-hash {:updated_at new-ts})
     (when local-cache
       (swap! local-cache update token-hash assoc :updated-at (t/minus (t/instant) (t/millis age-ms)))))))

(deftest e2e-test
  (testing "full stack: HTTP fetch → DB-hash-aware cache → error handling"
    (let [token       (tu/random-token)
          call-count  (atom 0)
          good-body   "{\"valid\":true,\"status\":\"fake\",\"features\":[\"fake\",\"features\"]}"
          good-resp   {:valid true, :status "fake", :features ["fake" "features"]}
          local-cache (atom {})
          ;; no circuit breaker — it carries state between runs and causes flakes
          checker     (binding [token-check/*customize-checker* true]
                        (token-check/make-checker {:local-ttl           (t/millis 50)
                                                   :soft-ttl            (t/hours 12)
                                                   :hard-ttl            (t/hours 36)
                                                   :db-hash-local-cache local-cache}))]
      (try
        (with-redefs [token-check/http-fetch (fn [& _]
                                               (swap! call-count inc)
                                               {:status 200 :body good-body})]
          (is (= good-resp (token-check/check-token checker token)))
          (is (= 1 @call-count)))
        (with-redefs [token-check/http-fetch (fn [& _]
                                               (swap! call-count inc)
                                               (throw (ex-info "network failure!" {})))]
          (testing "Doesn't hit the network inside of cache duration"
            ;; Wait for local-cached-token-checker TTL to expire, but DB-hash-aware cache is still fresh
            (Thread/sleep 60)
            (is (= good-resp (token-check/check-token checker token)))
            (is (= 1 @call-count)))
          (testing "Stale cache (past soft TTL, within hard TTL) still serves cached result"
            (age-cache-entry! token (+ (u/hours->ms 12) 1000) local-cache)
            (Thread/sleep 60) ;; expire local-cached-token-checker
            (let [refresh-done (promise)]
              (binding [token-check/*testing-only-call-after-refresh* #(deliver refresh-done true)]
                (is (= good-resp (token-check/check-token checker token))))
              ;; async refresh was attempted (and failed), but stale value was returned
              (is (true? (deref refresh-done 5000 :timeout))))
            (is (= 2 @call-count)))
          (testing "Expired cache (past hard TTL) surfaces the error"
            (age-cache-entry! token (+ (u/hours->ms 36) 1000) local-cache)
            (Thread/sleep 60) ;; expire local-cached-token-checker
            (is (= {:valid         false
                    :status        "Unable to validate token"
                    :error-details "network failure!"}
                   (token-check/check-token checker token)))))
        (finally
          (token-check/-clear-cache! checker))))))

(deftest token-status-setting-test
  (testing "If a `premium-embedding-token` has been set, the `token-status` setting should return the response
            from the store.metabase.com endpoint for that token."
    (is (= {:valid false, :status "Token does not exist."}
           (token-check/check-token (tu/random-token)))))
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
    (with-redefs [token-check/max-users-allowed (constantly nil)]
      (is (nil? (token-check/assert-valid-airgap-user-count!)))))

  (testing "under limit - no error"
    (with-redefs [token-check/max-users-allowed    (constantly 10)
                  token-check/active-user-count (constantly 5)]
      (is (nil? (token-check/assert-valid-airgap-user-count!)))))

  (testing "at limit - no error"
    (with-redefs [token-check/max-users-allowed    (constantly 10)
                  token-check/active-user-count (constantly 10)]
      (is (nil? (token-check/assert-valid-airgap-user-count!)))))

  (testing "over limit - throws"
    (with-redefs [token-check/max-users-allowed    (constantly 10)
                  token-check/active-user-count (constantly 11)]
      (is (thrown-with-msg? Exception
                            #"You have reached the maximum number of users"
                            (token-check/assert-valid-airgap-user-count!))))))

(deftest assert-airgap-allows-user-creation-test
  (testing "no limit set - no error"
    (with-redefs [token-check/max-users-allowed (constantly nil)]
      (is (nil? (token-check/assert-airgap-allows-user-creation!)))))

  (testing "under limit - no error (room for one more)"
    (with-redefs [token-check/max-users-allowed    (constantly 10)
                  token-check/active-user-count (constantly 9)]
      (is (nil? (token-check/assert-airgap-allows-user-creation!)))))

  (testing "at limit - throws (no room for another)"
    (with-redefs [token-check/max-users-allowed    (constantly 10)
                  token-check/active-user-count (constantly 10)]
      (is (thrown-with-msg? Exception
                            #"Adding another user would exceed the maximum"
                            (token-check/assert-airgap-allows-user-creation!)))))

  (testing "over limit - throws"
    (with-redefs [token-check/max-users-allowed    (constantly 10)
                  token-check/active-user-count (constantly 11)]
      (is (thrown-with-msg? Exception
                            #"Adding another user would exceed the maximum"
                            (token-check/assert-airgap-allows-user-creation!))))))

(deftest send-metering-events-test
  (testing "send-metering-events! makes a POST request with correct data"
    (let [request-data (atom nil)]
      (mt/with-random-premium-token! [_token]
        (with-redefs [http/post (fn [url opts]
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

(deftest send-metering-events-error-handling-test
  (testing "send-metering-events! handles errors gracefully"
    (mt/with-random-premium-token! [_token]
      (with-redefs [http.core/request (fn [& _] (throw (Exception. "Network error")))]
        ;; Should not throw, just log the error
        (is (nil? (token-check/send-metering-events!)))))))

(deftest send-metering-events-no-token-test
  (testing "send-metering-events! does nothing when no token is set"
    (let [request-made (atom false)]
      (mt/with-temporary-setting-values [premium-embedding-token nil]
        (with-redefs [http/post (fn [_url _opts]
                                  (reset! request-made true)
                                  {:status 200 :body "{}"})]
          (token-check/send-metering-events!)
          (is (false? @request-made) "No request should be made without a token"))))))

(deftest send-metering-events-airgap-token-test
  (testing "send-metering-events! does nothing for airgap tokens"
    (let [;; This is a fake airgap token format (starts with "airgap_")
          airgap-token "airgap_eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ90faketoken"
          request-made (atom false)]
      (with-redefs [token-check/check-token
                    (constantly {:valid    true
                                 :status   "fake"
                                 :features ["test" "fixture"]
                                 :trial    false})]
        (mt/with-temporary-raw-setting-values [premium-embedding-token airgap-token]
          (with-redefs [http/post (fn [_url _opts]
                                    (reset! request-made true)
                                    {:status 200 :body "{}"})]
            (token-check/send-metering-events!)
            (is (false? @request-made) "No request should be made for airgap tokens")))))))

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

;;; ------------------------------------------------ db-hash-aware-token-checker ------------------------------------------------

(defn- make-db-hash-aware-checker
  "Helper: wraps a base token-response fn with DB-hash-aware caching. Returns the checker."
  [token-response-fn {:keys [local-ttl soft-ttl hard-ttl]
                      :or   {local-ttl (t/millis 50)}}]
  (binding [token-check/*customize-checker* true]
    (token-check/make-checker
     {:base      (reify token-check/TokenChecker
                   (-check-token [_ token] (token-response-fn token))
                   (-clear-cache! [_]))
      :local-ttl local-ttl
      :soft-ttl  soft-ttl
      :hard-ttl  hard-ttl})))

(deftest db-hash-aware-token-checker-fresh-hit-test
  (testing "Fresh cache entry (< soft-ttl) is returned without hitting the underlying checker"
    (let [call-count    (atom 0)
          good-response {:valid true :status "OK" :features ["sandboxes"]}
          checker       (make-db-hash-aware-checker
                         (fn [_token]
                           (swap! call-count inc)
                           good-response)
                         {:soft-ttl (t/minutes 1) :hard-ttl (t/minutes 2)})
          token         (tu/random-token)]
      (try
        ;; First call: cache miss → delegate
        (is (= good-response (token-check/-check-token checker token)))
        (is (= 1 @call-count))
        ;; Second call: fresh cache hit → no delegate
        (is (= good-response (token-check/-check-token checker token)))
        (is (= 1 @call-count))
        (finally
          (token-check/-clear-cache! checker))))))

(deftest db-hash-aware-token-checker-stale-async-refresh-test
  (testing "Stale entry (soft..hard) returns cached value and triggers async refresh"
    (let [call-count       (atom 0)
          good-response    {:valid true :status "OK" :features ["sandboxes"]}
          updated-response {:valid true :status "OK" :features ["sandboxes" "audit-app"]}
          response-atom    (atom good-response)
          refresh-done     (promise)
          checker          (make-db-hash-aware-checker
                            (fn [_token]
                              (swap! call-count inc)
                              @response-atom)
                            ;; soft=1ms so it's immediately stale, hard=10s so not expired
                            {:local-ttl (t/millis 1) :soft-ttl (t/millis 1) :hard-ttl (t/seconds 10)})
          token            (tu/random-token)]
      (try
        ;; First call: cache miss → delegate
        (is (= good-response (token-check/-check-token checker token)))
        (is (= 1 @call-count))
        ;; Let the entry become stale (both local and DB)
        (Thread/sleep 10)
        ;; Switch to updated response for the async refresh
        (reset! response-atom updated-response)
        ;; Second call: stale → returns old cached value, kicks off async refresh
        (binding [token-check/*testing-only-call-after-refresh* #(deliver refresh-done true)]
          (is (= good-response (token-check/-check-token checker token)))
          (is (true? @refresh-done)))
        ;; Wait for the async refresh to complete
        (is (not= :timeout (deref refresh-done 5000 :timeout)))
        ;; Expire local cache
        (Thread/sleep 10)
        ;; Third call: should now see the refreshed value
        (is (= updated-response (token-check/-check-token checker token)))
        (finally
          (token-check/-clear-cache! checker))))))

(deftest db-hash-aware-token-checker-expired-sync-test
  (testing "Expired entry (> hard-ttl) delegates synchronously"
    (let [call-count    (atom 0)
          good-response {:valid true :status "OK" :features ["sandboxes"]}
          checker       (make-db-hash-aware-checker
                         (fn [_token]
                           (swap! call-count inc)
                           good-response)
                         ;; Both TTLs = 1ms so entry expires immediately
                         {:local-ttl (t/millis 1) :soft-ttl (t/millis 1) :hard-ttl (t/millis 1)})
          token         (tu/random-token)]
      (try
        ;; First call: miss
        (token-check/-check-token checker token)
        (is (= 1 @call-count))
        (Thread/sleep 5)
        ;; Second call: expired → synchronous delegate
        (token-check/-check-token checker token)
        (is (= 2 @call-count))
        (finally
          (token-check/-clear-cache! checker))))))

(deftest db-hash-aware-token-checker-multi-token-test
  (testing "Different tokens are cached independently"
    (let [call-count (atom 0)
          checker    (make-db-hash-aware-checker
                      (fn [token]
                        (swap! call-count inc)
                        {:valid true :status "OK" :features [(str "feat-" token)]})
                      {:soft-ttl (t/minutes 1) :hard-ttl (t/minutes 2)})
          token-a    (tu/random-token)
          token-b    (tu/random-token)]
      (try
        (let [result-a (token-check/-check-token checker token-a)]
          (is (= [(str "feat-" token-a)] (:features result-a))))
        (let [result-b (token-check/-check-token checker token-b)]
          (is (= [(str "feat-" token-b)] (:features result-b))))
        (is (= 2 @call-count))
        ;; Both cached now
        (token-check/-check-token checker token-a)
        (token-check/-check-token checker token-b)
        (is (= 2 @call-count))
        (finally
          (token-check/-clear-cache! checker))))))

(deftest db-hash-aware-token-checker-clear-cache-test
  (testing "clear-cache! removes both local and DB cache"
    (let [checker (make-db-hash-aware-checker
                   (fn [_token]
                     {:valid true :status "OK" :features ["sandboxes"]})
                   {:soft-ttl (t/minutes 1) :hard-ttl (t/minutes 2)})
          token   (tu/random-token)]
      (token-check/-check-token checker token)
      (let [token-hash (#'token-check/hash-token token)]
        (is (some? (t2/select-one :model/PremiumFeaturesCache :token_hash token-hash)))
        (token-check/-clear-cache! checker)
        (is (nil? (t2/select-one :model/PremiumFeaturesCache :token_hash token-hash)))))))

(deftest db-hash-aware-token-checker-invalid-cached-test
  (testing "Invalid token responses are also cached in table to avoid hammering MetaStore"
    (let [call-count (atom 0)
          checker    (make-db-hash-aware-checker
                      (fn [_token]
                        (swap! call-count inc)
                        {:valid false :status "Token does not exist."})
                      {:soft-ttl (t/minutes 1) :hard-ttl (t/minutes 2)})
          token      (tu/random-token)]
      (try
        (is (= {:valid false :status "Token does not exist."}
               (token-check/-check-token checker token)))
        (is (= 1 @call-count))
        ;; Second call should use cache
        (is (= {:valid false :status "Token does not exist."}
               (token-check/-check-token checker token)))
        (is (= 1 @call-count))
        (finally
          (token-check/-clear-cache! checker))))))

(deftest db-hash-aware-token-checker-cross-instance-sync-test
  (testing "When instance A refreshes and gets new features, instance B detects the hash mismatch and re-fetches"
    (let [call-count-a     (atom 0)
          call-count-b     (atom 0)
          old-response     {:valid true :status "OK" :features ["sandboxes"]}
          new-response     {:valid true :status "OK" :features ["sandboxes" "audit-app"]}
          response-a       (atom old-response)
          response-b       (atom old-response)
          checker-a        (make-db-hash-aware-checker
                            (fn [_token]
                              (swap! call-count-a inc)
                              @response-a)
                            {:local-ttl (t/millis 1) :soft-ttl (t/millis 1) :hard-ttl (t/millis 1)})
          checker-b        (make-db-hash-aware-checker
                            (fn [_token]
                              (swap! call-count-b inc)
                              @response-b)
                            {:local-ttl (t/millis 1) :soft-ttl (t/minutes 10) :hard-ttl (t/minutes 20)})
          token            (tu/random-token)]
      (try
        ;; Both instances populate their caches with old-response
        (is (= old-response (token-check/-check-token checker-a token)))
        (is (= old-response (token-check/-check-token checker-b token)))
        (is (= 1 @call-count-a))
        (is (= 1 @call-count-b))
        ;; Instance A gets new features and refreshes (expired TTL forces sync refresh)
        (reset! response-a new-response)
        (Thread/sleep 5) ;; expire checker-a's local + DB TTLs
        (is (= new-response (token-check/-check-token checker-a token)))
        (is (= 2 @call-count-a))
        ;; Instance B has a long TTL, but the DB hash now differs from its local hash
        ;; So it should detect the mismatch and do a synchronous re-fetch
        (reset! response-b new-response)
        (Thread/sleep 5) ;; expire local-cached-token-checker's 1ms TTL
        (is (= new-response (token-check/-check-token checker-b token)))
        (is (= 2 @call-count-b))
        (finally
          (token-check/-clear-cache! checker-a)
          (token-check/-clear-cache! checker-b))))))

(deftest db-hash-aware-token-checker-exception-propagation-test
  (testing "When delegate throws on expired/missing, exception propagates through error-catching"
    (let [checker (make-db-hash-aware-checker
                   (fn [_token]
                     (throw (ex-info "MetaStore unreachable" {})))
                   {:soft-ttl (t/minutes 1) :hard-ttl (t/minutes 2)})
          token   (tu/random-token)]
      ;; error-catching wraps it, so we get the error-details response
      (is (= {:valid false
              :status "Unable to validate token"
              :error-details "MetaStore unreachable"}
             (token-check/-check-token checker token))))))

(deftest db-hash-aware-token-checker-tamper-resistance-test
  (testing "Tampering with the DB hash triggers a re-fetch from MetaStore, not a cache hit"
    (let [call-count    (atom 0)
          good-response {:valid true :status "OK" :features ["sandboxes"]}
          checker       (make-db-hash-aware-checker
                         (fn [_token]
                           (swap! call-count inc)
                           good-response)
                         {:local-ttl (t/millis 1) :soft-ttl (t/minutes 10) :hard-ttl (t/minutes 20)})
          token         (tu/random-token)
          token-hash    (#'token-check/hash-token token)]
      (try
        ;; Populate the cache
        (is (= good-response (token-check/-check-token checker token)))
        (is (= 1 @call-count))
        ;; Tamper with the DB hash — simulate someone modifying the row
        (t2/update! :model/PremiumFeaturesCache :token_hash token-hash
                    {:token_status_hash "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"})
        ;; Expire local-cached-token-checker
        (Thread/sleep 5)
        ;; Next check should detect hash mismatch and re-fetch from MetaStore
        (is (= good-response (token-check/-check-token checker token)))
        (is (= 2 @call-count))
        (finally
          (token-check/-clear-cache! checker))))))

(deftest startup-clears-token-cache-test
  (testing "The startup hook clears the token cache table so the first check after boot hits MetaStore"
    (let [call-count    (atom 0)
          good-response {:valid true :status "OK" :features ["sandboxes"]}
          checker       (make-db-hash-aware-checker
                         (fn [_token]
                           (swap! call-count inc)
                           good-response)
                         {:soft-ttl (t/minutes 10) :hard-ttl (t/minutes 20)})
          token         (tu/random-token)]
      (try
        ;; Populate the cache
        (token-check/-check-token checker token)
        (is (= 1 @call-count))
        (let [token-hash (#'token-check/hash-token token)]
          (is (some? (t2/select-one :model/PremiumFeaturesCache :token_hash token-hash)))
          ;; Run the startup hook (clears the global token-checker's cache, including the table)
          (startup/def-startup-logic! :metabase.premium-features.task.clear-token-cache/clear-token-cache)
          ;; Table should be cleared
          (is (nil? (t2/select-one :model/PremiumFeaturesCache :token_hash token-hash))))
        (finally
          (token-check/-clear-cache! checker))))))
