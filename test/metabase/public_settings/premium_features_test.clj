(ns metabase.public-settings.premium-features-test
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clj-http.fake :as http-fake]
            [clojure.test :refer :all]
            [metabase.config :as config]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :as premium-features :refer [defenterprise defenterprise-schema]]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [schema.core :as s]
            [toucan.util.test :as tt]))

(defn do-with-premium-features [features f]
  (let [features (set (map name features))]
    (testing (format "\nWith premium token features = %s" (pr-str features))
      (with-redefs [premium-features/token-features (constantly features)]
        (f)))))

;; TODO -- move this to a shared `metabase-enterprise.test` namespace. Consider adding logic that will alias stuff in
;; `metabase-enterprise.test` in `metabase.test` as well *if* EE code is available
(defmacro with-premium-features
  "Execute `body` with the allowed premium features for the Premium-Features token set to `features`. Intended for use testing
  feature-flagging.

    (with-premium-features #{:audit-app}
      ;; audit app will be enabled for body, but no other premium features
      ...)"
  {:style/indent 1}
  [features & body]
  `(do-with-premium-features ~features (fn [] ~@body)))

(defn- token-status-response
  [token premium-features-response]
  (http-fake/with-fake-routes-in-isolation
    {{:address      (#'premium-features/token-status-url token)
      :query-params {:users     (str (#'premium-features/active-user-count))
                     :site-uuid (public-settings/site-uuid-for-premium-features-token-checks)}}
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
  (tt/with-temp User [_user {:email "admin@example.com"}]
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
      (testing "Only attempt the token once"
        (let [call-count (atom 0)]
          (binding [clj-http.client/request (fn [& _]
                                              (swap! call-count inc)
                                              (throw (Exception. "no internet")))]
            (mt/with-temporary-raw-setting-values [:premium-embedding-token (random-token)]
              (doseq [premium-setting [premium-features/hide-embed-branding?
                                       premium-features/enable-whitelabeling?
                                       premium-features/enable-audit-app?
                                       premium-features/enable-sandboxes?
                                       premium-features/enable-sso?
                                       premium-features/enable-advanced-config?
                                       premium-features/enable-content-management?]]
                (is (false? (premium-setting))
                    (str (:name (meta premium-setting)) "is not false")))
              (is (= @call-count 1))))))

      (testing "With a valid token"
        (let [result (token-status-response random-fake-token {:status 200
                                                               :body   token-response-fixture})]
          (is (:valid result))
          (is (contains? (set (:features result)) "test")))))))

(deftest not-found-test
  (tu/with-log-level :fatal
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

(defenterprise greeting-with-valid-token
  "Returns a non-special greeting for OSS users, and EE users who don't have a valid premium token"
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're not extra special :(" (name username)))

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

     (testing "if :feature = :any or nil, it will check if any feature exists, and fall back to the OSS version by default"
       (with-premium-features #{:some-feature}
         (is (= "Hi rasta, you're an EE customer with a valid token!"
                (greeting-with-valid-token :rasta))))

       (with-premium-features #{}
         (is (= "Hi rasta, you're not extra special :("
                (greeting-with-valid-token :rasta)))))

     (testing "if a specific premium feature is required, it will check for it, and fall back to the OSS version by default"
       (with-premium-features #{:special-greeting}
         (is (= "Hi rasta, you're an extra special EE customer!"
                (special-greeting :rasta))))

       (with-premium-features #{}
         (is (= "Hi rasta, you're not extra special :("
                (special-greeting :rasta)))))

     (testing "when :fallback is a function, it is run when the required token is not present"
       (with-premium-features #{:special-greeting}
         (is (= "Hi rasta, you're an extra special EE customer!"
                (special-greeting-or-custom :rasta))))

       (with-premium-features #{}
         (is (= "Hi rasta, you're an EE customer but not extra special."
                (special-greeting-or-custom :rasta))))))))

(defenterprise-schema greeting-with-schema :- s/Str
  "Returns a greeting for a user."
  metabase-enterprise.util-test
  [username :- s/Keyword]
  (format "Hi %s, the argument was valid" (name username)))

(defenterprise-schema greeting-with-invalid-oss-return-schema :- s/Keyword
  "Returns a greeting for a user. The OSS implementation has an invalid return schema"
  metabase-enterprise.util-test
  [username :- s/Keyword]
  (format "Hi %s, the return value was valid" (name username)))

(defenterprise-schema greeting-with-invalid-ee-return-schema :- s/Str
  "Returns a greeting for a user."
  metabase-enterprise.util-test
  [username :- s/Keyword]
  (format "Hi %s, the return value was valid" (name username)))

(defenterprise greeting-with-only-ee-schema
  "Returns a greeting for a user. Only EE version is defined with defenterprise-schema."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're an OSS customer!"))

(deftest defenterprise-schema-test
  (when-not config/ee-available?
    (testing "Argument schemas are validated for OSS implementations"
      (is (= "Hi rasta, the argument was valid" (greeting-with-schema :rasta)))

      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Input to greeting-with-schema does not match schema"
                            (greeting-with-schema "rasta"))))

   (testing "Return schemas are validated for OSS implementations"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Output of greeting-with-invalid-oss-return-schema does not match schema"
                            (greeting-with-invalid-oss-return-schema :rasta)))))

  (when config/ee-available?
    (testing "Argument schemas are validated for EE implementations"
      (is (= "Hi rasta, the schema was valid, and you're running the Enterprise Edition of Metabase!"
             (greeting-with-schema :rasta)))

      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Input to greeting-with-schema does not match schema"
                            (greeting-with-schema "rasta"))))

    (testing "Only EE schema is validated if EE implementation is called"
      (is (= "Hi rasta, the schema was valid, and you're running the Enterprise Edition of Metabase!"
             (greeting-with-invalid-oss-return-schema :rasta)))

      (with-premium-features #{:custom-feature}
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Output of greeting-with-invalid-ee-return-schema does not match schema"
                              (greeting-with-invalid-ee-return-schema :rasta)))))

    (testing "EE schema is not validated if OSS fallback is called"
      (is (= "Hi rasta, the return value was valid"
             (greeting-with-invalid-ee-return-schema :rasta))))))
