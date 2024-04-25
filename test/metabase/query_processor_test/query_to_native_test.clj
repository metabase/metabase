(ns metabase.query-processor-test.query-to-native-test
  "Tests around the `compile` function."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest ^:parallel compile-test
  (testing "Can we convert an MBQL query to a native query?"
    (is (= {:query  (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\","
                         " \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\","
                         " \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\","
                         " \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\","
                         " \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\","
                         " \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                         "FROM \"PUBLIC\".\"VENUES\" "
                         "LIMIT 1048575")
            :params nil}
           (qp.compile/compile (mt/mbql-query venues))))))

(deftest ^:parallel already-native-test
  (testing "If query is already native, `compile` should still do stuff like parsing parameters"
    (is (= {:query  "SELECT * FROM VENUES WHERE price = 3;"
            :params []}
           (qp.compile/compile
            {:database   (mt/id)
             :type       :native
             :native     {:query         "SELECT * FROM VENUES [[WHERE price = {{price}}]];"
                          :template-tags {"price" {:name "price", :display-name "Price", :type :number, :required false}}}
             :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value 3}]}))))
  (testing "If query is already native, `compile` should not execute the query (metabase#13572)"
    ;; 1000,000,000 rows, no way this will finish in 2 seconds if executed
    (let [long-query "SELECT CHECKINS.* FROM CHECKINS LEFT JOIN CHECKINS C2 ON 1=1 LEFT JOIN CHECKINS C3 ON 1=1"]
      (u/with-timeout 2000
        (is (= {:query long-query}
               (qp.compile/compile
                {:database (mt/id)
                 :type     :native
                 :native   {:query long-query}})))))))

(deftest permissions-test
  (testing "If user permissions are bound, we should still NOT do permissions checking when you call `compile`"
    (mt/with-test-user :rasta
      (testing "Should work if you have the right perms"
        (mt/with-full-data-perms-for-all-users!
          (is (qp.compile/compile (mt/mbql-query venues)))))
      (testing "Should still work even WITHOUT the right perms"
        (mt/with-no-data-perms-for-all-users!
          (is (qp.compile/compile (mt/mbql-query venues))))))))

(deftest ^:parallel error-test
  (testing "If the query is bad in some way it should return a relevant error (?)"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QValid Database metadata\E"
         (qp.compile/compile {:database Integer/MAX_VALUE, :type :query, :query {:source-table Integer/MAX_VALUE}})))))
