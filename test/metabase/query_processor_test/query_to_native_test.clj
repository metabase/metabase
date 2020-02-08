(ns metabase.query-processor-test.query-to-native-test
  "Tests around the `query->native` function."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.api.common :as api]
            [metabase.models.permissions :as perms]
            [metabase.query-processor.middleware.async-wait :as async-wait]
            [metabase.test.util :as tu]
            [schema.core :as s]))

(deftest query->native-test
  (testing "Can we convert an MBQL query to a native query?"
    (is (= {:query  (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\","
                         " \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\","
                         " \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\","
                         " \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\","
                         " \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\","
                         " \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                         "FROM \"PUBLIC\".\"VENUES\" "
                         "LIMIT 1048576")
            :params nil}
           (qp/query->native (mt/mbql-query venues))))))

(deftest already-native-test
  (testing "If query is already native, `query->native` should still do stuff like parsing parameters"
    (is (= {:query  "SELECT * FROM VENUES WHERE price = 3;"
            :params []}
           (qp/query->native
             {:database   (mt/id)
              :type       :native
              :native     {:query         "SELECT * FROM VENUES [[WHERE price = {{price}}]];"
                           :template-tags {"price" {:name "price", :display-name "Price", :type :number, :required false}}}
              :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value "3"}]})))))

(deftest no-async-wait-test
  (testing "`query->native` should not be subject to async waiting")
  (is (= :ok
         (tu/throw-if-called async-wait/run-in-thread-pool
           (qp/query->native (mt/mbql-query venues))
           :ok))))


;; If user permissions are bound, we should do permissions checking when you call `query->native`; you should need
;; native query execution permissions for the DB in question plus the perms needed for the original query in order to
;; use `query->native`
(defn- query->native-with-user-perms
  [{database-id :database, {source-table-id :source-table} :query, :as query} {:keys [object-perms? native-perms?]}]
  (try
    (binding [api/*current-user-id*              Integer/MAX_VALUE
              api/*current-user-permissions-set* (delay (cond-> #{}
                                                          object-perms? (conj (perms/object-path database-id "PUBLIC" source-table-id))
                                                          native-perms? (conj (perms/adhoc-native-query-path database-id))))]
      (qp/query->native query))
    (catch clojure.lang.ExceptionInfo e
      (merge {:error (.getMessage e)}
             (ex-data e)))))

(deftest permissions-test
  (testing "If user permissions are bound, we should do permissions checking when you call `query->native`"
    (testing "Should work if you have the right perms"
      (is (= true
             (boolean
              (query->native-with-user-perms
               (mt/mbql-query venues)
               {:object-perms? true, :native-perms? true})))))
    (testing "If you don't have MBQL permissions for the original query it should throw an error"
      (is (schema= {:error (s/eq "You do not have permissions to run this query.")
                    s/Any  s/Any}
                   (query->native-with-user-perms
                    (mt/mbql-query venues)
                    {:object-perms? false, :native-perms? true}))))
    (testing "If you don't have have native query execution permissions for the DB it should throw an error"
      (is (= {:error                "You do not have permissions to run this query."
              :required-permissions (perms/adhoc-native-query-path (mt/id))
              :actual-permissions   #{(perms/object-path (mt/id) "PUBLIC" (mt/id :venues))}
              :permissions-error?   true
              :type                 :missing-required-permissions}
             (query->native-with-user-perms
              (mt/mbql-query venues)
              {:object-perms? true, :native-perms? false}))))))

(deftest error-test
  (testing "If the query is bad in some way it should return a relevant error (?)"
    (is (schema= {:error (s/eq (format "Database %d does not exist." Integer/MAX_VALUE))
                  s/Any  s/Any}
                 (query->native-with-user-perms
                  {:database Integer/MAX_VALUE, :type :query, :query {:source-table Integer/MAX_VALUE}}
                  {:object-perms? true, :native-perms? true})))))
