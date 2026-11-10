(ns metabase.api-scope.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api-scope.core :as api-scope]))

(deftest ^:parallel jwt-claim-scopes-test
  (doseq [[claims expected] [[{} nil]
                             [{:scope nil} #{}]
                             [{:scope ""} #{}]
                             [{:scope "   "} #{}]
                             [{:scope ["agent:search"]} #{}]
                             [{:scope 42} #{}]
                             [{:scope " agent:search  agent:query agent:search "} #{"agent:search" "agent:query"}]
                             [{:scope "agent:*"} #{"agent:*"}]]]
    (testing (pr-str claims)
      (is (= expected (api-scope/jwt-claim-scopes claims))))))
