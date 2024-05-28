(ns metabase-enterprise.advanced-permissions.query-processor.middleware.permissions-test
  (:require
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
    :as ee.qp.perms]
   [metabase.api.dataset :as api.dataset]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.streaming-test :as streaming-test]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- do-with-download-perms!
  [db-or-id graph f]
  (let [all-users-group-id (u/the-id (perms-group/all-users))
        db-id              (u/the-id db-or-id)
        revision           (:revision (data-perms.graph/api-graph))]
    (mt/with-premium-features #{:advanced-permissions}
      (perms.test-util/with-restored-perms!
        (perms.test-util/with-restored-data-perms!
          (data-perms.graph/update-data-perms-graph! {:revision revision
                                                      :groups   {all-users-group-id {db-id {:download graph}}}})
          (f))))))

(defmacro ^:private with-download-perms!
  "Runs `f` with the download perms for `db-or-id` set to the values in `graph` for the All Users permissions group."
  [db-or-id graph & body]
  `(do-with-download-perms! ~db-or-id ~graph (fn [] ~@body)))

(defn- do-with-download-perms-for-db!
  [db-or-id value f]
  (do-with-download-perms! db-or-id {:schemas value} f))

(defmacro ^:private with-download-perms-for-db!
  "Runs `body` with the download perms for `db-or-id` set to `value` for the All Users permissions group."
  [db-or-id value & body]
  `(do-with-download-perms-for-db! ~db-or-id ~value (fn [] ~@body)))

