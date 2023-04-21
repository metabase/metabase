(ns metabase.query-processor-test.query-to-native-test
  "Tests around the `compile` function."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models.permissions :as perms]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.honeysql-extensions :as hx]))

(deftest compile-test
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
           (qp/compile (mt/mbql-query venues))))))

(deftest already-native-test
  (testing "If query is already native, `compile` should still do stuff like parsing parameters"
    (is (= {:query  "SELECT * FROM VENUES WHERE price = 3;"
            :params []}
           (binding [hx/*honey-sql-version* 2]
             (qp/compile
               {:database   (mt/id)
                :type       :native
                :native     {:query         "SELECT * FROM VENUES [[WHERE price = {{price}}]];"
                             :template-tags {"price" {:name "price", :display-name "Price", :type :number, :required false}}}
                :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value 3}]})))))
  (testing "If query is already native, `compile` should not execute the query (metabase#13572)"
    ;; 1000,000,000 rows, no way this will finish in 2 seconds if executed
    (let [long-query "SELECT CHECKINS.* FROM CHECKINS LEFT JOIN CHECKINS C2 ON 1=1 LEFT JOIN CHECKINS C3 ON 1=1"]
      (u/with-timeout 2000
        (is (= {:query long-query}
               (qp/compile
                {:database (mt/id)
                 :type     :native
                 :native   {:query long-query}})))))))

;; If user permissions are bound, we should do permissions checking when you call `compile`; you should need
;; native query execution permissions for the DB in question plus the perms needed for the original query in order to
;; use `compile`
(defn- compile-with-user-perms
  [{database-id :database, {source-table-id :source-table} :query, :as query} {:keys [object-perms? native-perms?]}]
  (binding [api/*current-user-id*              Integer/MAX_VALUE
            api/*current-user-permissions-set* (delay (cond-> #{}
                                                        object-perms? (conj (perms/data-perms-path database-id "PUBLIC" source-table-id))
                                                        native-perms? (conj (perms/adhoc-native-query-path database-id))))]
    (qp/compile query)))

(deftest permissions-test
  (testing "If user permissions are bound, we should still NOT do permissions checking when you call `compile`"
    (testing "Should work if you have the right perms"
      (is (compile-with-user-perms
           (mt/mbql-query venues)
           {:object-perms? true, :native-perms? true})))
    (testing "Should still work even WITHOUT the right perms"
      (is (compile-with-user-perms
           (mt/mbql-query venues)
           {:object-perms? false, :native-perms? true})))))

(deftest error-test
  (testing "If the query is bad in some way it should return a relevant error (?)"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Database \d+ does not exist"
         (compile-with-user-perms
          {:database Integer/MAX_VALUE, :type :query, :query {:source-table Integer/MAX_VALUE}}
          {:object-perms? true, :native-perms? true})))))
