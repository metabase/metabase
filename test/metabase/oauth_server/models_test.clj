(ns metabase.oauth-server.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.oauth-server.models.oauth-access-token :as oauth-access-token]
   [metabase.oauth-server.models.oauth-authorization-code :as oauth-authorization-code]
   [metabase.oauth-server.models.oauth-refresh-token :as oauth-refresh-token]
   [metabase.test :as mt]))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/User {user-1 :id} {}
                 :model/User {user-2 :id} {}
                 :model/User {user-3 :id} {}
                 :model/User {user-4 :id} {}
                 :model/User {user-5 :id} {}
                 :model/User {user-6 :id} {}]
    (let [user-ids [user-1 user-2 user-3 user-4 user-5 user-6]]
      (doseq [write! [oauth-access-token/revoke-oauth-access-tokens-for-users!
                      oauth-refresh-token/revoke-oauth-refresh-tokens-for-users!
                      oauth-authorization-code/delete-oauth-authorization-codes-for-users!]]
        (testing (str write!)
          (let [counted (fn [n] (events.tu/statement-count! #(write! (vec (take n user-ids)))))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))))))
