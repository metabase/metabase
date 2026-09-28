(ns metabase.user-key-value.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.user-key-value.db :as user-key-value.db]))

(deftest namespace-and-key-are-values-test
  (testing "GHY-4586: namespace and key are compared as values, so SQL-looking ones match nothing else"
    (mt/with-model-cleanup [:model/UserKeyValue]
      (let [user-id (mt/user->id :rasta)
            sql     "x' OR '1'='1"]
        (user-key-value.db/insert-user-key-value! user-id "ns" "k" "v" nil)
        (is (= "v" (:value (user-key-value.db/user-key-value user-id "ns" "k"))))
        (is (= "v" (:value (user-key-value.db/unexpired-user-key-value user-id "ns" "k"))))
        (is (= ["k"] (map :key (user-key-value.db/unexpired-user-key-values user-id "ns"))))
        (is (nil? (user-key-value.db/user-key-value user-id "ns" sql)))
        (is (nil? (user-key-value.db/unexpired-user-key-value user-id sql "k")))
        (is (empty? (user-key-value.db/unexpired-user-key-values user-id sql)))
        (is (= 0 (user-key-value.db/update-user-key-value! user-id "ns" sql "changed" nil)))
        (is (= 0 (user-key-value.db/delete-user-key-value! user-id sql "k")))
        (is (= "v" (:value (user-key-value.db/user-key-value user-id "ns" "k"))))
        (is (= 1 (user-key-value.db/update-user-key-value! user-id "ns" "k" "changed" nil)))
        (is (= "changed" (:value (user-key-value.db/user-key-value user-id "ns" "k"))))
        (is (= 1 (user-key-value.db/delete-user-key-value! user-id "ns" "k")))
        (is (nil? (user-key-value.db/user-key-value user-id "ns" "k")))))))
