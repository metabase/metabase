(ns metabase.public-settings.premium-features-test
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [mb.hawk.parallel]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.models.user :refer [User]]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise defenterprise-schema]]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- token-status-response
  [token premium-features-response]
  (http-fake/with-fake-routes-in-isolation
    {{:address      (#'premium-features/token-status-url token @#'premium-features/token-check-url)
      :query-params {:users      (str (#'premium-features/cached-active-users-count))
                     :site-uuid  (public-settings/site-uuid-for-premium-features-token-checks)
                     :mb-version (:tag config/mb-version-info)}}
     (constantly premium-features-response)}
    (#'premium-features/fetch-token-status* token)))

(def ^:private token-response-fixture
  (json/encode {:valid    true
                :status   "fake"
                :features ["test" "fixture"]
                :trial    false}))

(def random-fake-token
  "d7ad0b5f9ddfd1953b1b427b75d620e4ba91d38e7bcbc09d8982480863dbc611")

(defn- random-token []
  (let [alphabet (into [] (concat (range 0 10) (map char (range (int \a) (int \g)))))]
    (apply str (repeatedly 64 #(rand-nth alphabet)))))

(deftest fetch-token-status-test
  (t2.with-temp/with-temp [User _user {:email "admin@example.com"}]
    (let [print-token "d7ad...c611"]
      (testing "Do not log the token (#18249)"
        (let [logs        (mt/with-log-messages-for-level :info
                            (#'premium-features/fetch-token-status* random-fake-token))
              pr-str-logs (mapv pr-str logs)]
          (is (every? (complement #(re-find (re-pattern random-fake-token) %)) pr-str-logs))
          (is (= 1 (count (filter #(re-find (re-pattern print-token) %) pr-str-logs))))))

      (testing "With the backend unavailable"
        (let [result (token-status-response random-fake-token {:status 500})]
          (is (false? (:valid result)))))
      (testing "On other errors"
        (binding [http/request (fn [& _]
                                 ;; note originally the code caught clojure.lang.ExceptionInfo so don't
                                 ;; throw an ex-info here
                                 (throw (Exception. "network issues")))]
          (is (= {:valid         false
                  :status        "Unable to validate token"
                  :error-details "network issues"}
                 (premium-features/fetch-token-status (apply str (repeat 64 "b")))))))
      (testing "Only attempt the token twice (default and fallback URLs)"
        (let [call-count (atom 0)
              token      (random-token)]
          (binding [http/request (fn [& _]
                                   (swap! call-count inc)
                                   (throw (Exception. "no internet")))]

            (mt/with-temporary-raw-setting-values [:premium-embedding-token token]
              (testing "Sanity check"
                (is (= token
                       (premium-features/premium-embedding-token)))
                (is (= #{}
                       (premium-features/*token-features*))))
              (doseq [has-feature? [#'premium-features/hide-embed-branding?
                                    #'premium-features/enable-whitelabeling?
                                    #'premium-features/enable-audit-app?
                                    #'premium-features/enable-sandboxes?
                                    #'premium-features/enable-serialization?]]
                (testing (format "\n%s is false" (:name (meta has-feature?)))
                  (is (not (has-feature?)))))
              (is (= 2
                     @call-count))))))

      (testing "With a valid token"
        (let [result (token-status-response random-fake-token {:status 200
                                                               :body   token-response-fixture})]
          (is (:valid result))
          (is (contains? (set (:features result)) "test")))))))

(deftest not-found-test
  (mt/with-log-level :fatal
    ;; `partial=` here in case the Cloud API starts including extra keys... this is a "dangerous" test since changes
    ;; upstream in Cloud could break this. We probably want to catch that stuff anyway tho in tests rather than waiting
    ;; for bug reports to come in
    (is (partial= {:valid false, :status "Token does not exist."}
                  (#'premium-features/fetch-token-status* random-fake-token)))))


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
    ;; premium-features/active-users-count is cached so it could be make the test flaky
    ;; rebinding to avoid caching
    (testing "returns the number of active users"
      (with-redefs [premium-features/cached-active-users-count (fn []
                                                                 (t2/count :core_user :is_active true))]
        (is (= (t2/count :core_user :is_active true)
               (premium-features/active-users-count)))))

    (testing "Default to 0 if db is not setup yet"
      (binding [mdb.connection/*application-db* {:status (atom nil)}]
        (is (zero? (premium-features/active-users-count)))))))
