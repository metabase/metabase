(ns metabase.query-processor.middleware.catch-exceptions-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [schema.core :as s]))

(defn- catch-exceptions
  ([qp]
   (catch-exceptions qp {}))
  ([qp query]
   ((catch-exceptions/catch-exceptions qp)
    query
    identity
    identity
    nil)))

;; No Exception -- should return response as-is
(expect
  {}
  (catch-exceptions
   (fn [query respond _ _]
     (respond query))))

;; if the QP throws an Exception (synchronously), should format the response appropriately
(expect
  {:status     :failed
   :class      java.lang.Exception
   :error      "Something went wrong"
   :stacktrace true
   :query      {}}
  (-> (catch-exceptions
       (fn [& _]
         (throw (Exception. "Something went wrong"))))
      (update :stacktrace boolean)))

;; if an Exception is returned asynchronously by `raise`, should format it the same way
(expect
  {:status     :failed
   :class      java.lang.Exception
   :error      "Something went wrong"
   :stacktrace true
   :query      {}}
  (-> (catch-exceptions
       (fn [_ _ raise _]
         (raise (Exception. "Something went wrong"))))
      (update :stacktrace boolean)))

;; If someone doesn't have native query execution permissions, they shouldn't see the native version of the query in
;; the error response
(tu/expect-schema
  {:native       (s/eq nil)
   :preprocessed (s/pred map?)
   s/Any         s/Any}
  (data/with-temp-copy-of-db
    (perms/revoke-permissions! (group/all-users) (data/id))
    (perms/grant-permissions! (group/all-users) (data/id) "PUBLIC" (data/id :venues))
    (test-users/with-test-user :rasta
      (data/run-mbql-query venues {:fields [!month.id]}))))

;; They should see it if they have ad-hoc native query perms
(tu/expect-schema
  {:native
   (s/eq {:query  (str "SELECT parsedatetime(formatdatetime(\"PUBLIC\".\"VENUES\".\"ID\", 'yyyyMM'), 'yyyyMM') "
                       "AS \"ID\" FROM \"PUBLIC\".\"VENUES\" LIMIT 1048576")
          :params nil})
   :preprocessed (s/pred map?)
   s/Any         s/Any}
  (data/with-temp-copy-of-db
    (perms/revoke-permissions! (group/all-users) (data/id))
    (perms/grant-permissions! (group/all-users) (data/id) "PUBLIC" (data/id :venues))
    (perms/grant-native-readwrite-permissions! (group/all-users) (data/id))
    (test-users/with-test-user :rasta
      (data/run-mbql-query venues {:fields [!month.id]}))))
