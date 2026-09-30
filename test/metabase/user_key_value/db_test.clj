(ns metabase.user-key-value.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.user-key-value.db :as user-key-value.db]
   [metabase.util.malli :as mu]))

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

(deftest namespace-and-key-are-bound-without-the-schema-test
  (testing "GHY-4586: with the schema off, the marker rejects an operator-shaped namespace or key instead of compiling it into the WHERE"
    ;; Unmarked, `:namespace [:not= "zzz"]` is a Toucan kv-arg condition that compiles to `namespace <> 'zzz'`,
    ;; so delete-user-key-value! would delete every key for the user whose namespace differs.
    (let [user-id (mt/user->id :rasta)
          op      [:not= "zzz"]]
      (mu/disable-enforcement
        (doseq [[desc thunk] {"user-key-value ns"            #(user-key-value.db/user-key-value user-id op "k")
                              "user-key-value key"           #(user-key-value.db/user-key-value user-id "ns" op)
                              "update! ns"                   #(user-key-value.db/update-user-key-value! user-id op "k" "v" nil)
                              "update! key"                  #(user-key-value.db/update-user-key-value! user-id "ns" op "v" nil)
                              "delete! ns"                   #(user-key-value.db/delete-user-key-value! user-id op "k")
                              "delete! key"                  #(user-key-value.db/delete-user-key-value! user-id "ns" op)
                              "unexpired-user-key-value ns"  #(user-key-value.db/unexpired-user-key-value user-id op "k")
                              "unexpired-user-key-value key" #(user-key-value.db/unexpired-user-key-value user-id "ns" op)
                              "unexpired-user-key-values ns" #(doall (user-key-value.db/unexpired-user-key-values user-id op))}]
          (testing desc
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked a whole operator form"
                                  (thunk)))))))))
