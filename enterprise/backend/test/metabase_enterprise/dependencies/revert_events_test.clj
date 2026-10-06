(ns metabase-enterprise.dependencies.revert-events-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.dependencies.async :as dependencies.async]
   [metabase-enterprise.dependencies.metadata-update :as metadata-update]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(defn- await-dependency-tasks!
  "Waits until the dependency executor finished the tasks submitted before this call."
  []
  @(dependencies.async/submit! (fn [] nil)))

(defn- push-revision! [model id creation?]
  (revision/push-revision! {:entity       model
                            :id           id
                            :object       (t2/select-one model :id id)
                            :user-id      (mt/user->id :crowberto)
                            :is-creation? creation?}))

(defn- first-revision-id [model id]
  (t2/select-one-pk :model/Revision :model (name model) :model_id id {:order-by [[:id :asc]]}))

(defn- revert-to-first-revision! [entity model id]
  (mt/user-http-request :crowberto :post 200 "revision/revert"
                        {:entity entity :id id :revision_id (first-revision-id model id)}))

(defn- table-dependencies [entity-type id]
  (t2/select-fn-set :to_entity_id :model/Dependency
                    :from_entity_type entity-type :from_entity_id id :to_entity_type :table))

(defn- result-column-counts [card-ids]
  (t2/select-fn-set (comp count :result_metadata) :model/Card :id [:in card-ids]))

(deftest card-query-revert-updates-dependencies-and-dependent-metadata-test
  (mt/with-premium-features #{:dependencies}
    (mt/with-model-cleanup [:model/AnalysisFinding :model/DependencyStatus :model/Dependency]
      (let [mp       (mt/metadata-provider)
            products (lib.metadata/table mp (mt/id :products))
            orders   (lib.metadata/table mp (mt/id :orders))]
        (mt/with-temp [:model/Card {parent-id :id :as parent} {:dataset_query (lib/query mp products)}
                       :model/Card {child-id :id}             {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                       :model/Dependency _ {:from_entity_type :card :from_entity_id child-id
                                            :to_entity_type   :card :to_entity_id   parent-id}]
          (push-revision! :model/Card parent-id true)
          (t2/update! :model/Card parent-id {:dataset_query (lib/query mp orders)})
          (push-revision! :model/Card parent-id false)
          (mt/with-test-user :crowberto
            (events/publish-event! :event/card-update {:object          (t2/select-one :model/Card :id parent-id)
                                                       :previous-object parent
                                                       :user-id         (mt/user->id :crowberto)}))
          (await-dependency-tasks!)
          (deps.test/synchronously-run-backfill!)
          (testing "before the revert, the card reads orders and its dependent has the orders columns"
            (is (= #{(mt/id :orders)} (table-dependencies :card parent-id)))
            (is (= #{9} (result-column-counts [parent-id child-id]))))
          (let [previous-source-tables (atom [])
                update-metadata!       (mt/original-fn #'metadata-update/update-dependent-mbql-cards-metadata!)]
            (mt/with-dynamic-fn-redefs [metadata-update/update-dependent-mbql-cards-metadata!
                                        (fn [mp start-type start-id previous-object metadata-type]
                                          (swap! previous-source-tables conj
                                                 (lib/primary-source-table-id (:dataset_query previous-object)))
                                          (update-metadata! mp start-type start-id previous-object metadata-type))]
              (revert-to-first-revision! "card" :model/Card parent-id)
              (await-dependency-tasks!))
            (deps.test/synchronously-run-backfill!)
            (testing "after the revert, the graph points at products again"
              (is (= #{(mt/id :products)} (table-dependencies :card parent-id))))
            (testing "the metadata update ran once, with the query from before the revert as the previous query"
              (is (= [(mt/id :orders)] @previous-source-tables)))
            (testing "the dependent has the products columns again"
              (is (= #{8} (result-column-counts [child-id]))))))))))

(defn- segment-definition [table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider (t2/select-one-fn :db_id :model/Table :id table-id))]
    (-> (lib/query mp (lib.metadata/table mp table-id))
        (lib/filter (lib/> (lib.metadata/field mp field-id) 0)))))

(deftest segment-revert-updates-dependencies-test
  (mt/with-premium-features #{:dependencies}
    (mt/with-model-cleanup [:model/AnalysisFinding :model/DependencyStatus :model/Dependency]
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                      :definition (segment-definition (mt/id :venues) (mt/id :venues :price))}]
        (push-revision! :model/Segment segment-id true)
        (t2/update! :model/Segment segment-id {:definition (segment-definition (mt/id :users) (mt/id :users :id))})
        (push-revision! :model/Segment segment-id false)
        (mt/with-test-user :crowberto
          (events/publish-event! :event/segment-update {:object  (t2/select-one :model/Segment :id segment-id)
                                                        :user-id (mt/user->id :crowberto)}))
        (deps.test/synchronously-run-backfill!)
        (testing "before the revert, the segment depends on users"
          (is (= #{(mt/id :users)} (table-dependencies :segment segment-id))))
        (revert-to-first-revision! "segment" :model/Segment segment-id)
        (deps.test/synchronously-run-backfill!)
        (testing "after the revert, the segment depends on venues again"
          (is (= #{(mt/id :venues)} (table-dependencies :segment segment-id))))))))
