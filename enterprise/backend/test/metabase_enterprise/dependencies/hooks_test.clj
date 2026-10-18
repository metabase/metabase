(ns metabase-enterprise.dependencies.hooks-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.hooks]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.batch-processing.core :as grouper]
   [metabase.lib.core :as lib]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.hooks/keep-me)

(def ^:private table-query deps.test/table-query)

(def ^:private card-query deps.test/card-query)

(defn- pending?
  "Whether the dependencies of the entity `entity-type` `entity-id` were not computed from its current version."
  [entity-type entity-id]
  (boolean (some #(= entity-id (:id %))
                 (dependencies.db/entities-for-dependency-calculation
                  entity-type 100000 models.dependency/current-dependency-analysis-version))))

(defn- computed!
  "Record that the dependencies of the entity `entity-type` `entity-id` were computed from its current version."
  [entity-type entity-id]
  (doseq [[instance version] (deps.dependency-status/instances-for-dependency-calculation entity-type 100000)
          :when              (= entity-id (:id instance))]
    (deps.dependency-status/upsert-status! entity-type entity-id version false)))

(defn- status-row-count []
  (reduce + (map t2/count [:model/DependencyStatus :model/ResultMetadataStatus :model/AnalysisFindingStatus
                           :model/AnalysisFinding])))

(deftest card-update-writes-nothing-test
  (testing "updating a card writes no status, and triggers the jobs once it commits"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (let [submitted (atom [])
              before    (status-row-count)]
          (mt/with-dynamic-fn-redefs [grouper/submit! (fn [_queue write] (swap! submitted conj write))]
            (deps.test/do-with-immediate-hook-writes
             #(t2/update! :model/Card card-id {:dataset_query (table-query :orders)})))
          (is (= before (status-row-count)))
          (is (= [{:dependency-jobs true}] @submitted)))))))

(deftest card-update-without-feature-test
  (testing "without the dependencies feature the hooks trigger nothing"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (let [submitted (atom [])]
          (mt/with-dynamic-fn-redefs [grouper/submit! (fn [_queue write] (swap! submitted conj write))]
            (deps.test/do-with-immediate-hook-writes
             #(t2/update! :model/Card card-id {:dataset_query (table-query :orders)})))
          (is (= [] @submitted)))))))

(deftest card-version-test
  (testing "any update of a card changes its version"
    (mt/test-helpers-set-global-values!
      (mt/with-model-cleanup [:model/DependencyStatus]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
          (computed! :card card-id)
          (is (not (pending? :card card-id)))
          (t2/update! :model/Card card-id {:name "Renamed"})
          (is (pending? :card card-id)))))))

