(ns metabase.query-processor-test.query-to-native-test
  "Tests around the `query->native` function."
  (:require [expectations :refer [expect]]
            [metabase.api.common :as api]
            [metabase.models.permissions :as perms]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.async-wait :as async-wait]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [schema.core :as s]))

;; Can we convert an MBQL query to a native query?
(expect
  {:query (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\","
               " \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\","
               " \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\","
               " \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\","
               " \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\","
               " \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
               "FROM \"PUBLIC\".\"VENUES\" "
               "LIMIT 1048576")
   :params nil}
  (qp/query->native (data/mbql-query venues)))

;; If query is already native, `query->native` should still do stuff like parsing parameters
(expect
  {:query  "SELECT * FROM VENUES WHERE price = 3;"
   :params []}
  (qp/query->native
    {:database   (data/id)
     :type       :native
     :native     {:query         "SELECT * FROM VENUES [[WHERE price = {{price}}]];"
                  :template-tags {"price" {:name "price", :display-name "Price", :type :number, :required false}}}
     :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value "3"}]}))

;; `query->native` should not be subject to async waiting
(expect
  (tu/throw-if-called async-wait/run-in-thread-pool
    (qp/query->native (data/mbql-query venues))))


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
      (ex-data e))))

(expect
  (query->native-with-user-perms
   (data/mbql-query venues)
   {:object-perms? true, :native-perms? true}))

;; If you don't have MBQL permissions for the original query it should throw an error
(tu/expect-schema
  {:status (s/eq :failed)
   :error  (s/eq "You do not have permissions to run this query.")
   s/Any   s/Any}
  (query->native-with-user-perms
   (data/mbql-query venues)
   {:object-perms? false, :native-perms? true}))

;; If you don't have have native query execution permissions for the DB it should throw an error
;;
;; query->native throws an Exception that doesn't get wrapped the normal way; it *does* include a message, but our
;; helper function doesn't show it
(expect
  {:required-permissions (perms/adhoc-native-query-path (data/id))
   :actual-permissions   #{(perms/object-path (data/id) "PUBLIC" (data/id :venues))}
   :permissions-error?   true}
  (query->native-with-user-perms
   (data/mbql-query venues)
   {:object-perms? true, :native-perms? false}))

;; If the query is bad in some way it should return a relevant error (?)
(tu/expect-schema
  {:status (s/eq :failed)
   :error  (s/eq (format "Database %d does not exist." Integer/MAX_VALUE))
   s/Any   s/Any}
  (query->native-with-user-perms
   {:database Integer/MAX_VALUE, :type :query, :query {:source-table Integer/MAX_VALUE}}
   {:object-perms? true, :native-perms? true}))
