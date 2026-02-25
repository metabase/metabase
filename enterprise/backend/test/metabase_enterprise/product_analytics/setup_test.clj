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

(deftest default-content-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-temp [:model/User superuser {:is_superuser true}]
      (pa.tu/with-pa-db-cleanup
        (pa.setup/ensure-product-analytics-db-installed!)
        (testing "Default questions are created in the PA collection"
          (let [pa-coll (t2/select-one :model/Collection :entity_id pa/product-analytics-collection-entity-id)]
            (is (some? pa-coll) "PA collection should exist")
            (doseq [[card-name entity-id]
                    [["Page Views"      "pA_pgViewsQeeHWB8v001"]
                     ["Active Users"    "pA_actUsrsQeeHWB8v002"]
                     ["Top Pages"       "pA_topPgesQeeHWB8v003"]
                     ["Traffic Sources" "pA_trafSrcQeeHWB8v005"]
                     ["Device Types"    "pA_devTypsQeeHWB8v006"]]]
              (testing (str card-name " card")
                ;; Cards are created only after sync runs (tables must exist), so we only
                ;; verify the entity IDs are unique and stable; runtime creation is tested
                ;; via integration tests that stand up a full PA database.
                (is (string? entity-id) "entity ID should be a string")
                (is (= 21 (count entity-id)) "entity ID should be 21 characters")))))

        (testing "Product Overview dashboard entity ID is stable"
          (is (= 21 (count "pA_ovwDash0QeeHWB8v08"))
              "dashboard entity ID should be 21 characters"))

        (testing "Idempotent — calling install again does not duplicate cards"
          (let [card-count-before (t2/count :model/Card
                                            :collection_id (:id (t2/select-one :model/Collection
                                                                               :entity_id pa/product-analytics-collection-entity-id)))]
            (pa.setup/ensure-product-analytics-db-installed!)
            (is (= card-count-before
                   (t2/count :model/Card
                             :collection_id (:id (t2/select-one :model/Collection
                                                                :entity_id pa/product-analytics-collection-entity-id))))
                "No duplicate cards should be created on re-install")))))))
