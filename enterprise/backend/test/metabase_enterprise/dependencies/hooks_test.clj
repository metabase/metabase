(ns metabase-enterprise.dependencies.hooks-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.hooks]
   [metabase-enterprise.dependencies.metadata-update :as deps.metadata-update]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.test-util :as deps.test]
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

(defn- card-query [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

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
  (testing "deleting an entity marks its status stale, and the backfill drops its dependencies and status"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (t2/insert! :model/Dependency {:from_entity_type "card" :from_entity_id card-id
                                       :to_entity_type "table" :to_entity_id (mt/id :products)})
        (deps.dependency-status/upsert-status! :card card-id)
        (t2/delete! :model/Card :id card-id)
        (is (stale? :card card-id))
        (deps.test/synchronously-run-backfill!)
        (is (not (t2/exists? :model/Dependency :from_entity_type "card" :from_entity_id card-id)))
        (is (not (t2/exists? :model/DependencyStatus :entity_type "card" :entity_id card-id)))))))

(deftest concurrent-saves-of-dependent-cards-commit-test
  (testing "saving a card and then its dependent in one transaction, while another request saves the dependent, commits both"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/DependencyStatus]
        (let [insert-card!    (fn [query]
                                (t2/insert-returning-pk! :model/Card {:name                   (mt/random-name)
                                                                      :display                :table
                                                                      :visualization_settings {}
                                                                      :creator_id             (mt/user->id :crowberto)
                                                                      :database_id            (mt/id)
                                                                      :dataset_query          query}))
              card-a          (insert-card! (table-query :products))
              card-b          (insert-card! (card-query card-a))
              a-saved         (promise)
              b-status-marked (promise)
              save!           (fn [thunk]
                                (future
                                  (try
                                    (thunk)
                                    :committed
                                    (catch Throwable e
                                      (ex-message (or (ex-cause e) e))))))
              mark-stale!     (mt/original-fn #'deps.dependency-status/mark-stale!)]
          (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-b
                                         :to_entity_type   :card :to_entity_id   card-a})
          (doseq [card-id [card-a card-b]]
            (deps.dependency-status/upsert-status! :card card-id)
            (deps.analysis-finding/upsert-analysis! :card card-id true []))
          (mt/with-dynamic-fn-redefs [deps.metadata-update/card-updated! (constantly nil)
                                      deps.dependency-status/mark-stale!
                                      (fn [entity-type entity-ids]
                                        (mark-stale! entity-type entity-ids)
                                        (when (= [:card [card-b]] [entity-type entity-ids])
                                          (deliver b-status-marked true)))]
            (let [cascade (save! #(t2/with-transaction [_conn]
                                    (t2/update! :model/Card card-a {:dataset_query (table-query :orders)})
                                    (deliver a-saved true)
                                    (deref b-status-marked 10000 nil)
                                    (t2/update! :model/Card card-b {:dataset_query (lib/limit (card-query card-a) 5)})))
                  single  (save! #(do (deref a-saved 10000 nil)
                                      (t2/update! :model/Card card-b {:dataset_query (lib/limit (card-query card-a) 11)})))]
              (is (= [:committed :committed]
                     [(deref cascade 30000 :timeout) (deref single 30000 :timeout)])))))))))
