(ns metabase-enterprise.dependencies.hooks-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.hooks]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.hooks/keep-me)

(defn- stale? [entity-type entity-id]
  (t2/exists? :model/DependencyStatus :entity_type entity-type :entity_id entity-id :stale true))

(defn- table-query [table]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table)))))

(deftest card-update-test
  (testing "updating a card marks it stale only when a column its dependencies come from changes"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/DependencyStatus]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
          (deps.dependency-status/upsert-status! :card card-id)
          (t2/update! :model/Card card-id {:name "Renamed"})
          (is (not (stale? :card card-id)))
          (t2/update! :model/Card card-id {:dataset_query (table-query :orders)})
          (is (stale? :card card-id)))))))

(deftest card-update-without-feature-test
  (testing "without the dependencies feature the hooks do nothing"
    (mt/with-premium-features #{}
      (mt/with-model-cleanup [:model/DependencyStatus]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
          (deps.dependency-status/upsert-status! :card card-id)
          (t2/update! :model/Card card-id {:dataset_query (table-query :orders)})
          (is (not (stale? :card card-id))))))))

(deftest dashboard-card-test
  (testing "inserting, updating and deleting a dashboard card, or adding a series, marks its dashboard stale"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/DependencyStatus]
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                       :model/Card      {card-id :id}      {:dataset_query (table-query :products)}
                       :model/Card      {other-id :id}     {:dataset_query (table-query :orders)}]
          (let [processed! #(deps.dependency-status/upsert-status! :dashboard dashboard-id)]
            (processed!)
            (let [dashcard-id (t2/insert-returning-pk! :model/DashboardCard
                                                       {:dashboard_id dashboard-id :card_id card-id
                                                        :row 0 :col 0 :size_x 4 :size_y 4})]
              (testing "inserting a dashboard card"
                (is (stale? :dashboard dashboard-id)))
              (processed!)
              (t2/update! :model/DashboardCard dashcard-id {:row 1})
              (testing "moving a dashboard card"
                (is (not (stale? :dashboard dashboard-id))))
              (t2/update! :model/DashboardCard dashcard-id {:card_id other-id})
              (testing "pointing a dashboard card at another card"
                (is (stale? :dashboard dashboard-id)))
              (processed!)
              (t2/insert! :model/DashboardCardSeries {:dashboardcard_id dashcard-id :card_id card-id :position 0})
              (testing "adding a series"
                (is (stale? :dashboard dashboard-id)))
              (processed!)
              (t2/delete! :model/DashboardCard :id dashcard-id)
              (testing "removing a dashboard card"
                (is (stale? :dashboard dashboard-id))))))))))

(deftest entity-delete-test
  (testing "deleting an entity drops its dependencies and status"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (t2/insert! :model/Dependency {:from_entity_type "card" :from_entity_id card-id
                                       :to_entity_type "table" :to_entity_id (mt/id :products)})
        (deps.dependency-status/upsert-status! :card card-id)
        (t2/delete! :model/Card :id card-id)
        (is (not (t2/exists? :model/Dependency :from_entity_type "card" :from_entity_id card-id)))
        (is (not (t2/exists? :model/DependencyStatus :entity_type "card" :entity_id card-id)))))))
