(ns metabase.public-settings.premium-features-test
  (:require [cheshire.core :as json]
            [clj-http.fake :as http-fake]
            [clojure.test :refer :all]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
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
