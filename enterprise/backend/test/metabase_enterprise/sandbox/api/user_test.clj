(ns metabase-enterprise.sandbox.api.user-test
  "Tests that would logically be included in `metabase.api.user-test` but are separate as they are enterprise only."
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;; Non-segmented users are allowed to ask for a list of all of the users in the Metabase instance. Pulse email lists
;; are an example usage of this. Segmented users should not have that ability. Instead they should only see
;; themselves. This test checks that GET /api/user for a segmented user only returns themselves
(deftest segmented-user-list-test
  (testing "GET /api/user"
    (mt/with-gtaps {:gtaps {:venues {}}}
      ;; Now do the request
      (is (= [{:common_name "Rasta Toucan"
               :last_name   "Toucan"
               :first_name  "Rasta"
               :email       "rasta@metabase.com"
               :id          true}]
             (tu/boolean-ids-and-timestamps ((mt/user-http-request :rasta :get 200 "user") :data)))))))
