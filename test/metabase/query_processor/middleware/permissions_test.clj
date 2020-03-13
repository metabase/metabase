(ns metabase.query-processor.middleware.permissions-test
  "Tests for the middleware that checks whether the current user has permissions to run a given query."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [table :refer [Table]]]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.middleware.permissions :refer [check-query-permissions]]
            [metabase.test.data :as data]
            [metabase.test.data.users :as users]
            [schema.core :as s]
            [toucan.util.test :as tt])
  (:import clojure.lang.ExceptionInfo))

(defn- check-perms [query]
  (:pre (mt/test-qp-middleware check-query-permissions query)))

(defn- do-with-rasta
  "Call `f` with Rasta as the current user."
  [f]
  (mt/with-test-user :rasta
    (f)))

(defn- check-perms-for-rasta
  "Check permissions for `query` with rasta as the current user."
  {:style/indent 0}
  [query]
  (do-with-rasta (fn [] (check-perms query))))

(def ^:private perms-error-msg #"^You do not have permissions to run this query\.")

(deftest native-query-perms-test
  (testing "Make sure the NATIVE query fails to run if current user doesn't have perms"
    (is (thrown-with-msg? ExceptionInfo perms-error-msg
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
    (is (thrown-with-msg? ExceptionInfo perms-error-msg
          (tt/with-temp* [Database [db]
                          Table    [table {:db_id (u/get-id db)}]]
            ;; All users get perms for all new DBs by default
            (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
            (check-perms-for-rasta
             {:database (u/get-id db)
              :type     :query
              :query    {:source-table (u/get-id table)}})))))

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
    (is (thrown-with-msg? ExceptionInfo perms-error-msg
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
    (is (thrown-with-msg? ExceptionInfo perms-error-msg
          (tt/with-temp* [Database [db]
                          Table    [table {:db_id (u/get-id db)}]]
            ;; All users get perms for all new DBs by default
            (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
            (check-perms-for-rasta
             {:database (u/get-id db)
              :type     :query
              :query    {:source-query {:source-table (u/get-id table)}}})))))

  (testing "...but it should work if user has perms [nested MBQL queries]"
    (tt/with-temp* [Database [db]
                    Table    [table {:db_id (u/get-id db)}]]
      (= {:database (u/get-id db)
          :type     :query
          :query    {:source-query {:source-table (u/get-id table)}}}
         (check-perms-for-rasta
          {:database (u/get-id db)
           :type     :query
           :query    {:source-query {:source-table (u/get-id table)}}})))))

(deftest template-tags-referenced-queries-test
  (testing "Fails for MBQL query referenced in template tag, when user has no perms to referenced query"
    (is (thrown-with-msg? ExceptionInfo perms-error-msg
          (tt/with-temp* [Database [db]
                          Table    [table-1 {:db_id (u/get-id db)}]
                          Table    [table-2 {:db_id (u/get-id db)}]
                          Card     [card    {:dataset_query {:database (u/get-id db), :type :query,
                                                             :query {:source-table (u/get-id table-2)}}}]]
            ;; All users get perms for all new DBs by default
            (perms/revoke-permissions! (perms-group/all-users) (u/get-id db) nil (u/get-id table-2))
            (let [card-id  (:id card)
                  tag-name (str "#" card-id)]
              (check-perms-for-rasta
               {:database (u/get-id db)
                :type     :native
                :native   {:query         (format "SELECT * FROM {{%s}} AS x" tag-name)
                           :template-tags {tag-name
                                           {:id tag-name, :name tag-name, :display-name tag-name,
                                            :type "card", :card card-id}}}}))))))

  (testing "...but it should work if user has perms [template tag referenced query]"
    (tt/with-temp* [Database [db]
                    Table    [table-1 {:db_id (u/get-id db)}]
                    Table    [table-2 {:db_id (u/get-id db)}]
                    Card     [card    {:dataset_query {:database (u/get-id db), :type :query,
                                                       :query {:source-table (u/get-id table-2)}}}]]
      (let [card-id   (:id card)
            tag-name  (str "#" card-id)
            query-sql (format "SELECT * FROM {{%s}} AS x" tag-name)]
        ;; query should be returned by middleware unchanged
        (is (= {:database (u/get-id db)
                :type :native
                :native {:query         query-sql,
                         :template-tags {tag-name {:id tag-name, :name tag-name, :display-name tag-name, :type "card",
                                                   :card card-id}}}}
               (check-perms-for-rasta
                {:database (u/get-id db)
                 :type     :native
                 :native   {:query         query-sql
                            :template-tags {tag-name
                                            {:id tag-name, :name tag-name, :display-name tag-name,
                                             :type "card", :card card-id}}}}))))))

  (testing "Fails for native query referenced in template tag, when user has no perms to referenced query"
    (is (thrown-with-msg? ExceptionInfo perms-error-msg
          (tt/with-temp* [Database [db]
                          Card     [card {:dataset_query
                                          {:database (u/get-id db), :type :native,
                                           :native {:query "SELECT 1 AS \"foo\", 2 AS \"bar\", 3 AS \"baz\""}}}]]
            ;; All users get perms for all new DBs by default
            (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
            (let [card-id  (:id card)
                  tag-name (str "#" card-id)]
              (check-perms-for-rasta
               {:database (u/get-id db)
                :type     :native
                :native   {:query         (format "SELECT * FROM {{%s}} AS x" tag-name)
                           :template-tags {tag-name
                                           {:id tag-name, :name tag-name, :display-name tag-name,
                                            :type "card", :card card-id}}}}))))))

  (testing "...but it should work if user has perms [template tag referenced query]"
    (tt/with-temp* [Database [db]
                    Card     [card {:dataset_query
                                    {:database (u/get-id db), :type :native,
                                     :native {:query "SELECT 1 AS \"foo\", 2 AS \"bar\", 3 AS \"baz\""}}}]]
      (let [card-id  (:id card)
            tag-name (str "#" card-id)
            query-sql (format "SELECT * FROM {{%s}} AS x" tag-name)]
        ;; query should be returned by middleware unchanged
        (is (= {:database (u/get-id db)
                :type     :native
                :native   {:query query-sql
                           :template-tags {tag-name {:id tag-name, :name tag-name, :display-name tag-name, :type "card",
                                                     :card card-id}}}}
               (check-perms-for-rasta
                {:database (u/get-id db)
                 :type     :native
                 :native   {:query         query-sql
                            :template-tags {tag-name
                                            {:id tag-name, :name tag-name, :display-name tag-name,
                                             :type "card", :card card-id}}}})))))))

(deftest end-to-end-test
  (testing (str "Make sure it works end-to-end: make sure bound `*current-user-id*` and `*current-user-permissions-set*` "
                "are used to permissions check queries")
    (binding [api/*current-user-id*              (users/user->id :rasta)
              api/*current-user-permissions-set* (delay #{})]
      (is (schema= {:status   (s/eq :failed)
                    :class    (s/eq clojure.lang.ExceptionInfo)
                    :error    (s/eq "You do not have permissions to run this query.")
                    :ex-data  {:required-permissions (s/eq #{(perms/table-query-path (data/id) "PUBLIC" (data/id :venues))})
                               :actual-permissions   (s/eq #{})
                               :permissions-error?   (s/eq true)
                               :type                 (s/eq error-type/missing-required-permissions)
                               s/Keyword             s/Any}
                    s/Keyword s/Any}
                   (qp/process-userland-query
                    {:database (data/id)
                     :type     :query
                     :query    {:source-table (data/id :venues)
                                :limit        1}}))))))
