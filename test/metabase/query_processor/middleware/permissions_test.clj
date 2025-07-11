(ns metabase.query-processor.middleware.permissions-test
  "Tests for the middleware that checks whether the current user has permissions to run a given query."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.fn :as mu.fn])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- check-perms [query]
  (let [qp (fn [query _rff]
             (qp.pipeline/*result* query))
        qp (qp.perms/check-query-permissions qp)]
    (qp.setup/with-qp-setup [query query]
      (qp query (constantly conj)))))

(defn- check-perms-for-rasta
  "Check permissions for `query` with rasta as the current user."
  [query]
  (mt/with-test-user :rasta (check-perms query)))

(def ^:private perms-error-msg #"You do not have permissions to run this query\.")

(deftest native-query-perms-test
  (testing "Make sure the NATIVE query fails to run if current user doesn't have perms"
    (mt/with-temp [:model/Database db {}]
      (perms/set-database-permission! (perms/all-users-group) (u/the-id db) :perms/create-queries :query-builder)
      (is (thrown-with-msg?
           ExceptionInfo
           perms-error-msg
           (check-perms-for-rasta
            {:database (u/the-id db)
             :type     :native
             :native   {:query "SELECT * FROM VENUES"}}))))))

(deftest native-query-perms-test-2
  (testing "...but it should work if user has perms"
    (mt/with-temp [:model/Database db]
      ;; query should be returned by middleware unchanged
      (is (= {:database (u/the-id db)
              :type     :native
              :native   {:query "SELECT * FROM VENUES"}}
             (check-perms-for-rasta
              {:database (u/the-id db)
               :type     :native
               :native   {:query "SELECT * FROM VENUES"}}))))))

(deftest mbql-query-perms-test
  (testing "Make sure the MBQL query fails to run if current user doesn't have perms"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db)}]
      ;; All users get perms for all new DBs by default
      (mt/with-no-data-perms-for-all-users!
        (is (thrown-with-msg?
             ExceptionInfo
             perms-error-msg
             (check-perms-for-rasta
              {:database (u/the-id db)
               :type     :query
               :query    {:source-table (u/the-id table)}})))))))

(deftest mbql-query-perms-test-2
  (testing "...but it should work if user has perms [MBQL]"
    (mt/with-temp [:model/Database db {}
                   :model/Table    table {:db_id (u/the-id db)}]
      ;; query should be returned by middleware unchanged
      (is (= {:database (u/the-id db)
              :type     :query
              :query    {:source-table (u/the-id table)}}
             (check-perms-for-rasta
              {:database (u/the-id db)
               :type     :query
               :query    {:source-table (u/the-id table)}}))))))

(deftest nested-native-query-test
  (testing "Make sure nested native query fails to run if current user doesn't have perms"
    (mt/with-temp [:model/Database db {}]
      (perms/set-database-permission! (perms/all-users-group)
                                      (u/the-id db)
                                      :perms/create-queries
                                      :query-builder)
      (is (thrown-with-msg?
           ExceptionInfo
           perms-error-msg
           (check-perms-for-rasta
            {:database (u/the-id db)
             :type     :query
             :query   {:source-query {:native "SELECT * FROM VENUES"}}}))))))

(deftest nested-native-query-test-2
  (testing "...but it should work if user has perms [nested native queries]"
    (mt/with-temp [:model/Database db]
      ;; query should be returned by middleware unchanged
      (is (= {:database (u/the-id db)
              :type     :query
              :query    {:source-query {:native "SELECT * FROM VENUES"}}}
             (check-perms-for-rasta
              {:database (u/the-id db)
               :type     :query
               :query   {:source-query {:native "SELECT * FROM VENUES"}}}))))))

(deftest nested-mbql-query-test
  (testing "Make sure nested MBQL query fails to run if current user doesn't have perms"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db)}]
      ;; All users get perms for all new DBs by default
      (mt/with-no-data-perms-for-all-users!
        (is (thrown-with-msg?
             ExceptionInfo
             perms-error-msg
             (check-perms-for-rasta
              {:database (u/the-id db)
               :type     :query
               :query    {:source-query {:source-table (u/the-id table)}}})))))))

(deftest nested-mbql-query-test-2
  (testing "...but it should work if user has perms [nested MBQL queries]"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db)}]
      (is (= {:database (u/the-id db)
              :type     :query
              :query    {:source-query {:source-table (u/the-id table)}}}
             (check-perms-for-rasta
              {:database (u/the-id db)
               :type     :query
               :query    {:source-query {:source-table (u/the-id table)}}}))))))

(deftest template-tags-referenced-queries-test
  (testing "Fails for MBQL query referenced in template tag, when user has no perms to referenced query"
    (mt/with-temp [:model/Database db      {}
                   :model/Table    _       {:db_id (u/the-id db)}
                   :model/Table    table-2 {:db_id (u/the-id db)}
                   :model/Card     card    {:dataset_query {:database (u/the-id db), :type :query,
                                                            :query {:source-table (u/the-id table-2)}}}]
      ;; All users get perms for all new DBs by default
      (mt/with-no-data-perms-for-all-users!
        (let [card-id  (:id card)
              tag-name (str "#" card-id)]
          (is (thrown-with-msg?
               ExceptionInfo
               perms-error-msg
               (check-perms-for-rasta
                {:database (u/the-id db)
                 :type     :native
                 :native   {:query         (format "SELECT * FROM {{%s}} AS x" tag-name)
                            :template-tags {tag-name
                                            {:id   tag-name, :name tag-name, :display-name tag-name,
                                             :type "card",   :card card-id}}}}))))))))

(deftest template-tags-referenced-queries-test-2
  (testing "...but it should work if user has perms [template tag referenced query]"
    (mt/with-temp [:model/Database db      {}
                   :model/Table    _       {:db_id (u/the-id db)}
                   :model/Table    table-2 {:db_id (u/the-id db)}
                   :model/Card     card    {:dataset_query {:database (u/the-id db), :type :query,
                                                            :query    {:source-table (u/the-id table-2)}}}]
      (let [card-id   (:id card)
            tag-name  (str "#" card-id)
            query-sql (format "SELECT * FROM {{%s}} AS x" tag-name)]
        ;; query should be returned by middleware unchanged
        (is (= {:database (u/the-id db)
                :type     :native
                :native   {:query         query-sql
                           :template-tags {tag-name {:id           tag-name
                                                     :name         tag-name
                                                     :display-name tag-name
                                                     :type         "card"
                                                     :card-id      card-id}}}}
               (check-perms-for-rasta
                {:database (u/the-id db)
                 :type     :native
                 :native   {:query         query-sql
                            :template-tags {tag-name
                                            {:id           tag-name
                                             :name         tag-name
                                             :display-name tag-name
                                             :type         "card"
                                             :card-id      card-id}}}})))))))

(deftest template-tags-referenced-queries-test-3
  (testing "Fails for native query referenced in template tag, when user has no perms to referenced query"
    (mt/with-temp [:model/Database db   {}
                   :model/Card     card {:dataset_query
                                         {:database (u/the-id db), :type :native,
                                          :native {:query "SELECT 1 AS \"foo\", 2 AS \"bar\", 3 AS \"baz\""}}}]
      ;; All users get perms for all new DBs by default
      (mt/with-no-data-perms-for-all-users!
        (let [card-id  (:id card)
              tag-name (str "#" card-id)]
          (is (thrown-with-msg?
               ExceptionInfo
               perms-error-msg
               (check-perms-for-rasta
                {:database (u/the-id db)
                 :type     :native
                 :native   {:query         (format "SELECT * FROM {{%s}} AS x" tag-name)
                            :template-tags {tag-name
                                            {:id   tag-name, :name tag-name, :display-name tag-name,
                                             :type "card",   :card card-id}}}}))))))))

(deftest template-tags-referenced-queries-test-4
  (testing "...but it should work if user has perms [template tag referenced query]"
    (mt/with-temp [:model/Database db   {}
                   :model/Card     card {:dataset_query
                                         {:database (u/the-id db), :type :native,
                                          :native   {:query "SELECT 1 AS \"foo\", 2 AS \"bar\", 3 AS \"baz\""}}}]
      (let [card-id   (:id card)
            tag-name  (str "#" card-id)
            query-sql (format "SELECT * FROM {{%s}} AS x" tag-name)]
        ;; query should be returned by middleware unchanged
        (is (= {:database (u/the-id db)
                :type     :native
                :native   {:query         query-sql
                           :template-tags {tag-name {:id           tag-name
                                                     :name         tag-name
                                                     :display-name tag-name
                                                     :type         "card"
                                                     :card-id      card-id}}}}
               (check-perms-for-rasta
                {:database (u/the-id db)
                 :type     :native
                 :native   {:query         query-sql
                            :template-tags {tag-name
                                            {:id           tag-name
                                             :name         tag-name
                                             :display-name tag-name
                                             :type         "card"
                                             :card-id      card-id}}}})))))))

(deftest query-action-permissions-test
  (testing "Query action permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (let [query  (mt/mbql-query venues {:order-by [[:asc $id]], :limit 2})
                check! (fn [query]
                         (binding [api/*current-user-id* (mt/user->id :rasta)]
                           (qp.store/with-metadata-provider (mt/id)
                             (qp.perms/check-query-action-permissions* query))))]
            (mt/with-temp [:model/Collection collection]
              (mt/with-temp [:model/Card {model-id :id} {:collection_id (u/the-id collection)
                                                         :dataset_query query}]
                (testing "are granted by default"
                  (check! query))
                (testing "are revoked without access to the model"
                  (binding [qp.perms/*card-id* model-id]
                    (is (thrown-with-msg?
                         ExceptionInfo
                         #"You do not have permissions to view Card [\d,]+"
                         (check! query)))))
                ;; Are revoked with DB access blocked: requires EE, see test in
                ;; enterprise/backend/test/metabase_enterprise/advanced_permissions/common_test.clj
                (testing "are granted with access to the model"
                  (binding [api/*current-user-permissions-set* (delay #{(perms/collection-read-path (u/the-id collection))})
                            qp.perms/*card-id* model-id]
                    (check! query)))))))))))

(deftest inactive-table-test
  (testing "Make sure a query on an inactive table fails to run"
    (mt/with-temp [:model/Database db {:name "Test DB"}
                   :model/Table    table {:db_id (u/the-id db)
                                          :name "Inactive Table"
                                          :schema "PUBLIC"
                                          :active false}]
      (mt/with-full-data-perms-for-all-users!
        (is (thrown-with-msg?
             Exception
             #"Table \"Test DB.PUBLIC.Inactive Table\" is inactive."
             (check-perms-for-rasta
              {:database (u/the-id db)
               :type     :query
               :query    {:source-table (u/the-id table)}}))))

      ;; Don't leak metadata about the table if the user doesn't have access to it, even if it's inactive
      (mt/with-no-data-perms-for-all-users!
        (is (thrown-with-msg?
             Exception
             #"Table [\d,]+ is inactive."
             (check-perms-for-rasta
              {:database (u/the-id db)
               :type     :query
               :query    {:source-table (u/the-id table)}})))))))

(deftest e2e-nested-source-card-full-permissions-mbql-mbql-test
  (testing "Make sure permissions are calculated correctly for Card 1 -> Card 2 -> Source Query when there are full
           Collection permissions to both Cards (#12354) - MBQL Card 1, MBQL Card 2"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (let [card-1-query (mt/mbql-query venues
                                 {:order-by [[:asc $id]], :limit 2})]
              (mt/with-temp [:model/Card {card-1-id :id, :as card-1} {:collection_id (u/the-id collection)
                                                                      :dataset_query card-1-query}]
                (let [card-2-query (mt/mbql-query nil
                                     {:source-table (format "card__%d" card-1-id)})]
                  (mt/with-temp [:model/Card card-2 {:collection_id (u/the-id collection)
                                                     :dataset_query card-2-query}]
                    (testing "should be able to read nested-nested Card if we have Collection permissions"
                      (mt/with-test-user :rasta
                        (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                        [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                          (testing "Should be able to run Card 1 directly"
                            (binding [qp.perms/*card-id* (u/the-id card-1)]
                              (is (= expected
                                     (mt/rows
                                      (qp/process-query (:dataset_query card-1)))))))

                          (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                            (binding [qp.perms/*card-id* (u/the-id card-2)]
                              (is (= expected
                                     (mt/rows
                                      (qp/process-query (:dataset_query card-2)))))))

                          (testing "Should be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card -> Source Query]"
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query (mt/mbql-query nil
                                                        {:source-table (format "card__%d" card-1-id)}))))))

                          (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card -> Card -> Source Query]"
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query
                                     (qp/userland-query
                                      (mt/mbql-query nil
                                        {:source-table (format "card__%d" (u/the-id card-2))}))))))))))))))))))))

(deftest e2e-nested-source-card-full-permissions-mbql-native-test
  (testing "Make sure permissions are calculated correctly for Card 1 -> Card 2 -> Source Query when there are full
           Collection permissions to both Cards (#12354) - MBQL Card 1, native Card 2"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (let [card-1-query (mt/mbql-query venues
                                 {:order-by [[:asc $id]], :limit 2})]
              (mt/with-temp [:model/Card {card-1-id :id, :as card-1} {:collection_id (u/the-id collection)
                                                                      :dataset_query card-1-query}]
                (let [card-2-query (mt/native-query
                                     {:query         "SELECT * FROM {{card}}"
                                      :template-tags {"card" {:name         "card"
                                                              :display-name "card"
                                                              :type         :card
                                                              :card-id      card-1-id}}})]
                  (mt/with-temp [:model/Card card-2 {:collection_id (u/the-id collection)
                                                     :dataset_query card-2-query}]
                    (testing "should be able to read nested-nested Card if we have Collection permissions"
                      (mt/with-test-user :rasta
                        (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                        [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                          (testing "Should be able to run Card 1 directly"
                            (binding [qp.perms/*card-id* (u/the-id card-1)]
                              (is (= expected
                                     (mt/rows
                                      (qp/process-query (:dataset_query card-1)))))))

                          (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                            (binding [qp.perms/*card-id* (u/the-id card-2)]
                              (is (= expected
                                     (mt/rows
                                      (qp/process-query (:dataset_query card-2)))))))

                          (testing "Should be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card -> Source Query]"
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query (mt/mbql-query nil
                                                        {:source-table (format "card__%d" card-1-id)}))))))

                          (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card -> Card -> Source Query]"
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query
                                     (qp/userland-query
                                      (mt/mbql-query nil
                                        {:source-table (format "card__%d" (u/the-id card-2))}))))))))))))))))))))

(deftest e2e-nested-source-card-full-permissions-native-mbql-test
  (testing "Make sure permissions are calculated correctly for Card 1 -> Card 2 -> Source Query when there are full
           Collection permissions to both Cards (#12354) - native Card 1, MBQL Card 2"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (let [card-1-query (mt/native-query
                                 {:query (str "SELECT id, name, category_id, latitude, longitude, price "
                                              "FROM venues "
                                              "ORDER BY id ASC "
                                              "LIMIT 2")})]
              (mt/with-temp [:model/Card {card-1-id :id, :as card-1} {:collection_id (u/the-id collection)
                                                                      :dataset_query card-1-query}]
                (let [card-2-query (mt/mbql-query nil
                                     {:source-table (format "card__%d" card-1-id)})]
                  (mt/with-temp [:model/Card card-2 {:collection_id (u/the-id collection)
                                                     :dataset_query card-2-query}]
                    (testing "should be able to read nested-nested Card if we have Collection permissions"
                      (mt/with-test-user :rasta
                        (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                        [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                          (testing "Should be able to run Card 1 directly"
                            (binding [qp.perms/*card-id* (u/the-id card-1)]
                              (is (= expected
                                     (mt/rows
                                      (qp/process-query (:dataset_query card-1)))))))

                          (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                            (binding [qp.perms/*card-id* (u/the-id card-2)]
                              (is (= expected
                                     (mt/rows
                                      (qp/process-query (:dataset_query card-2)))))))

                          (testing "Should be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card -> Source Query]"
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query (mt/mbql-query nil
                                                        {:source-table (format "card__%d" card-1-id)}))))))

                          (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card -> Card -> Source Query]"
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query
                                     (qp/userland-query
                                      (mt/mbql-query nil
                                        {:source-table (format "card__%d" (u/the-id card-2))}))))))))))))))))))))

(deftest e2e-nested-source-card-full-permissions-native-native-test
  (testing "Make sure permissions are calculated correctly for Card 1 -> Card 2 -> Source Query when there are full
           Collection permissions to both Cards (#12354) - native Card 1, native Card 2"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (let [card-1-query (mt/native-query
                                 {:query (str "SELECT id, name, category_id, latitude, longitude, price "
                                              "FROM venues "
                                              "ORDER BY id ASC "
                                              "LIMIT 2")})]
              (mt/with-temp [:model/Card {card-1-id :id, :as card-1} {:collection_id (u/the-id collection)
                                                                      :dataset_query card-1-query}]
                (let [card-2-query (mt/native-query
                                     {:query         "SELECT * FROM {{card}}"
                                      :template-tags {"card" {:name         "card"
                                                              :display-name "card"
                                                              :type         :card
                                                              :card-id      card-1-id}}})]
                  (mt/with-temp [:model/Card card-2 {:collection_id (u/the-id collection)
                                                     :dataset_query card-2-query}]
                    (testing "should be able to read nested-nested Card if we have Collection permissions"
                      (mt/with-test-user :rasta
                        (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                        [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                          (testing "Should be able to run Card 1 directly"
                            (binding [qp.perms/*card-id* (u/the-id card-1)]
                              (is (= expected
                                     (mt/rows
                                      (qp/process-query (:dataset_query card-1)))))))

                          (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                            (binding [qp.perms/*card-id* (u/the-id card-2)]
                              (is (= expected
                                     (mt/rows
                                      (qp/process-query (:dataset_query card-2)))))))

                          (testing "Should be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card -> Source Query]"
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query (mt/mbql-query nil
                                                        {:source-table (format "card__%d" card-1-id)}))))))

                          (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card -> Card -> Source Query]"
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query
                                     (qp/userland-query
                                      (mt/mbql-query nil
                                        {:source-table (format "card__%d" (u/the-id card-2))}))))))))))))))))))))

(deftest e2e-nested-source-card-no-permissions-mbql-mbql-test
  (testing "Make sure permissions are calculated correctly for Card 2 -> Card 1 -> Source Query when a user has access to Card 2,
           but not Card 1 - MBQL Card 1, MBQL Card 2"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection {collection-1-id :id} {}
                         :model/Collection {collection-2-id :id} {}]
            ;; Grant read permissions for Collection 2 but not Collection 1
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection-2-id)
            (let [card-1-query (mt/mbql-query venues
                                 {:order-by [[:asc $id]], :limit 2})]
              (mt/with-temp [:model/Card {card-1-id :id, :as card-1} {:collection_id collection-1-id
                                                                      :dataset_query card-1-query}]
                (let [card-2-query (mt/mbql-query nil
                                     {:source-table (format "card__%d" card-1-id)})]
                  (mt/with-temp [:model/Card card-2 {:collection_id collection-2-id
                                                     :dataset_query card-2-query}]
                    (mt/with-test-user :rasta
                      (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                      [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                        (testing "Should not be able to run Card 1 directly"
                          (binding [qp.perms/*card-id* (u/the-id card-1)]
                            (is (thrown-with-msg?
                                 ExceptionInfo
                                 #"You do not have permissions to view Card"
                                 (mt/rows
                                  (qp/process-query (:dataset_query card-1)))))))

                        (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                          (binding [qp.perms/*card-id* (u/the-id card-2)]
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query (:dataset_query card-2)))))))

                        (testing "Should not be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card 1 -> Source Query]"
                          (is (thrown-with-msg?
                               ExceptionInfo
                               #"You do not have permissions to view Card"
                               (mt/rows
                                (qp/process-query (mt/mbql-query nil
                                                    {:source-table (format "card__%d" card-1-id)}))))))

                        (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card 2 -> Card 1 -> Source Query]"
                          (is (= expected
                                 (mt/rows
                                  (qp/process-query
                                   (qp/userland-query
                                    (mt/mbql-query nil
                                      {:source-table (format "card__%d" (u/the-id card-2))})))))))))))))))))))

(deftest e2e-nested-source-card-no-permissions-mbql-native-test
  (testing "Make sure permissions are calculated correctly for Card 2 -> Card 1 -> Source Query when a user has access to Card 2,
           but not Card 1 - MBQL Card 1, native Card 2"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection {collection-1-id :id} {}
                         :model/Collection {collection-2-id :id} {}]
            ;; Grant read permissions for Collection 2 but not Collection 1
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection-2-id)
            (let [card-1-query (mt/mbql-query venues
                                 {:order-by [[:asc $id]], :limit 2})]
              (mt/with-temp [:model/Card {card-1-id :id, :as card-1} {:collection_id collection-1-id
                                                                      :dataset_query card-1-query}]
                (let [card-2-query (mt/native-query
                                     {:query         "SELECT * FROM {{card}}"
                                      :template-tags {"card" {:name         "card"
                                                              :display-name "card"
                                                              :type         :card
                                                              :card-id      card-1-id}}})]
                  (mt/with-temp [:model/Card card-2 {:collection_id collection-2-id
                                                     :dataset_query card-2-query}]
                    (mt/with-test-user :rasta
                      (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                      [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                        (testing "Should not be able to run Card 1 directly"
                          (binding [qp.perms/*card-id* (u/the-id card-1)]
                            (is (thrown-with-msg?
                                 ExceptionInfo
                                 #"You do not have permissions to view Card"
                                 (mt/rows
                                  (qp/process-query (:dataset_query card-1)))))))

                        (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                          (binding [qp.perms/*card-id* (u/the-id card-2)]
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query (:dataset_query card-2)))))))

                        (testing "Should not be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card 1 -> Source Query]"
                          (is (thrown-with-msg?
                               ExceptionInfo
                               #"You do not have permissions to view Card"
                               (mt/rows
                                (qp/process-query (mt/mbql-query nil
                                                    {:source-table (format "card__%d" card-1-id)}))))))

                        (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card 2 -> Card 1 -> Source Query]"
                          (is (= expected
                                 (mt/rows
                                  (qp/process-query
                                   (qp/userland-query
                                    (mt/mbql-query nil
                                      {:source-table (format "card__%d" (u/the-id card-2))})))))))))))))))))))

(deftest e2e-nested-source-card-no-permissions-native-mbql-test
  (testing "Make sure permissions are calculated correctly for Card 2 -> Card 1 -> Source Query when a user has access to Card 2,
           but not Card 1 - native Card 1, MBQL Card 2"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection {collection-1-id :id} {}
                         :model/Collection {collection-2-id :id} {}]
            ;; Grant read permissions for Collection 2 but not Collection 1
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection-2-id)
            (let [card-1-query (mt/native-query
                                 {:query (str "SELECT id, name, category_id, latitude, longitude, price "
                                              "FROM venues "
                                              "ORDER BY id ASC "
                                              "LIMIT 2")})]
              (mt/with-temp [:model/Card {card-1-id :id, :as card-1} {:collection_id collection-1-id
                                                                      :dataset_query card-1-query}]
                (let [card-2-query (mt/mbql-query nil
                                     {:source-table (format "card__%d" card-1-id)})]
                  (mt/with-temp [:model/Card card-2 {:collection_id collection-2-id
                                                     :dataset_query card-2-query}]
                    (mt/with-test-user :rasta
                      (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                      [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                        (testing "Should not be able to run Card 1 directly"
                          (binding [qp.perms/*card-id* (u/the-id card-1)]
                            (is (thrown-with-msg?
                                 ExceptionInfo
                                 #"You do not have permissions to view Card"
                                 (mt/rows
                                  (qp/process-query (:dataset_query card-1)))))))

                        (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                          (binding [qp.perms/*card-id* (u/the-id card-2)]
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query (:dataset_query card-2)))))))

                        (testing "Should not be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card 1 -> Source Query]"
                          (is (thrown-with-msg?
                               ExceptionInfo
                               #"You do not have permissions to view Card"
                               (mt/rows
                                (qp/process-query (mt/mbql-query nil
                                                    {:source-table (format "card__%d" card-1-id)}))))))

                        (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card 2 -> Card 1 -> Source Query]"
                          (is (= expected
                                 (mt/rows
                                  (qp/process-query
                                   (qp/userland-query
                                    (mt/mbql-query nil
                                      {:source-table (format "card__%d" (u/the-id card-2))})))))))))))))))))))

(deftest e2e-nested-source-card-no-permissions-native-native-test
  (testing "Make sure permissions are calculated correctly for Card 2 -> Card 1 -> Source Query when a user has access to Card 2,
           but not Card 1 - native Card 1, native Card 2"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection {collection-1-id :id} {}
                         :model/Collection {collection-2-id :id} {}]
            ;; Grant read permissions for Collection 2 but not Collection 1
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection-2-id)
            (let [card-1-query (mt/native-query
                                 {:query (str "SELECT id, name, category_id, latitude, longitude, price "
                                              "FROM venues "
                                              "ORDER BY id ASC "
                                              "LIMIT 2")})]
              (mt/with-temp [:model/Card {card-1-id :id, :as card-1} {:collection_id collection-1-id
                                                                      :dataset_query card-1-query}]
                (let [card-2-query (mt/native-query
                                     {:query         "SELECT * FROM {{card}}"
                                      :template-tags {"card" {:name         "card"
                                                              :display-name "card"
                                                              :type         :card
                                                              :card-id      card-1-id}}})]
                  (mt/with-temp [:model/Card card-2 {:collection_id collection-2-id
                                                     :dataset_query card-2-query}]
                    (mt/with-test-user :rasta
                      (let [expected [[1 "Red Medicine"           4 10.0646 -165.374 3]
                                      [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]]
                        (testing "Should not be able to run Card 1 directly"
                          (binding [qp.perms/*card-id* (u/the-id card-1)]
                            (is (thrown-with-msg?
                                 ExceptionInfo
                                 #"You do not have permissions to view Card"
                                 (mt/rows
                                  (qp/process-query (:dataset_query card-1)))))))

                        (testing "Should be able to run Card 2 directly [Card 2 -> Card 1 -> Source Query]"
                          (binding [qp.perms/*card-id* (u/the-id card-2)]
                            (is (= expected
                                   (mt/rows
                                    (qp/process-query (:dataset_query card-2)))))))

                        (testing "Should not be able to run ad-hoc query with Card 1 as source query [Ad-hoc -> Card 1 -> Source Query]"
                          (is (thrown-with-msg?
                               ExceptionInfo
                               #"You do not have permissions to view Card"
                               (mt/rows
                                (qp/process-query (mt/mbql-query nil
                                                    {:source-table (format "card__%d" card-1-id)}))))))

                        (testing "Should be able to run ad-hoc query with Card 2 as source query [Ad-hoc -> Card 2 -> Card 1 -> Source Query]"
                          (is (= expected
                                 (mt/rows
                                  (qp/process-query
                                   (qp/userland-query
                                    (mt/mbql-query nil
                                      {:source-table (format "card__%d" (u/the-id card-2))})))))))))))))))))))

(deftest e2e-ignore-user-supplied-card-ids-test
  (testing "You shouldn't be able to bypass security restrictions by passing `[:info :card-id]` in the query."
    (mt/with-temp-copy-of-db
      ;; TODO: re-evaluate this test; the error is being thrown at the API-layer and not in the QP
      (mt/with-no-data-perms-for-all-users!
        (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
          (mt/with-temp [:model/Collection collection {}
                         :model/Card       card {:collection_id (u/the-id collection)
                                                 :dataset_query (mt/mbql-query venues {:fields [$id], :order-by [[:asc $id]], :limit 2})}]
            ;; Since the collection derives from the root collection this grant shouldn't really be needed, but better to
            ;; be extra-sure in this case that the user is getting rejected for data perms and not card/collection perms
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "dataset" (assoc (mt/mbql-query venues {:limit 1})
                                                                           :info {:card-id (u/the-id card)}))))))))))

(deftest e2e-ignore-user-supplied-perms-test
  (testing "You shouldn't be able to bypass security restrictions by passing in `:query-permissions/perms` in the query"
    (mt/with-no-data-perms-for-all-users!
      (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :no)
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
      (mt/with-test-user :rasta
        (testing "Sanity check: should not be able to run this query the normal way"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You do not have permissions to run this query"
               (qp/process-query (mt/mbql-query venues {:limit 1})))))
        (letfn [(process-query []
                  (qp/process-query (assoc (mt/mbql-query venues {:limit 1})
                                           :query-permissions/perms {:gtaps {:perms/view-data :unrestricted
                                                                             :perms/create-queries {(mt/id :venues) :query-builder}}})))]
          (testing "Make sure the middleware is actually preventing something by disabling it"
            (with-redefs [qp.perms/remove-permissions-key identity]
              (is (=? {:status :completed}
                      (process-query)))))
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You do not have permissions to run this query"
               (process-query))))))))

(deftest e2e-ignore-user-supplied-gtapped-tables-test
  (testing "You shouldn't be able to bypass security restrictions by passing in `:query-permissions/gtapped-table` in the query"
    (mt/with-no-data-perms-for-all-users!
      (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :no)
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
      (let [bad-query {:database (mt/id), :type :query, :query {:source-query {:native "SELECT * FROM VENUES LIMIT 1"
                                                                               :query-permissions/gtapped-table (mt/id :venues)}}
                       :query-permissions/perms {:gtaps {:perms/view-data :unrestricted
                                                         :perms/create-queries :query-builder-and-native}}}]
        (mt/with-test-user :rasta
          (testing "Sanity check: should not be able to run this query the normal way"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"You do not have permissions to run this query"
                 (qp/process-query bad-query))))
          (letfn [(process-query []
                    (qp/process-query bad-query))]
            (testing "Testing that we will still throw due to the :query-permissions/perms stripping"
              (with-redefs [qp.perms/remove-gtapped-table-keys identity]
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"You do not have permissions to run this query"
                     (process-query)))))
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"You do not have permissions to run this query"
                 (process-query)))))))))

(deftest e2e-ignore-user-supplied-compiled-from-mbql-key
  (testing "Make sure the NATIVE query fails to run if current user doesn't have perms even if you try to include an MBQL :query"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db)}]
      (perms/set-database-permission! (perms/all-users-group) (u/the-id db) :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (binding [mu.fn/*enforce* false]
          (is (thrown-with-msg?
               ExceptionInfo
               perms-error-msg
               (qp/process-query
                {:database              (u/the-id db)
                 :type                  :native
                 :qp/compiled-from-mbql {:source-table (u/the-id table)}
                 :native                {:query "SELECT * FROM VENUES"}}))))))))

(deftest e2e-native-query-source-card-id-join-perms-test
  (testing "Make sure that a native source card joined to an MBQL query checks card read perms rather than full native access"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                              :type :native
                                                              :native {:query "SELECT * FROM venues"}}}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
        (let [query (mt/mbql-query checkins
                      {:joins    [{:fields       [$id]
                                   :source-table (format "card__%d" card-id)
                                   :alias        "card"
                                   :condition    [:= $venue_id &card.venues.id]
                                   :strategy     :left-join}]
                       :order-by [[:asc $id]]
                       :limit    2})]
          (mt/with-current-user user-id
            (is (= 2 (count (mt/rows (qp/process-query query)))))))))))

(deftest e2e-ignore-user-supplied-source-card-key-test
  (testing "Make sure that you can't bypass native query permissions by including :qp/stage-is-from-source-card in a
           join"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                              :type :native
                                                              :native {:query "SELECT * FROM venues"}}}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
        (let [query (mt/mbql-query checkins
                      {:joins    [{:fields       [$id]
                                   :alias        "v"
                                   :source-query {:native "SELECT * from orders"}
                                   :condition    [:= true true]
                                   ;; Make sure we can't just pass in this key and join to arbitrary SQL!
                                   :qp/stage-is-from-source-card card-id}]
                       :order-by [[:asc $id]]
                       :limit    2})]
          (mt/with-current-user user-id
            (is (thrown-with-msg?
                 ExceptionInfo
                 perms-error-msg
                 (qp/process-query query)))))))))

(deftest e2e-card-join-both-permissions-test
  (testing "User can run query when they have permissions to both the source card and joined card"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-card-id :id} {:collection_id (u/the-id collection)
                                                             :dataset_query (mt/mbql-query venues
                                                                              {:fields [$id $name $category_id]
                                                                               :order-by [[:asc $id]]
                                                                               :limit 5})}
                           :model/Card {categories-card-id :id} {:collection_id (u/the-id collection)
                                                                 :dataset_query (mt/mbql-query categories
                                                                                  {:fields [$id $name]
                                                                                   :order-by [[:asc $id]]})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-card-id)
                                  :joins [{:fields :all
                                           :source-table (format "card__%d" categories-card-id)
                                           :alias "cat"
                                           :condition [:= [:field (mt/id :venues :category_id) {:base-type :type/Integer}]
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should be able to run query joining two cards when user has access to both"
                    (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))

(deftest e2e-card-join-partial-permissions-test
  (testing "User cannot run query when they have permissions to source card but not joined card"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection {accessible-collection-id :id} {}
                         :model/Collection {restricted-collection-id :id} {}]
            ;; Grant read permissions only to the accessible collection
            (perms/grant-collection-read-permissions! (perms/all-users-group) accessible-collection-id)
            (mt/with-temp [:model/Card {venues-card-id :id} {:collection_id accessible-collection-id
                                                             :dataset_query (mt/mbql-query venues
                                                                              {:fields [$id $name $category_id]
                                                                               :order-by [[:asc $id]]
                                                                               :limit 5})}
                           :model/Card {categories-card-id :id} {:collection_id restricted-collection-id
                                                                 :dataset_query (mt/mbql-query categories
                                                                                  {:fields [$id $name]
                                                                                   :order-by [[:asc $id]]})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-card-id)
                                  :joins [{:fields :all
                                           :source-table (format "card__%d" categories-card-id)
                                           :alias "cat"
                                           :condition [:= [:field (mt/id :venues :category_id) {:base-type :type/Integer}]
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should not be able to run query joining cards when user lacks access to joined card"
                    (is (thrown-with-msg?
                         ExceptionInfo
                         #"You do not have permissions to view Card"
                         (qp/process-query join-query)))))))))))))

(deftest e2e-card-table-join-view-data-permissions-test
  (testing "User cannot run query joining card to table when they have view-data but no create-queries permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow view-data but block create-queries for venues table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :no)
          ;; Allow access to categories table for the card
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {categories-card-id :id} {:collection_id (u/the-id collection)
                                                                 :dataset_query (mt/mbql-query categories
                                                                                  {:fields [$id $name]
                                                                                   :order-by [[:asc $id]]})}]
              (let [join-query (mt/mbql-query venues
                                 {:joins [{:fields :all
                                           :source-table (format "card__%d" categories-card-id)
                                           :alias "cat"
                                           :condition [:= $category_id
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should not be able to run ad-hoc query joining card to table without create-queries permission"
                    (is (thrown-with-msg?
                         ExceptionInfo
                         #"You do not have permissions to run this query"
                         (qp/process-query join-query))))
                  (testing "Should be able to run card query joining card to table with view-data permission"
                    (mt/with-temp [:model/Card {join-card-id :id} {:collection_id (u/the-id collection)
                                                                   :dataset_query join-query}]
                      (binding [qp.perms/*card-id* join-card-id]
                        (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))))

(deftest e2e-card-source-table-join-view-data-permissions-test
  (testing "User cannot run query with card as source table joined to table when they have view-data but no create-queries permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow access to venues table for the card
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          ;; Allow view-data but block create-queries for categories table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-card-id :id} {:collection_id (u/the-id collection)
                                                             :dataset_query (mt/mbql-query venues
                                                                              {:fields [$id $name $category_id]
                                                                               :order-by [[:asc $id]]
                                                                               :limit 5})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-card-id)
                                  :joins [{:fields :all
                                           :source-table (mt/id :categories)
                                           :alias "cat"
                                           :condition [:= [:field (mt/id :venues :category_id) {:base-type :type/Integer}]
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should not be able to run ad-hoc query with card as source joined to table without create-queries permission"
                    (is (thrown-with-msg?
                         ExceptionInfo
                         #"You do not have permissions to run this query"
                         (qp/process-query join-query))))
                  (testing "Should be able to run card query with card as source joined to table with view-data permission"
                    (mt/with-temp [:model/Card {join-card-id :id} {:collection_id (u/the-id collection)
                                                                   :dataset_query join-query}]
                      (binding [qp.perms/*card-id* join-card-id]
                        (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))))

(deftest e2e-card-source-table-join-full-permissions-test
  (testing "User can run query with card as source table joined to table when they have both view-data and create-queries permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow access to venues table for the card
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          ;; Allow full access to categories table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-card-id :id} {:collection_id (u/the-id collection)
                                                             :dataset_query (mt/mbql-query venues
                                                                              {:fields [$id $name $category_id]
                                                                               :order-by [[:asc $id]]
                                                                               :limit 5})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-card-id)
                                  :joins [{:fields :all
                                           :source-table (mt/id :categories)
                                           :alias "cat"
                                           :condition [:= [:field (mt/id :venues :category_id) {:base-type :type/Integer}]
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should be able to run ad-hoc query with card as source joined to table with full permissions"
                    (is (= 2 (count (mt/rows (qp/process-query join-query))))))
                  (testing "Should be able to run card query with card as source joined to table with full permissions"
                    (mt/with-temp [:model/Card {join-card-id :id} {:collection_id (u/the-id collection)
                                                                   :dataset_query join-query}]
                      (binding [qp.perms/*card-id* join-card-id]
                        (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))))

(deftest e2e-card-table-join-full-permissions-test
  (testing "User can run query joining card to table when they have both view-data and create-queries permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow full access to venues table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          ;; Allow access to categories table for the card
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {categories-card-id :id} {:collection_id (u/the-id collection)
                                                                 :dataset_query (mt/mbql-query categories
                                                                                  {:fields [$id $name]
                                                                                   :order-by [[:asc $id]]})}]
              (let [join-query (mt/mbql-query venues
                                 {:joins [{:fields :all
                                           :source-table (format "card__%d" categories-card-id)
                                           :alias "cat"
                                           :condition [:= $category_id
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should be able to run ad-hoc query joining card to table with full permissions"
                    (is (= 2 (count (mt/rows (qp/process-query join-query))))))
                  (testing "Should be able to run card query joining card to table with full permissions"
                    (mt/with-temp [:model/Card {join-card-id :id} {:collection_id (u/the-id collection)
                                                                   :dataset_query join-query}]
                      (binding [qp.perms/*card-id* join-card-id]
                        (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))))

(deftest e2e-card-with-join-table-join-view-data-permissions-test
  (testing "User cannot run query joining card (that contains a join) to table when they have view-data but no create-queries permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow view-data but block create-queries for checkins table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/create-queries :no)
          ;; Allow access to venues and categories tables for the card with join
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-with-join-card-id :id} {:collection_id (u/the-id collection)
                                                                       :dataset_query (mt/mbql-query venues
                                                                                        {:fields [$id $name $category_id]
                                                                                         :joins [{:fields :all
                                                                                                  :source-table (mt/id :categories)
                                                                                                  :alias "cat"
                                                                                                  :condition [:= $category_id
                                                                                                              [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                                                                         :order-by [[:asc $id]]
                                                                                         :limit 5})}]
              (let [join-query (mt/mbql-query checkins
                                 {:joins [{:fields :all
                                           :source-table (format "card__%d" venues-with-join-card-id)
                                           :alias "venues_card"
                                           :condition [:= $venue_id
                                                       [:field (mt/id :venues :id) {:base-type :type/Integer, :join-alias "venues_card"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should not be able to run ad-hoc query joining card with join to table without create-queries permission"
                    (is (thrown-with-msg?
                         ExceptionInfo
                         #"You do not have permissions to run this query"
                         (qp/process-query join-query))))
                  (testing "Should be able to run card query joining card with join to table with view-data permission"
                    (mt/with-temp [:model/Card {join-card-id :id} {:collection_id (u/the-id collection)
                                                                   :dataset_query join-query}]
                      (binding [qp.perms/*card-id* join-card-id]
                        (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))))

(deftest e2e-card-with-join-table-join-full-permissions-test
  (testing "User can run query joining card (that contains a join) to table when they have both view-data and create-queries permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow full access to checkins table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/create-queries :query-builder)
          ;; Allow access to venues and categories tables for the card with join
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-with-join-card-id :id} {:collection_id (u/the-id collection)
                                                                       :dataset_query (mt/mbql-query venues
                                                                                        {:fields [$id $name $category_id]
                                                                                         :joins [{:fields :all
                                                                                                  :source-table (mt/id :categories)
                                                                                                  :alias "cat"
                                                                                                  :condition [:= $category_id
                                                                                                              [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                                                                         :order-by [[:asc $id]]
                                                                                         :limit 5})}]
              (let [join-query (mt/mbql-query checkins
                                 {:joins [{:fields :all
                                           :source-table (format "card__%d" venues-with-join-card-id)
                                           :alias "venues_card"
                                           :condition [:= $venue_id
                                                       [:field (mt/id :venues :id) {:base-type :type/Integer, :join-alias "venues_card"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should be able to run ad-hoc query joining card with join to table with full permissions"
                    (is (= 2 (count (mt/rows (qp/process-query join-query))))))
                  (testing "Should be able to run card query joining card with join to table with full permissions"
                    (mt/with-temp [:model/Card {join-card-id :id} {:collection_id (u/the-id collection)
                                                                   :dataset_query join-query}]
                      (binding [qp.perms/*card-id* join-card-id]
                        (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))))

(deftest e2e-card-with-join-source-table-join-view-data-permissions-test
  (testing "User cannot run query with card (that contains a join) as source joined to table when they have view-data but no create-queries permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow access to venues and categories tables for the card with join
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          ;; Allow view-data but block create-queries for checkins table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-with-join-card-id :id} {:collection_id (u/the-id collection)
                                                                       :dataset_query (mt/mbql-query venues
                                                                                        {:fields [$id $name $category_id]
                                                                                         :joins [{:fields :all
                                                                                                  :source-table (mt/id :categories)
                                                                                                  :alias "cat"
                                                                                                  :condition [:= $category_id
                                                                                                              [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                                                                         :order-by [[:asc $id]]
                                                                                         :limit 5})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-with-join-card-id)
                                  :joins [{:fields :all
                                           :source-table (mt/id :checkins)
                                           :alias "checkins"
                                           :condition [:= [:field (mt/id :venues :id) {:base-type :type/Integer}]
                                                       [:field (mt/id :checkins :venue_id) {:base-type :type/Integer, :join-alias "checkins"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should not be able to run ad-hoc query with card with join as source joined to table without create-queries permission"
                    (is (thrown-with-msg?
                         ExceptionInfo
                         #"You do not have permissions to run this query"
                         (qp/process-query join-query))))
                  (testing "Should be able to run card query with card with join as source joined to table with view-data permission"
                    (mt/with-temp [:model/Card {join-card-id :id} {:collection_id (u/the-id collection)
                                                                   :dataset_query join-query}]
                      (binding [qp.perms/*card-id* join-card-id]
                        (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))))

(deftest e2e-card-with-join-source-table-join-full-permissions-test
  (testing "User can run query with card (that contains a join) as source joined to table when they have both view-data and create-queries permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow access to venues and categories tables for the card with join
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          ;; Allow full access to checkins table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-with-join-card-id :id} {:collection_id (u/the-id collection)
                                                                       :dataset_query (mt/mbql-query venues
                                                                                        {:fields [$id $name $category_id]
                                                                                         :joins [{:fields :all
                                                                                                  :source-table (mt/id :categories)
                                                                                                  :alias "cat"
                                                                                                  :condition [:= $category_id
                                                                                                              [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                                                                         :order-by [[:asc $id]]
                                                                                         :limit 5})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-with-join-card-id)
                                  :joins [{:fields :all
                                           :source-table (mt/id :checkins)
                                           :alias "checkins"
                                           :condition [:= [:field (mt/id :venues :id) {:base-type :type/Integer}]
                                                       [:field (mt/id :checkins :venue_id) {:base-type :type/Integer, :join-alias "checkins"}]]}]
                                  :limit 2})]
                (mt/with-test-user :rasta
                  (testing "Should be able to run ad-hoc query with card with join as source joined to table with full permissions"
                    (is (= 2 (count (mt/rows (qp/process-query join-query))))))
                  (testing "Should be able to run card query with card with join as source joined to table with full permissions"
                    (mt/with-temp [:model/Card {join-card-id :id} {:collection_id (u/the-id collection)
                                                                   :dataset_query join-query}]
                      (binding [qp.perms/*card-id* join-card-id]
                        (is (= 2 (count (mt/rows (qp/process-query join-query)))))))))))))))))

(deftest e2e-multi-stage-aggregation-source-card-permissions-test
  (testing "Permissions are checked correctly for ad-hoc queries using source cards with multiple aggregation stages"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :reviews) :perms/view-data :blocked)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            ;; Create a card with an aggregated query (first stage of aggregation)
            (let [source-card-query (mt/mbql-query nil
                                      {:source-query (:query (mt/mbql-query checkins
                                                               {:aggregation [[:count]]
                                                                :breakout [[:field (mt/id :checkins :date) {:temporal-unit :month}]]}))
                                       :aggregation [[:count]]
                                       :limit 1
                                       :breakout [[:field "DATE"
                                                   {:base-type :type/DateTime
                                                    :temporal-unit :month}]]})
                  expected [["2013-01-01T00:00:00Z" 1]]]
              (mt/with-temp [:model/Card {source-card-id :id} {:collection_id (u/the-id collection)
                                                               :dataset_query source-card-query}]
                (let [multi-stage-query (mt/mbql-query nil {:source-table (format "card__%d" source-card-id)})]
                  (testing "Should be able to run ad-hoc query that adds second aggregation stage using source card"
                    (mt/with-test-user :rasta
                      ;; Create an ad-hoc query that uses the source card and adds another aggregation stage
                      ;; Should successfully run the multi-stage aggregation query
                      (is (= expected (mt/rows (qp/process-query (qp/userland-query multi-stage-query)))))))

                  (testing "Should NOT be able to run the same query if source card permissions are revoked"
                    ;; Remove collection permissions
                    (perms/revoke-collection-permissions! (perms/all-users-group) collection)
                    (mt/with-test-user :rasta
                      ;; Should return failed result with permission error
                      (let [result (qp/process-query (qp/userland-query multi-stage-query))]
                        (is (= :failed (:status result)))
                        (is (re-find #"You do not have permissions to view Card" (:error result)))))))))))))))