(deftest dashboard-version-test
  (testing "inserting, updating and deleting a dashboard card, a series or a tab changes the dashboard's version"
    (mt/test-helpers-set-global-values!
      (mt/with-model-cleanup [:model/DependencyStatus]
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                       :model/Card      {card-id :id}      {:dataset_query (table-query :products)}
                       :model/Card      {other-id :id}     {:dataset_query (table-query :orders)}]
          (let [changes? (fn [write!]
                           (computed! :dashboard dashboard-id)
                           (write!)
                           (pending? :dashboard dashboard-id))
                dashcard (atom nil)]
            (testing "inserting a dashboard card"
              (is (changes? #(reset! dashcard (t2/insert-returning-pk! :model/DashboardCard
                                                                       {:dashboard_id dashboard-id :card_id card-id
                                                                        :row 0 :col 0 :size_x 4 :size_y 4})))))
            (testing "pointing a dashboard card at another card"
              (is (changes? #(t2/update! :model/DashboardCard @dashcard {:card_id other-id}))))
            (testing "adding a series"
              (is (changes? #(t2/insert! :model/DashboardCardSeries {:dashboardcard_id @dashcard :card_id card-id
                                                                     :position 0}))))
            (testing "removing a series"
              (is (changes? #(t2/delete! :model/DashboardCardSeries :dashboardcard_id @dashcard))))
            (testing "adding and removing a tab"
              (let [tab-id (atom nil)]
                (is (changes? #(reset! tab-id (t2/insert-returning-pk! :model/DashboardTab
                                                                       {:dashboard_id dashboard-id :name "Tab"
                                                                        :position 0}))))
                (is (changes? #(t2/delete! :model/DashboardTab :id @tab-id)))))
            (testing "removing a dashboard card"
              (is (changes? #(t2/delete! :model/DashboardCard :id @dashcard))))
            (testing "nothing else"
              (computed! :dashboard dashboard-id)
              (is (not (pending? :dashboard dashboard-id))))))))))

(deftest table-version-test
  (testing "a write of a table, of one of its fields, field user settings or dimensions, changes its version"
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus :model/ResultMetadataStatus]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
            (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                           :to_entity_type   :table :to_entity_id (mt/id :venues)})
            (let [table-id (mt/id :venues)
                  field-id (mt/id :venues :price)
                  changes? (fn [write!]
                             (doseq [{:keys [entity_id status_id status_updated_at version_updated_at version_count]}
                                     (dependencies.db/entities-with-changed-version :model/ResultMetadataStatus
                                                                                    :table 100000)
                                     :when (= table-id entity_id)]
                               (dependencies.db/record-status-version! :model/ResultMetadataStatus :table table-id
                                                                       status_id status_updated_at
                                                                       version_updated_at version_count))
                             (write!)
                             (deps.test/result-metadata-pending? :table table-id))]
              (mt/with-temp-vals-in-db :model/Table table-id {:display_name "Venues"}
                (is (changes? #(t2/update! :model/Table table-id {:display_name "Places"}))))
              (mt/with-temp-vals-in-db :model/Field field-id {:display_name "Price"}
                (is (changes? #(t2/update! :model/Field field-id {:display_name "Cost"}))))
              (mt/with-temp [:model/FieldUserSettings _ {:field_id field-id :display_name "Cost"}]
                (is (changes? (fn [] (t2/update! :model/FieldUserSettings :field_id field-id {:display_name "Price"})))))
              (let [dimension-id (atom nil)]
                (is (changes? #(reset! dimension-id (t2/insert-returning-pk! :model/Dimension
                                                                             {:field_id field-id :name "Price"
                                                                              :type :internal}))))
                (is (changes? #(t2/delete! :model/Dimension :id @dimension-id)))))))))))

(deftest entity-delete-test
  (testing "the dependency job drops the dependencies and status of a deleted entity"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :products)}]
        (t2/insert! :model/Dependency {:from_entity_type "card" :from_entity_id card-id
                                       :to_entity_type "table" :to_entity_id (mt/id :products)})
        (computed! :card card-id)
        (t2/delete! :model/Card :id card-id)
        (deps.test/synchronously-run-dependency-job!)
        (is (not (t2/exists? :model/Dependency :from_entity_type "card" :from_entity_id card-id)))
        (is (not (t2/exists? :model/DependencyStatus :entity_type "card" :entity_id card-id)))))))

(deftest concurrent-saves-of-dependent-cards-commit-test
  (testing "saving a card and then its dependent in one transaction, while another request saves the dependent, commits both"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency :model/DependencyStatus]
        (let [insert-card! (fn [query]
                             (t2/insert-returning-pk! :model/Card {:name                   (mt/random-name)
                                                                   :display                :table
                                                                   :visualization_settings {}
                                                                   :creator_id             (mt/user->id :crowberto)
                                                                   :database_id            (mt/id)
                                                                   :dataset_query          query}))
              card-a       (insert-card! (table-query :products))
              card-b       (insert-card! (card-query card-a))
              a-saved      (promise)
              save!        (fn [thunk]
                             (future
                               (try
                                 (thunk)
                                 :committed
                                 (catch Throwable e
                                   (ex-message (or (ex-cause e) e))))))]
          (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-b
                                         :to_entity_type   :card :to_entity_id   card-a})
          (let [cascade (save! #(t2/with-transaction [_conn]
                                  (t2/update! :model/Card card-a {:dataset_query (table-query :orders)})
                                  (deliver a-saved true)
                                  (t2/update! :model/Card card-b {:dataset_query (lib/limit (card-query card-a) 5)})))
                single  (save! #(do (deref a-saved 10000 nil)
                                    (t2/update! :model/Card card-b {:dataset_query (lib/limit (card-query card-a) 11)})))]
            (is (= [:committed :committed]
                   [(deref cascade 30000 :timeout) (deref single 30000 :timeout)]))))))))

(deftest serdes-load-triggers-jobs-once-test
  (testing "a serdes load triggers no job while it writes, and the jobs once it finishes"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card          {card-id :id}      {:dataset_query (table-query :products)}
                     :model/Dashboard     {dashboard-id :id} {}
                     :model/DashboardCard _                  {:dashboard_id dashboard-id :card_id card-id}]
        (let [exported  (ts/extract-one "Dashboard" dashboard-id)
              submitted (atom [])
              triggered (atom 0)]
          (t2/insert! :model/DashboardCard {:dashboard_id dashboard-id :card_id card-id
                                            :row 4 :col 0 :size_x 4 :size_y 4})
          (mt/with-dynamic-fn-redefs [grouper/submit!                         (fn [_queue write] (swap! submitted conj write))
                                      task.dependency/trigger-dependency-job! (fn [] (swap! triggered inc))]
            (deps.test/do-with-immediate-hook-writes
             #(serdes/with-cache
                (serdes.load/load-metabase! (ts/ingestion-in-memory [exported]) :reindex? false))))
          (is (= 1 (t2/count :model/DashboardCard :dashboard_id dashboard-id)))
          (is (= [] @submitted))
          (is (= 1 @triggered)))))))
