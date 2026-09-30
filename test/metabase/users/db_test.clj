(ns metabase.users.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.users.db :as users.db]))

(set! *warn-on-reflection* true)

(deftest admin-or-self-visible-user-test
  (testing "GHY-4481: the id, type, and is-active? filters still match or reject the User"
    (mt/with-temp [:model/User {user-id :id} {:type :personal :is_active true}]
      (let [fetch (fn [& kvs] (:id (apply users.db/admin-or-self-visible-user [:id :type] user-id kvs)))]
        (is (= user-id (fetch)))
        (testing "a keyword type"
          (is (= user-id (fetch :type :personal)))
          (is (nil? (fetch :type :api-key))))
        (testing "a string type"
          (is (= user-id (fetch :type "personal")))
          (is (nil? (fetch :type "api-key"))))
        (testing "a SQL-looking string type matches nothing"
          (is (nil? (fetch :type "x' OR '1'='1"))))
        (testing "is-active?"
          (is (= user-id (fetch :is-active? true)))
          (is (nil? (fetch :is-active? false)))
          (is (= user-id (fetch :type :personal :is-active? true))))))))
