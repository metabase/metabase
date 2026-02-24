(ns metabase-enterprise.product-analytics.setup-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.setup :as pa.setup]
   [metabase-enterprise.product-analytics.test-util :as pa.tu]
   [metabase.product-analytics.core :as pa]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ensure-pa-db-installed-test
  (mt/with-premium-features #{:product-analytics}
    (testing "Creates PA DB when it does not exist"
      (pa.tu/with-pa-db-cleanup
        (pa.setup/ensure-product-analytics-db-installed!)
        (is (= pa/product-analytics-db-id
               (t2/select-one-fn :id :model/Database :is_product_analytics true))
            "PA DB should be created with the expected ID")))

    (testing "Idempotent — second call is a no-op"
      (pa.tu/with-pa-db-cleanup
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [db-count-before (t2/count :model/Database :is_product_analytics true)]
          (pa.setup/ensure-product-analytics-db-installed!)
          (is (= db-count-before (t2/count :model/Database :is_product_analytics true))
              "No duplicate DB should be created"))))

    (testing "Collection is created alongside DB"
      (pa.tu/with-pa-db-cleanup
        (pa.setup/ensure-product-analytics-db-installed!)
        (is (some? (t2/select-one :model/Collection :entity_id pa/product-analytics-collection-entity-id))
            "PA collection should exist after install")))))
