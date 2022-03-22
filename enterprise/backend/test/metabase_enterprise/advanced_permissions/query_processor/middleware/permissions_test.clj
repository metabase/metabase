(ns metabase-enterprise.advanced-permissions.query-processor.middleware.permissions-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.advanced-permissions.models.permissions :as ee.perms]
            [metabase-enterprise.advanced-permissions.query-processor.middleware.permissions :as ee.qp.perms]
            [metabase.api.dataset :as dataset] [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.query-processor.context.default :as context.default]
            [metabase.test :as mt]
            [metabase.util :as u])
  (:import clojure.lang.ExceptionInfo))

(defn- do-with-download-perms
  [db-or-id graph f]
  (let [all-users-group-id           (u/the-id (group/all-users))
        db-id                        (u/the-id db-or-id)
        current-download-perms-graph (get-in (perms/data-perms-graph)
                                             [:groups all-users-group-id db-id :download])]
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (ee.perms/update-db-download-permissions! all-users-group-id db-id graph)
      (try
        (f)
        (finally
          (ee.perms/update-db-download-permissions! all-users-group-id db-id current-download-perms-graph))))))

(defmacro ^:private with-download-perms
  "Runs `f` with the download perms for `db-or-id` set to the values in `graph` for the All Users permissions group."
  [db-or-id graph & body]
  `(do-with-download-perms ~db-or-id ~graph (fn [] ~@body)))

(defn- do-with-download-perms-for-db
  [db-or-id value f]
  (do-with-download-perms db-or-id {:native value, :schemas value} f))

(defmacro ^:private with-download-perms-for-db
  "Runs `body` with the download perms for `db-or-id` set to `value` for the All Users permissions group."
  [db-or-id value & body]
  `(do-with-download-perms-for-db ~db-or-id ~value (fn [] ~@body)))

(defn- mbql-download-query
  ([]
   (mbql-download-query 'venues))

  ([table-name]
   (-> {:database (mt/id)
        :type :query
        :query {:source-table (mt/id table-name)}
        :info {:context (dataset/export-format->context :csv)}})))

(defn- native-download-query []
  {:database (mt/id)
   :type     :native
   :native   {:query "select * from venues"}
   :info     {:context (dataset/export-format->context :csv)}})

(defn- download-limit
  [query]
  (-> query
      (ee.qp.perms/apply-download-limit)
      (get-in [:query :limit])))

(deftest apply-download-limit-test
  (let [limited-download-max-rows @#'ee.qp.perms/max-rows-in-limited-downloads]
    (with-download-perms-for-db (mt/id) :limited
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
          (is (= (native-download-query) (ee.qp.perms/apply-download-limit (native-download-query)))))))

    (with-download-perms (mt/id) {:schemas {"PUBLIC" {(mt/id 'venues) :limited
                                                      (mt/id 'checkins) :full}}}
      (mt/with-current-user (mt/user->id :rasta)
        (testing "A limit is added to MBQL queries if the user has limited download permissions for a table which
                 the query references"
          (is (= limited-download-max-rows
                 (download-limit (mbql-download-query)))))

        (testing "If the query does not reference the table, a limit is not added"
          (is (nil? (download-limit (mbql-download-query 'checkins)))))))))

;; Inspired by the similar middleware wrapper [[metabase.query-processor.middleware.limit-test/limit]]
(defn- limit-download-result-rows [query]
  (let [rff (ee.qp.perms/limit-download-result-rows query context.default/default-rff)
        rf  (rff {})]
    (transduce identity rf (repeat (inc @#'ee.qp.perms/max-rows-in-limited-downloads) [:ok]))))

(deftest limit-download-result-rows-test
  (let [limited-download-max-rows @#'ee.qp.perms/max-rows-in-limited-downloads]
    (with-download-perms-for-db (mt/id) :limited
      (mt/with-current-user (mt/user->id :rasta)
        (testing "The number of rows in a native query result is limited if the user has limited download permissions"
          (is (= limited-download-max-rows
                 (-> (native-download-query) limit-download-result-rows mt/rows count))))))

    (with-download-perms-for-db (mt/id) :full
      (mt/with-current-user (mt/user->id :rasta)
        (testing "The number of rows in a native query result is not limited if the user has full download permissions"
          (is (= (inc limited-download-max-rows)
                 (-> (native-download-query) limit-download-result-rows mt/rows count))))))))

(defn- check-download-permisions [query]
  (:pre (mt/test-qp-middleware ee.qp.perms/check-download-permissions query)))

(def ^:private download-perms-error-msg #"You do not have permissions to download the results of this query\.")

(deftest check-download-permissions-test
  (testing "An exception is thrown if the user does not have download permissions for the DB"
    (with-download-perms-for-db (mt/id) :none
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg?
             ExceptionInfo
             download-perms-error-msg
             (check-download-permisions (mbql-download-query)))))))

  (testing "No exception is thrown if the user has any download permissions for the DB"
    (with-download-perms-for-db (mt/id) :full
      (mt/with-current-user (mt/user->id :rasta)
        (is (= (mbql-download-query)
               (check-download-permisions (mbql-download-query))))))

    (with-download-perms-for-db (mt/id) :limited
      (mt/with-current-user (mt/user->id :rasta)
        (is (= (mbql-download-query)
               (check-download-permisions (mbql-download-query))))))))
