(ns metabase.driver.connection.workspaces-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.connection.workspaces :as driver.w]))

(deftest ^:parallel maybe-swap-details-test
  (testing "maybe-swap-details merges swap map into details"
    (driver.w/with-swapped-connection-details 1 {:user "swap-user" :password "swap-pass"}
      (is (= {:host "localhost" :user "swap-user" :password "swap-pass"}
             (driver.w/maybe-swap-details 1 {:host "localhost" :user "original-user" :password "original-pass"})))))

  (testing "maybe-swap-details returns details unchanged when no swap exists"
    (driver.w/with-swapped-connection-details 1 {:user "swap-user"}
      (is (= {:host "localhost" :user "original-user"}
             (driver.w/maybe-swap-details 2 {:host "localhost" :user "original-user"})))))

  (testing "maybe-swap-details supports deep merge for nested maps"
    (driver.w/with-swapped-connection-details 1 {:ssl {:key-store-password "new-pass"}}
      (is (= {:host "localhost" :ssl {:enabled true :key-store-password "new-pass"}}
             (driver.w/maybe-swap-details 1 {:host "localhost" :ssl {:enabled true :key-store-password "old-pass"}})))))

  (testing "deep merge adds new keys to nested maps"
    (driver.w/with-swapped-connection-details 1 {:ssl {:new-key "new-value"}}
      (is (= {:host "localhost" :ssl {:enabled true :new-key "new-value"}}
             (driver.w/maybe-swap-details 1 {:host "localhost" :ssl {:enabled true}})))))

  (testing "deep merge replaces nested map with non-map value"
    (driver.w/with-swapped-connection-details 1 {:ssl "disabled"}
      (is (= {:host "localhost" :ssl "disabled"}
             (driver.w/maybe-swap-details 1 {:host "localhost" :ssl {:enabled true :key-store "path"}})))))

  (testing "deep merge adds nested map where none existed"
    (driver.w/with-swapped-connection-details 1 {:ssl {:enabled true}}
      (is (= {:host "localhost" :ssl {:enabled true}}
             (driver.w/maybe-swap-details 1 {:host "localhost"})))))

  (testing "deep merge works with multiple levels of nesting"
    (driver.w/with-swapped-connection-details 1 {:advanced {:ssl {:cert {:path "/new/path"}}}}
      (is (= {:host "localhost" :advanced {:timeout 30 :ssl {:enabled true :cert {:path "/new/path"}}}}
             (driver.w/maybe-swap-details 1 {:host "localhost" :advanced {:timeout 30 :ssl {:enabled true :cert {:path "/old/path"}}}})))))

  (testing "nested swaps for the same database throw an exception"
    (driver.w/with-swapped-connection-details 1 {:user "outer"}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Nested connection detail swaps are not supported"
           (driver.w/with-swapped-connection-details 1 {:user "inner"}
             nil))))))