(defn- mbql-download-query
  ([]
   (mbql-download-query 'venues))

  ([table-name]
   (-> {:database (mt/id)
        :type     :query
        :query    {:source-table (mt/id table-name)}
        :info     {:context (api.dataset/export-format->context :csv)}})))

(defn- native-download-query []
  {:database (mt/id)
   :type     :native
   :native   {:query "select * from venues"}
   :info     {:context (api.dataset/export-format->context :csv)}})

(defn- download-limit
  [query]
  (-> query
      (ee.qp.perms/apply-download-limit)
      (get-in [:query :limit])))

(deftest apply-download-limit-test
  (let [limited-download-max-rows @#'ee.qp.perms/max-rows-in-limited-downloads]
    (with-download-perms-for-db! (mt/id) :limited
      (mt/with-current-user (mt/user->id :rasta)
        (testing "A limit is added to MBQL queries if the user has limited download permissions for the DB"
          (is (= limited-download-max-rows
                 (download-limit (mbql-download-query)))))

        (testing "If the query already has a limit lower than the download limit, the limit is not changed"
          (is (= (dec limited-download-max-rows)
                 (download-limit (assoc-in (mbql-download-query)
                                           [:query :limit]
                                           (dec limited-download-max-rows))))))

        (testing "Native queries are unmodified"
          (is (= (native-download-query) (ee.qp.perms/apply-download-limit (native-download-query))))))

      (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id 'venues) :limited
                                                         (mt/id 'checkins) :full}}}
        (mt/with-current-user (mt/user->id :rasta)
          (testing "A limit is added to MBQL queries if the user has limited download permissions for a table which
                     the query references"
            (is (= limited-download-max-rows
                   (download-limit (mbql-download-query)))))

          (testing "If the query does not reference the table, a limit is not added"
            (is (nil? (download-limit (mbql-download-query 'checkins))))))))))

;; Inspired by the similar middleware wrapper [[metabase.query-processor.middleware.limit-test/limit]]
(defn- limit-download-result-rows [query]
  (let [rff (ee.qp.perms/limit-download-result-rows query qp.reducible/default-rff)
        rf  (rff {})]
    (transduce identity rf (repeat (inc @#'ee.qp.perms/max-rows-in-limited-downloads) [:ok]))))

(deftest limit-download-result-rows-test
  (let [limited-download-max-rows @#'ee.qp.perms/max-rows-in-limited-downloads]
    (with-download-perms-for-db! (mt/id) :limited
      (mt/with-current-user (mt/user->id :rasta)
        (testing "The number of rows in a native query result is limited if the user has limited download permissions"
          (is (= limited-download-max-rows
                 (-> (native-download-query) limit-download-result-rows mt/rows count))))))

    (with-download-perms-for-db! (mt/id) :full
      (mt/with-current-user (mt/user->id :rasta)
        (testing "The number of rows in a native query result is not limited if the user has full download permissions"
          (is (= (inc limited-download-max-rows)
                 (-> (native-download-query) limit-download-result-rows mt/rows count))))))))

(defn- check-download-permisions [query]
  (let [qp (ee.qp.perms/check-download-permissions
            (fn [query _rff]
              query))]
    (qp query qp.reducible/default-rff)))

(def ^:private download-perms-error-msg #"You do not have permissions to download the results of this query\.")

(deftest check-download-permissions-test
  (testing "An exception is thrown if the user does not have download permissions for the DB"
    (with-download-perms-for-db! (mt/id) :none
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg?
             ExceptionInfo
             download-perms-error-msg
             (check-download-permisions (mbql-download-query))))

        (testing "No exception is thrown for non-download queries"
          (let [query (dissoc (mbql-download-query 'venues) :info)]
            (is (= query (check-download-permisions query)))))))))

(deftest check-download-permissions-test-2
  (testing "No exception is thrown if the user has any (full or limited) download permissions for the DB"
    (with-download-perms-for-db! (mt/id) :full
      (mt/with-current-user (mt/user->id :rasta)
        (is (= (mbql-download-query)
               (check-download-permisions (mbql-download-query))))))

    (with-download-perms-for-db! (mt/id) :limited
      (mt/with-current-user (mt/user->id :rasta)
        (is (= (mbql-download-query)
               (check-download-permisions (mbql-download-query))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                E2E tests                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- csv-row-count
  [results]
  (count
   ;; Ignore first row, since it's the header
   (rest (csv/read-csv results))))

(deftest limited-download-perms-test
  (testing "Limited download perms work as expected"
    (mt/with-full-data-perms-for-all-users!
      (with-redefs [ee.qp.perms/max-rows-in-limited-downloads 3]
        (with-download-perms-for-db! (mt/id) :limited
          (streaming-test/do-test!
           "A user with limited download perms for a DB has their query results limited"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id 'venues)
                                    :limit    10}}
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}})

          (streaming-test/do-test!
           "An admin has full download permissions, even if downloads for All Users are limited"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id 'venues)
                                    :limit    10}}
            :user       :crowberto
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}}))

        (with-download-perms! (mt/id) {:schemas {"PUBLIC" :limited}}
          (streaming-test/do-test!
           "A user with limited download perms for a schema has their query results limited for queries on that schema"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id 'venues)
                                    :limit    10}}
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}}))

        (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id 'users)      :full
                                                           (mt/id 'categories) :full
                                                           (mt/id 'venues)     :limited
                                                           (mt/id 'checkins)   :full
                                                           (mt/id 'products)   :limited
                                                           (mt/id 'people)     :limited
                                                           (mt/id 'reviews)    :limited
                                                           (mt/id 'orders)     :limited}}}
          (streaming-test/do-test!
           "A user with limited download perms for a table has their query results limited for queries on that table"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id 'venues)
                                    :limit        10}}
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}})

          (streaming-test/do-test!
           "A user with limited download perms for a table still has full download perms for MBQL queries on other tables"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id 'users)
                                    :limit        10}}
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}})

          (streaming-test/do-test!
           "A user with limited download perms for a table has limited download perms for native queries on all tables"
           {:query      (mt/native-query {:query "SELECT * FROM checkins LIMIT 10;"})
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}}))))))

(deftest no-download-perms-test
  (testing "Users with no download perms cannot run download queries"
    (mt/with-full-data-perms-for-all-users!
      (with-download-perms-for-db! (mt/id) :none
        (streaming-test/do-test!
         "A user with no download perms for a DB receives an error response"
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id 'venues)
                                  :limit        10}}
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}})

        (streaming-test/do-test!
         "An admin can always run download queries, even if the All Users group has no download permissions "
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id 'venues)
                                  :limit        10}}
          :user       :crowberto
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}}))

      (with-download-perms! (mt/id) {:schemas {"PUBLIC" :none}}
        (streaming-test/do-test!
         "A user with no download perms for a schema receives an error response for download queries on that schema"
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id 'venues)
                                  :limit        10}}
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}}))

      (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id 'venues)     :none
                                                         (mt/id 'checkins)   :full
                                                         (mt/id 'users)      :full
                                                         (mt/id 'categories) :full}}}
        (streaming-test/do-test!
         "A user with no download perms for a table receives an error response for download queries on that table"
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id 'venues)
                                  :limit        10}}
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}})

        (streaming-test/do-test!
         "A user with no download perms for a table still has full download perms for MBQL queries on other tables"
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id 'users)
                                  :limit        10}}
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}})

        (streaming-test/do-test!
         "A user with no download perms for a table has no download perms for native queries on all tables"
         {:query      (mt/native-query {:query "SELECT * FROM checkins LIMIT 10;"})
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}})))))

(deftest joins-test
  (mt/with-full-data-perms-for-all-users!
    (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id 'venues)     :full
                                                       (mt/id 'checkins)   :full
                                                       (mt/id 'users)      :limited
                                                       (mt/id 'categories) :none}}}
      (with-redefs [ee.qp.perms/max-rows-in-limited-downloads 3]
        (streaming-test/do-test!
         "A user can't download the results of a query with a join if they have no permissions for one of the tables"
         {:query (mt/mbql-query venues
                   {:joins [{:source-table $$categories
                             :condition    [:= $category_id 1]}]
                    :limit 10})
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}})

        (streaming-test/do-test!
         "A user has limited downloads for a query with a join if they have limited permissions for one of the tables"
         {:query (mt/mbql-query checkins
                   {:joins [{:source-table $$users
                             :condition    [:= $user_id 1]}]
                    :limit 10})
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}})))))
