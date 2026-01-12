(ns metabase.premium-features.token-check-test
  (:require
   [clj-http.client :as http]
   [clj-http.core :as http.core]
   [clojure.test :refer :all]
   [mb.hawk.parallel]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.premium-features.core :as premium-features]
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
        checker (binding [token-check/*customize-checker* true]
                  (token-check/make-checker {:ttl-ms 500
                                             :grace-period (token-check/guava-cache-grace-period 36 TimeUnit/HOURS)}))]
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
  (testing "No DB calls are made when checking token status if the status is cached"
    (let [token (tu/random-token)
          _ (token-check/check-token token)
          ;; Sigh. This is really quite horrific. But we need some wiggle room here: any endpoint that gets some setting
          ;; inside it is going to check to see whether it's time for an update check. If it is, it'll hit the DB to see
          ;; when settings were last updated, and the count will be incremented. Therefore, let's do this a few times...
          call-counts (repeatedly 3 (fn []
                                      (t2/with-call-count [call-count]
                                        (token-check/check-token token)
                                        (call-count))))]
      ;; ... and then make sure that *some* of the times, we didn't hit the DB again.
      (is (some zero? call-counts)))))

(deftest token-checker-test
  (let [token          (tu/random-token)
        behavior       (atom :success)
        call-count     (atom 0)
        good-response  {:valid    true
                        :status   :fake
                        :features [:feature1 :feature2]}
        no-features    {:valid false :status "Unable to validate token" :error-details "network issues!"}
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
                         :ttl-ms          200
                         :grace-period    (token-check/guava-cache-grace-period 1000 TimeUnit/MILLISECONDS)})]
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
      (is (< @call-count 50))
      (testing "But we always get a good response from the grace period"
        (is (= good-response (token-check/-check-token checker token)))))
    (testing "But eventually grace period elapses"
      (Thread/sleep 1000)
      (is (= no-features (token-check/-check-token checker token))))
    (testing "When connectivity is restored we get successful token checks"
      (reset! behavior :success)
      (Thread/sleep 100) ;; wait for circuit breaker to open back up
      (is (= good-response (token-check/-check-token checker token)))))
  (testing "App db not setup yet does not invoke the circuit breaker (#65294)"
    (let [token          (tu/random-token)
          good-response  {:valid    true
                          :status   :fake
                          :features [:feature1 :feature2]}
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
                           :ttl-ms          200
                           :grace-period    (token-check/guava-cache-grace-period 1000 TimeUnit/MILLISECONDS)})]
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

(deftest grace-period-test
  (testing "implementation check"
    (let [token          (tu/random-token)
          behavior       (atom :success)
          success-token  {:valid true :status :fake :features [:feature1 :feature2]}
          restored-token {:valid true :status :fake :features [:new-feature]}
          invalid        {:valid false, :status "Unable to validate token", :error-details nil}
          underlying     (reify token-check/TokenChecker
                           (-check-token [_ t]
                             (when (= t token)
                               (case @behavior
                                 :success          success-token
                                 :error            (throw (ex-info "network troubles!" {:ka :boom}))
                                 :network-restored restored-token)))
                           (-clear-cache! [_]))
          grace          (binding [token-check/*customize-checker* true]
                           (token-check/make-checker
                            {:base         underlying
                             :grace-period (token-check/guava-cache-grace-period 20 TimeUnit/MILLISECONDS)}))]
      (is (= success-token (token-check/check-token grace token)))
      (is (= invalid (token-check/check-token grace (tu/random-token))))
      (testing "During errors"
        (reset! behavior :error)
        (is (= success-token (token-check/check-token grace token)))
        (is (= invalid (token-check/check-token grace (tu/random-token))))
        (Thread/sleep 40) ;; our simple one here has a grace period of 20 milliseconds
        (testing "but it expires"
          (is (= {:valid false :status "Unable to validate token" :error-details "network troubles!"}
                 (token-check/check-token grace token)))))
      (testing "When good"
        (reset! behavior :success)
        (is (= success-token (token-check/check-token grace token))))
      (testing "We can enter the grace period"
        (reset! behavior :error)
        (is (= success-token (token-check/check-token grace token))))
      (testing "And then we immediately get new token when network restores"
        (reset! behavior :network-restored)
        (is (= restored-token (token-check/check-token grace token)))))))

(deftest e2e
  (testing "token check hits the network"
    (let [token                 (tu/random-token)
          ;; todo: need to check that we use the grace period
          time-passes!          token-check/clear-cache!
          call-count            (atom 0)]
      (with-redefs [token-check/http-fetch (fn [& _]
                                             (swap! call-count inc)
                                             {:status 200
                                              :body   "{\"valid\":true,\"status\":\"fake\",\"features\":[\"fake\",\"features\"]}"})]
        (= {:valid true, :status "fake", :features ["fake" "features"]}
           (token-check/check-token token))
        (is (= 1 @call-count)))
      (with-redefs [token-check/http-fetch (fn [& _]
                                             (swap! call-count inc)
                                             (throw (ex-info "network failure!" {})))]
        (testing "Doesn't hit the network inside of cache duration"
          (is (= {:valid true, :status "fake", :features ["fake" "features"]}
                 (token-check/check-token token)))
          (is (= 1 @call-count)))
        (time-passes!) ;; we can clear the cache but don't have a great way to expire the grace period
        (testing "Hits the network periodically (12 hours)"
          (let [response (token-check/check-token token)]
            ;; called but we got network failure from redefs
            (is (= 2 @call-count))
            (testing "Grace period supplements errors"
              (is (= {:valid true, :status "fake", :features ["fake" "features"]}
                     response)))))))))

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
