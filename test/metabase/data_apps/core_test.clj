(ns metabase.data-apps.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.data-apps.core :as data-apps]))

(set! *warn-on-reflection* true)

(deftest ^:parallel data-app-request?-test
  (testing "a request marked by the data-app scope middleware is a data app's"
    (is (data-apps/data-app-request? {:data-app-scoped? true})))
  (testing "a request whose token scopes grant the data-app scope short of full access is a data app's"
    (doseq [scopes [#{"data-apps:base"} #{"data-apps:*"}]]
      (is (data-apps/data-app-request? {:token-scopes scopes}) (pr-str scopes))))
  (testing "a full-access request, or one whose token scopes don't grant the data-app scope, isn't"
    (doseq [scopes [nil #{:metabase.api.macros.scope/unrestricted} #{"*"} #{"agent:search"}]]
      (is (not (data-apps/data-app-request? {:token-scopes scopes})) (pr-str scopes)))))
