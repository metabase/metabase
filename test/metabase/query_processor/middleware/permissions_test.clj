(ns metabase.query-processor.middleware.permissions-test
  "Tests for the middleware that checks whether the current user has permissions to run a given query."
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card Collection Database Table]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as perms-group]]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.middleware.permissions :refer [check-query-permissions]]
            [schema.core :as s])
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
    (mt/with-temp Database [db]
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
          (mt/with-temp* [Database [db]
                          Table    [table {:db_id (u/get-id db)}]]
            ;; All users get perms for all new DBs by default
            (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
            (check-perms-for-rasta
             {:database (u/get-id db)
              :type     :query
              :query    {:source-table (u/get-id table)}})))))

  (testing "...but it should work if user has perms [MBQL]"
    (mt/with-temp* [Database [db]
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
    (mt/with-temp Database [db]
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
          (mt/with-temp* [Database [db]
                          Table    [table {:db_id (u/get-id db)}]]
            ;; All users get perms for all new DBs by default
            (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
            (check-perms-for-rasta
             {:database (u/get-id db)
              :type     :query
              :query    {:source-query {:source-table (u/get-id table)}}})))))

  (testing "...but it should work if user has perms [nested MBQL queries]"
    (mt/with-temp* [Database [db]
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
          (mt/with-temp* [Database [db]
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
    (mt/with-temp* [Database [db]
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
          (mt/with-temp* [Database [db]
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
    (mt/with-temp* [Database [db]
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
    (binding [api/*current-user-id*              (mt/user->id :rasta)
              api/*current-user-permissions-set* (delay #{})]
      (is (schema= {:status   (s/eq :failed)
                    :class    (s/eq clojure.lang.ExceptionInfo)
                    :error    (s/eq "You do not have permissions to run this query.")
                    :ex-data  {:required-permissions (s/eq #{(perms/table-query-path (mt/id) "PUBLIC" (mt/id :venues))})
                               :actual-permissions   (s/eq #{})
                               :permissions-error?   (s/eq true)
                               :type                 (s/eq error-type/missing-required-permissions)
                               s/Keyword             s/Any}
                    s/Keyword s/Any}
                   (mt/suppress-output
                     (qp/process-userland-query
                      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id :venues)
                                  :limit        1}})))))))

(deftest e2e-nested-source-card-test
  (testing "Make sure permissions are calculated for Card -> Card -> Source Query (#12354)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (perms/revoke-permissions! (perms-group/all-users) (mt/id))
        (mt/with-temp Collection [collection]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (doseq [[card-1-query-type card-1-query] {"MBQL"   (mt/mbql-query venues
                                                               {:order-by [[:asc $id]], :limit 2})
                                                    "native" (mt/native-query
                                                               {:query (str "SELECT id, name, category_id, latitude, longitude, price "
                                                                            "FROM venues "
                                                                            "ORDER BY id ASC "
                                                                            "LIMIT 2")})}]
            (testing (format "\nCard 1 is a %s query" card-1-query-type)
              (mt/with-temp Card [{card-1-id :id, :as card-1} {:collection_id (u/get-id collection)
                                                               :dataset_query card-1-query}]
                (doseq [[card-2-query-type card-2-query] {"MBQL"   (mt/mbql-query nil
                                                                     {:source-table (format "card__%d" card-1-id)})
                                                          "native" (mt/native-query
                                                                     {:query         "SELECT * FROM {{card}}"
                                                                      :template-tags {"card" {:name         "card"
                                                                                              :display-name "card"
                                                                                              :type         :card
                                                                                              :card-id      card-1-id}}})}]
                  (testing (format "\nCard 2 is a %s query" card-2-query-type)
                    (mt/with-temp Card [card-2 {:collection_id (u/get-id collection)
                                                :dataset_query card-2-query}]
                      (testing "\nshould be able to read nested-nested Card if we have Collection permissions\n"
                        (mt/with-test-user :rasta
                          (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                          [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                            (testing "Should be able to run Card 1 directly"
                              (is (= expected
                                     (mt/rows
                                       (qp/process-userland-query (assoc (:dataset_query card-1)
                                                                         :info {:executed-by (mt/user->id :rasta)
                                                                                :card-id     card-1-id}))))))

                            (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                              (is (= expected
                                     (mt/rows
                                       (qp/process-userland-query (assoc (:dataset_query card-2)
                                                                         :info {:executed-by (mt/user->id :rasta)
                                                                                :card-id     (u/get-id card-2)}))))))

                            (testing "Should be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card -> Source Query]"
                              (is (= expected
                                     (mt/rows
                                       (qp/process-userland-query (assoc (mt/mbql-query nil
                                                                           {:source-table (format "card__%d" card-1-id)})
                                                                         :info {:executed-by (mt/user->id :rasta)}))))))

                            (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card -> Card -> Source Query]"
                              (is (= expected
                                     (mt/rows
                                       (qp/process-userland-query (assoc (mt/mbql-query nil
                                                                           {:source-table (format "card__%d" (u/get-id card-2))})
                                                                         :info {:executed-by (mt/user->id :rasta)}))))))))))))))))))))

(deftest e2e-ignore-user-supplied-card-ids-test
  (testing "You shouldn't be able to bypass security restrictions by passing `[:info :card-id]` in the query."
    (mt/with-temp-copy-of-db
      (perms/revoke-permissions! (perms-group/all-users) (mt/id))
      (mt/with-temp* [Collection [collection]
                      Card       [card {:collection_id (u/get-id collection)
                                        :dataset_query (mt/mbql-query venues {:fields [$id], :order-by [[:asc $id]], :limit 2})}]]
        ;; Since the collection derives from the root collection this grant shouldn't really be needed, but better to
        ;; be extra-sure in this case that the user is getting rejected for data perms and not card/collection perms
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (is (= "You don't have permissions to do that."
               ((mt/user->client :rasta) :post "dataset" (assoc (mt/mbql-query venues {:limit 1})
                                                                :info {:card-id (u/get-id card)}))))))))
