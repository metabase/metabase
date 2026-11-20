(ns metabase.users.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.users.write :as users.write]))

(deftest ^:parallel updated-user-name-test
  (testing "Test that `metabase.users.write/updated-user-name` works as intended."
    (let [names {:first_name "Test" :last_name "User"} ;; in a real user map, `:first_name` and `:last_name` will always be present
          nonames {:first_name nil :last_name nil}
          firstname {:first_name "Test" :last_name nil}
          lastname {:first_name nil :last_name "User"}]
      ;; starting with names
      (is (nil? (#'users.write/updated-user-name names {})))
      (is (nil? (#'users.write/updated-user-name names {:first_name "Test"})))
      (is (nil? (#'users.write/updated-user-name names {:last_name "User"})))
      (is (nil? (#'users.write/updated-user-name names {:first_name "Test" :last_name "User"})))
      (is (= {:first_name "T" :last_name "U"} (#'users.write/updated-user-name names {:first_name "T" :last_name "U"})))
      (is (= {:first_name "Test" :last_name "U"} (#'users.write/updated-user-name names {:last_name "U"})))
      (is (= {:first_name "T" :last_name "User"} (#'users.write/updated-user-name names {:first_name "T"})))
      ;; starting with 'nil' names
      (is (nil? (#'users.write/updated-user-name nonames {})))
      (is (nil? (#'users.write/updated-user-name nonames {:first_name nil})))
      (is (nil? (#'users.write/updated-user-name nonames {:last_name nil})))
      (is (nil? (#'users.write/updated-user-name nonames {:first_name nil :last_name nil})))
      (is (= {:first_name "T" :last_name "U"} (#'users.write/updated-user-name nonames {:first_name "T" :last_name "U"})))
      (is (= {:first_name nil :last_name "U"} (#'users.write/updated-user-name nonames {:last_name "U"})))
      (is (= {:first_name "T" :last_name nil} (#'users.write/updated-user-name nonames {:first_name "T"})))
      ;; starting with one name nil
      (is (nil? (#'users.write/updated-user-name firstname {:first_name "Test" :last_name nil})))
      (is (nil? (#'users.write/updated-user-name firstname {:first_name "Test"})))
      (is (nil? (#'users.write/updated-user-name lastname {:first_name nil :last_name "User"})))
      (is (nil? (#'users.write/updated-user-name lastname {:last_name "User"}))))))
