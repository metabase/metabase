(ns metabase.query-processor.middleware.permissions-test
  "Tests for the middleware that checks whether the current user has permissions to run a given query."
  (:require [expectations :refer :all]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [database :refer [Database]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [table :refer [Table]]]
            [metabase.query-processor.middleware.permissions :refer [check-query-permissions]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as users]
            [schema.core :as s]
            [toucan.util.test :as tt]))

(def ^:private ^{:arglists '([query]), :style/indent 0} check-perms (check-query-permissions identity))

(defn- do-with-rasta
  "Call `f` with Rasta as the current user."
  [f]
  (users/do-with-test-user :rasta f))

(defn- check-perms-for-rasta
  "Check permissions for `query` with rasta as the current user."
  {:style/indent 0}
  [query]
  (do-with-rasta (fn [] (check-perms query))))


;;; ------------------------------------------------- Native Queries -------------------------------------------------

;; Make sure the NATIVE query fails to run if current user doesn't have perms
(expect
  Exception
  (check-perms-for-rasta
    {:database 1000
     :type     :native
     :native   {:query "SELECT * FROM VENUES"}}))

;; ...but it should work if user has perms
(tt/expect-with-temp [Database [db]]
  ;; query should be returned by middleware unchanged
  {:database (u/get-id db)
   :type     :native
   :native   {:query "SELECT * FROM VENUES"}}
  (check-perms-for-rasta
    {:database (u/get-id db)
     :type     :native
     :native   {:query "SELECT * FROM VENUES"}}))


;;; -------------------------------------------------- MBQL Queries --------------------------------------------------

(expect
  Exception
  (tt/with-temp* [Database [db]
                  Table    [table {:db_id (u/get-id db)}]]
    (perms/revoke-permissions! (perms-group/all-users) (u/get-id db)) ; All users get perms for all new DBs by default
    (check-perms-for-rasta
      {:database (u/get-id db)
       :type     :query
       :query    {:source-table {:name "Toucans", :id (u/get-id table)}}})))

(tt/expect-with-temp [Database [db]
                      Table    [table {:db_id (u/get-id db)}]]
  ;; query should be returned by middleware unchanged
  {:database (u/get-id db)
   :type     :query
   :query    {:source-table (u/get-id table)}}
  (check-perms-for-rasta
    {:database (u/get-id db)
     :type     :query
     :query    {:source-table (u/get-id table)}}))


;;; --------------------------------------------- Nested Native Queries ----------------------------------------------

(expect
  Exception
  (check-perms-for-rasta
    {:database 1000
     :type     :query
     :query   {:source-query {:native "SELECT * FROM VENUES"}}}))

;; ...but it should work if user has perms
(tt/expect-with-temp [Database [db]]
  {:database (u/get-id db)
   :type     :query
   :query    {:source-query {:native "SELECT * FROM VENUES"}}}
  (check-perms-for-rasta
    {:database (u/get-id db)
     :type     :query
     :query   {:source-query {:native "SELECT * FROM VENUES"}}}))


;;; ---------------------------------------------- Nested MBQL Queries -----------------------------------------------

;; For nested queries MBQL make sure perms are checked
(expect
  Exception
  (tt/with-temp* [Database [db]
                  Table    [table {:db_id (u/get-id db)}]]
    (perms/revoke-permissions! (perms-group/all-users) (u/get-id db)) ; All users get perms for all new DBs by default
    (check-perms-for-rasta
      {:database (u/get-id db)
       :type     :query
       :query    {:source-query {:source-table {:name "Toucans", :id (u/get-id table)}}}})))

(tt/expect-with-temp [Database [db]
                      Table    [table {:db_id (u/get-id db)}]]
  {:database (u/get-id db)
   :type     :query
   :query    {:source-query {:source-table (u/get-id table)}}}
  (check-perms-for-rasta
    {:database (u/get-id db)
     :type     :query
     :query    {:source-query {:source-table (u/get-id table)}}}))


;; Make sure it works end-to-end: make sure bound `*current-user-id*` and `*current-user-permissions-set*` are used to
;; permissions check queries
(tu/expect-schema
  {:status   (s/eq :failed)
   :class    (s/eq clojure.lang.ExceptionInfo)
   :error    (s/eq "You do not have permissions to run this query.")
   :ex-data  (s/eq {:required-permissions #{(perms/table-query-path (data/id) "PUBLIC" (data/id :venues))}
                    :actual-permissions   #{}
                    :permissions-error?   true})
   s/Keyword s/Any}
  (binding [api/*current-user-id*              (users/user->id :rasta)
            api/*current-user-permissions-set* (delay #{})]
   (qp/process-query
     {:database (data/id)
      :type     :query
      :query    {:source-table (data/id :venues)
                 :limit        1}})))
