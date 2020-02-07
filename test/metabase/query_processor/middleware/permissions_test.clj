(ns metabase.query-processor.middleware.permissions-test
  "Tests for the middleware that checks whether the current user has permissions to run a given query."
  (:require [clojure.test :refer :all]
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
  (users/with-test-user :rasta
    (f)))

(defn- check-perms-for-rasta
  "Check permissions for `query` with rasta as the current user."
  {:style/indent 0}
  [query]
  (do-with-rasta (fn [] (check-perms query))))

(deftest native-query-perms-test
  (testing "Make sure the NATIVE query fails to run if current user doesn't have perms"
    (is (thrown?  Exception
                 (check-perms-for-rasta
                  {:database 1000
                   :type     :native
                   :native   {:query "SELECT * FROM VENUES"}}))))

  (testing "...but it should work if user has perms"
    (tt/with-temp Database [db]
      ;; query should be returned by middleware unchanged
      (is (= {:database (u/get-id db)
              :type     :native
              :native   {:query "SELECT * FROM VENUES"}}
             (check-perms-for-rasta
              {:database (u/get-id db)
               :type     :native
               :native   {:query "SELECT * FROM VENUES"}}))))))

(deftest mbql-query-perms-test
  (testing "Make sure the MBQL query fails to run if current user doesn't have perms"
    (is (thrown? Exception
                 (tt/with-temp* [Database [db]
                                 Table    [table {:db_id (u/get-id db)}]]
                   ;; All users get perms for all new DBs by default
                   (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
                   (check-perms-for-rasta
                    {:database (u/get-id db)
                     :type     :query
                     :query    {:source-table {:name "Toucans", :id (u/get-id table)}}})))))

  (testing "...but it should work if user has perms [MBQL]"
    (tt/with-temp* [Database [db]
                    Table    [table {:db_id (u/get-id db)}]]
      ;; query should be returned by middleware unchanged
      (= {:database (u/get-id db)
          :type     :query
          :query    {:source-table (u/get-id table)}}
         (check-perms-for-rasta
          {:database (u/get-id db)
           :type     :query
           :query    {:source-table (u/get-id table)}})))))

(deftest nested-native-query-test
  (testing "Make sure nested native query fails to run if current user doesn't have perms"
    (is (thrown? Exception
                 (check-perms-for-rasta
                  {:database 1000
                   :type     :query
                   :query   {:source-query {:native "SELECT * FROM VENUES"}}}))))

  (testing "...but it should work if user has perms [nested native queries]"
    (tt/with-temp Database [db]
      ;; query should be returned by middleware unchanged
      (= {:database (u/get-id db)
          :type     :query
          :query    {:source-query {:native "SELECT * FROM VENUES"}}}
         (check-perms-for-rasta
          {:database (u/get-id db)
           :type     :query
           :query   {:source-query {:native "SELECT * FROM VENUES"}}})))))

(deftest nested-mbql-query-test
  (testing "Make sure nested MBQL query fails to run if current user doesn't have perms"
    (is (thrown? Exception
                 (tt/with-temp* [Database [db]
                                 Table    [table {:db_id (u/get-id db)}]]
                   ;; All users get perms for all new DBs by default
                   (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
                   (check-perms-for-rasta
                    {:database (u/get-id db)
                     :type     :query
                     :query    {:source-query {:source-table {:name "Toucans", :id (u/get-id table)}}}})))))

  (testing "...but it should work if user has perms [nested MBQL queries]"
    (tt/with-temp* [Database [db]
                    Table    [table {:db_id (u/get-id db)}]]
      (= {:database (u/get-id db)
          :type     :query
          :query    {:source-query {:source-table (u/get-id table)}}}
         (check-perms-for-rasta
          {:database (u/get-id db)
           :type     :query
           :query    {:source-query {:source-table (u/get-id table)}}}))))

  ;; Make sure it works end-to-end:
  (testing "make sure `*current-user-id*` and `*current-user-permissions-set*` are used to check query permissions"
    (is (schema=
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
                        :limit        1}}))))))
