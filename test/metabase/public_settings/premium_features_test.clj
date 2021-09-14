(ns metabase.public-settings.premium-features-test
  (:require [cheshire.core :as json]
            [clj-http.fake :as http-fake]
            [clojure.test :refer :all]
            [metabase.models.user :refer [User]]
            [metabase.public-settings.premium-features :as premium-features]
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
      :query-params {:users (str (#'premium-features/active-user-count))}}
     (constantly premium-features-response)}
    (#'premium-features/fetch-token-status* token)))

(def ^:private token-response-fixture
  (json/encode {:valid    true
                :status   "fake"
                :features ["test" "fixture"]
                :trial    false}))

(deftest fetch-token-status-test
  (tt/with-temp User [user {:email "admin@example.com"}]
    (let [token "fa3ebfa3ebfa3ebfa3ebfa3ebfa3ebfa3ebfa3ebfa3ebfa3ebfa3ebfa3ebfa3e"]
      (testing "With the backend unavailable"
        (let [result (token-status-response token {:status 500})]
          (is (false? (:valid result)))))

      (testing "With a valid token"
        (let [result (token-status-response token {:status 200
                                                   :body   token-response-fixture})]
          (is (:valid result))
          (is (contains? (set (:features result)) "test")))))))
