(ns metabase.public-settings.premium-features-test
  (:require
   [clj-http.client :as http]
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [diehard.circuit-breaker :as dh.cb]
   [mb.hawk.parallel]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.models.user :refer [User]]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise defenterprise-schema]]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(defn- open-circuit-breaker! [cb]
  (.open ^dev.failsafe.CircuitBreaker cb))

(defmacro with-open-circuit-breaker! [& body]
  `(binding [premium-features/*store-circuit-breaker* (dh.cb/circuit-breaker
                                                       @#'premium-features/store-circuit-breaker-config)]
     (open-circuit-breaker! premium-features/*store-circuit-breaker*)
     (do ~@body)))

(defn reset-circuit-breaker-fixture [f]
  (binding [premium-features/*store-circuit-breaker* (dh.cb/circuit-breaker
                                                      @#'premium-features/store-circuit-breaker-config)]
    (f)))

(use-fixtures :each reset-circuit-breaker-fixture)

(defn- token-status-response
  [token premium-features-response]
  (http-fake/with-fake-routes-in-isolation
    {{:address      (#'premium-features/token-status-url token @#'premium-features/token-check-url)
      :query-params {:users      (str (#'premium-features/active-users-count))
                     :site-uuid  (public-settings/site-uuid-for-premium-features-token-checks)
                     :mb-version (:tag config/mb-version-info)}}
     (constantly premium-features-response)}
    (#'premium-features/fetch-token-status* token)))

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
        (#'premium-features/fetch-token-status* token)
        (let [logs (mapv :message (messages))]
          (is (every? (complement #(re-find (re-pattern token) %)) logs))
          (is (= 1 (count (filter #(re-find (re-pattern print-token) %) logs)))))))))

(deftest ^:parallel fetch-token-status-test-2
  (testing "With the backend unavailable"
    (let [result (token-status-response (random-token) {:status 500})]
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
             (premium-features/fetch-token-status (apply str (repeat 64 "b"))))))))

(deftest fetch-token-caches-successful-responses
  (testing "For successful responses, the result is cached"
    (let [call-count (atom 0)
          token      (random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               {:status 200 :body "{\"valid\": true, \"status\": \"fake\"}"})]
        (dotimes [_ 10] (premium-features/fetch-token-status token))
        (is (= 1 @call-count))))))

(deftest fetch-token-caches-invalid-responses
  (testing "For 4XX responses, the result is cached"
    (let [call-count (atom 0)
          token      (random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               {:status 400 :body "{\"valid\": false, \"status\": \"fake\"}"})]
        (dotimes [_ 10] (premium-features/fetch-token-status token))
        (is (= 1 @call-count))))))

(deftest fetch-token-does-not-cache-exceptions
  (testing "For timeouts, 5XX errors, etc. we don't cache the result"
    (let [call-count (atom 0)
          token      (random-token)]
      (binding [http/request (fn [& _]
                               (swap! call-count inc)
                               (throw (ex-info "oh, fiddlesticks" {})))]
        (dotimes [_ 5] (premium-features/fetch-token-status token))
        ;; Note that we have a fallback URL that gets hit in this case (see
        ;; https://github.com/metabase/metabase/issues/27036) and 2x5=10
        (is (= 10 @call-count))))))

(deftest fetch-token-does-not-cache-5XX-responses
  (let [call-count (atom 0)
        token      (random-token)]
    (binding [http/request (fn [& _]
                             (swap! call-count inc)
                             {:status 500})]
      (dotimes [_ 10] (premium-features/fetch-token-status token))
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
               (premium-features/fetch-token-status (random-token))))
        (is (= 0 @call-count))))))

(deftest ^:parallel fetch-token-status-test-4
  (testing "With a valid token"
    (let [result (token-status-response (random-token) {:status 200
                                                        :body   token-response-fixture})]
      (is (:valid result))
      (is (contains? (set (:features result)) "test")))))

(deftest not-found-test
  (mt/with-log-level :fatal
    ;; `partial=` here in case the Cloud API starts including extra keys... this is a "dangerous" test since changes
    ;; upstream in Cloud could break this. We probably want to catch that stuff anyway tho in tests rather than waiting
    ;; for bug reports to come in
    (is (partial= {:valid false, :status "Token does not exist."}
                  (#'premium-features/fetch-token-status* (random-token))))))

(deftest fetch-token-does-not-call-db-when-cached
  (testing "No DB calls are made for the user count when checking token status if the status is cached"
    (let [token (random-token)]
      (t2/with-call-count [call-count]
        ;; First fetch, should trigger a DB call to fetch user count
        (premium-features/fetch-token-status token)
        (is (= 1 (call-count)))

        ;; Subsequent fetches with the same token should not trigger additional DB calls
        (premium-features/fetch-token-status token)
        (is (= 1 (call-count)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Defenterprise Macro Tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defenterprise greeting
  "Returns a greeting for a user."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're an OSS customer!" (name username)))

(defenterprise special-greeting
  "Returns a non-special greeting for OSS users, and EE users who don't have the :special-greeting feature token."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're not extra special :(" (name username)))

(defenterprise special-greeting-or-custom
  "Returns a non-special greeting for OSS users."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're not extra special :(" (name username)))

(deftest defenterprise-test
  (when-not config/ee-available?
    (testing "When EE code is not available, a call to a defenterprise function calls the OSS version"
      (is (= "Hi rasta, you're an OSS customer!"
             (greeting :rasta)))))

  (when config/ee-available?
    (testing "When EE code is available"
      (testing "a call to a defenterprise function calls the EE version"
        (is (= "Hi rasta, you're running the Enterprise Edition of Metabase!"
               (greeting :rasta))))

      (testing "if a specific premium feature is required, it will check for it, and fall back to the OSS version by default"
        (mt/with-premium-features #{:special-greeting}
          (is (= "Hi rasta, you're an extra special EE customer!"
                 (special-greeting :rasta))))

        (mt/with-premium-features #{}
          (is (= "Hi rasta, you're not extra special :("
                 (special-greeting :rasta)))))

      (testing "when :fallback is a function, it is run when the required token is not present"
        (mt/with-premium-features #{:special-greeting}
          (is (= "Hi rasta, you're an extra special EE customer!"
                 (special-greeting-or-custom :rasta))))

        (mt/with-premium-features #{}
          (is (= "Hi rasta, you're an EE customer but not extra special."
                 (special-greeting-or-custom :rasta))))))))

(defenterprise-schema greeting-with-schema :- :string
  "Returns a greeting for a user."
  metabase-enterprise.util-test
  [username :- :keyword]
  (format "Hi %s, the argument was valid" (name username)))

(defenterprise-schema greeting-with-invalid-oss-return-schema :- :keyword
  "Returns a greeting for a user. The OSS implementation has an invalid return schema"
  metabase-enterprise.util-test
  [username :- :keyword]
  (format "Hi %s, the return value was valid" (name username)))

(defenterprise-schema greeting-with-invalid-ee-return-schema :- :string
  "Returns a greeting for a user."
  metabase-enterprise.util-test
  [username :- :keyword]
  (format "Hi %s, the return value was valid" (name username)))

(defenterprise greeting-with-only-ee-schema
  "Returns a greeting for a user. Only EE version is defined with defenterprise-schema."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're an OSS customer!" username))

(deftest defenterprise-schema-test
  (when-not config/ee-available?
    (testing "Argument schemas are validated for OSS implementations"
      (is (= "Hi rasta, the argument was valid" (greeting-with-schema :rasta)))

      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid input: \[\"should be a keyword, got: \\\"rasta\\\".*"
                            (greeting-with-schema "rasta"))))

    (testing "Return schemas are validated for OSS implementations"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid output: \[\"should be a keyword, got: \\\"Hi rasta.*"
                            (greeting-with-invalid-oss-return-schema :rasta)))))

  (when config/ee-available?
    (testing "Argument schemas are validated for EE implementations"
      (is (= "Hi rasta, the schema was valid, and you're running the Enterprise Edition of Metabase!"
             (greeting-with-schema :rasta)))

      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid input: \[\"should be a keyword, got: \\\"rasta\\\".*"
                            (greeting-with-schema "rasta"))))
    (testing "Only EE schema is validated if EE implementation is called"
      (is (= "Hi rasta, the schema was valid, and you're running the Enterprise Edition of Metabase!"
             (greeting-with-invalid-oss-return-schema :rasta)))

      (mt/with-premium-features #{:custom-feature}
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid output: \[\"should be a keyword, got: \\\"Hi rasta, the schema was valid.*"
                              (greeting-with-invalid-ee-return-schema :rasta)))))

    (testing "EE schema is not validated if OSS fallback is called"
      (is (= "Hi rasta, the return value was valid"
             (greeting-with-invalid-ee-return-schema :rasta))))))

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
  (t2.with-temp/with-temp
    [User _ {:is_active false}]
    (testing "returns the number of active users"
      (is (= (t2/count :model/User :is_active true :type :personal)
             (premium-features/active-users-count))))

    (testing "Default to 0 if db is not setup yet"
      (binding [mdb.connection/*application-db* {:status (atom nil)}]
        (is (zero? (premium-features/active-users-count)))))))
