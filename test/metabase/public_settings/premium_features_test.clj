(ns metabase.public-settings.premium-features-test
  (:require [cheshire.core :as json]
            [clj-http.fake :as http-fake]
            [clojure.test :refer :all]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [toucan.util.test :as tt]
            [metabase.config :as config]))

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
  (str "Hi " (name username) ", you're an OSS customer!"))

(defenterprise special-greeting
  "Returns a non-special greeting for OSS users, and EE users who don't have the :special-greeting feature token."
  metabase-enterprise.util-test
  [username]
  (str "Hi " (name username) ", you're not extra special :("))

(defenterprise special-greeting-or-error
  "Returns a non-special greeting for OSS users."
  metabase-enterprise.util-test
  [username]
  (str "Hi " (name username) ", you're not extra special :("))

(defenterprise special-greeting-or-custom
  "Returns a non-special greeting for OSS users."
  metabase-enterprise.util-test
  [username]
  (str "Hi " (name username) ", you're not extra special :("))

(def ^:private missing-feature-error-msg
  #"The special-greeting-or-error function requires a premium token with a valid special-greeting token")

(deftest defenterprise-oss-test
  (when-not config/ee-available?
    (testing "When EE code is not available, a call to a defenterprise function calls the OSS version"
      (is (= "Hi rasta, you're an OSS customer!"
             (greeting :rasta)))))

  (when config/ee-available?
    (testing "When EE code is available"
      (testing "a call to a defenterprise function calls the EE version"
        (is (= "Hi rasta, you're an EE customer!"
               (greeting :rasta))))

      (testing "if a token is required, it will check for it, and fall back to the OSS version by default"
        (with-premium-features #{:special-greeting}
          (is (= "Hi rasta, you're an extra special EE customer!"
                 (special-greeting :rasta))))

        (with-premium-features #{}
          (is (= "Hi rasta, you're not extra special :("
                 (special-greeting :rasta)))))

      (testing "when :fallback = :error, a generic exception is thrown when the required token is not present"
        (with-premium-features #{:special-greeting}
          (is (= "Hi rasta, you're an extra special EE customer!"
                 (special-greeting-or-error :rasta))))

        (with-premium-features #{}
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                missing-feature-error-msg
                                (special-greeting-or-error :rasta)))))

      (testing "when :fallback is a function, it is run when the required token is not present"
        (with-premium-features #{:special-greeting}
          (is (= "Hi rasta, you're an extra special EE customer!"
                 (special-greeting-or-custom :rasta))))

        (with-premium-features #{}
          (is (= "Hi rasta, you're an EE customer but not extra special."
                 (special-greeting-or-custom :rasta))))))))
