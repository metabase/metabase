(ns metabase-enterprise.product-analytics.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.permissions :as pa.perms]
   [metabase-enterprise.product-analytics.test-util :as pa.tu]
   [metabase.product-analytics.core :as pa]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(use-fixtures :once (fixtures/initialize :db))

(deftest pa-db-rejects-without-feature-test
  (testing "Without :product-analytics feature, queries to PA DB are rejected"
    (pa.tu/with-pa-db-cleanup
      (pa.tu/ensure-pa-db!)
      (mt/with-premium-features #{}
        (mt/with-test-user :crowberto
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Product Analytics requires an enterprise feature"
               (qp/process-query
                {:database pa/product-analytics-db-id
                 :type     :native
                 :native   {:query "SELECT 1"}}))))))))

(deftest pa-db-rejects-native-queries-test
  (pa.tu/with-pa-db-cleanup
    (pa.tu/ensure-pa-db!)
    (mt/with-premium-features #{:product-analytics}
      (mt/with-test-user :crowberto
        (testing "Native queries are always rejected on the PA DB"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Native queries are not allowed on the product analytics database"
               (qp/process-query
                {:database pa/product-analytics-db-id
                 :type     :native
                 :native   {:query "SELECT * FROM v_pa_events;"}}))))))))

(deftest pa-db-rejects-non-view-tables-test
  (pa.tu/with-pa-db-cleanup
    (pa.tu/ensure-pa-db!)
    (mt/with-premium-features #{:product-analytics}
      (mt/with-test-user :crowberto
        (testing "Queries to non-PA views are rejected"
          (mt/with-temp [:model/Table table {:db_id pa/product-analytics-db-id
                                             :name  "some_other_table"}
                         :model/Field _     {:table_id (u/the-id table)}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Product analytics queries are only allowed on product analytics views"
                 (qp/process-query
                  {:database pa/product-analytics-db-id
                   :type     :query
                   :query    {:source-table (u/the-id table)}})))))))))

(deftest session-data-in-allowlist-test
  (testing "PRODUCT_ANALYTICS_SESSION_DATA and PA_SESSION_DATA are in the PA table allowlist"
    (is (contains? pa.perms/pa-view-names "PRODUCT_ANALYTICS_SESSION_DATA"))
    (is (contains? pa.perms/pa-view-names "PA_SESSION_DATA"))))
