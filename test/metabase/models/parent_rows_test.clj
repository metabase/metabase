(ns metabase.models.parent-rows-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-cost
  "The answers of `check` for the first `n` rows of `model` with `ids` selected in one request, and the number of
  queries the checks ran."
  [model ids check n]
  (request/with-current-user (mt/user->id :rasta)
    (let [rows (t2/select model :id [:in (take n ids)] {:order-by [[:id :asc]]})]
      (t2/with-call-count [call-count]
        [(mapv check rows) (call-count)]))))

(defn- measure-definition
  [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id table-key))) (lib/count))))

(defn- segment-definition
  [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp (mt/id table-key)))
                (lib/not-null (lib.metadata/field mp (mt/id table-key :id))))))

(deftest field-checks-cost-test
  (testing "checks of Fields of several Tables loaded in one request cost the same for two Fields as for four"
    (let [ids (map #(t2/select-one-pk :model/Field :table_id (mt/id %)) [:venues :users :checkins :categories])]
      (doseq [check [mi/can-read? mi/can-write?]]
        (let [[two two-count] (check-cost :model/Field ids check 2)
              [all all-count] (check-cost :model/Field ids check 4)]
          (is (= two (take 2 all)))
          (is (= 4 (count all)))
          (is (= two-count all-count)))))))

(deftest measure-and-segment-checks-cost-test
  (testing "checks of Measures and Segments of several Tables loaded in one request cost the same for two rows as for three"
    (mt/with-temp [:model/Measure m1 {:table_id (mt/id :venues) :definition (measure-definition :venues)}
                   :model/Measure m2 {:table_id (mt/id :users) :definition (measure-definition :users)}
                   :model/Measure m3 {:table_id (mt/id :checkins) :definition (measure-definition :checkins)}
                   :model/Segment s1 {:table_id (mt/id :venues) :definition (segment-definition :venues)}
                   :model/Segment s2 {:table_id (mt/id :users) :definition (segment-definition :users)}
                   :model/Segment s3 {:table_id (mt/id :checkins) :definition (segment-definition :checkins)}]
      (doseq [[model ids] [[:model/Measure (map :id [m1 m2 m3])]
                           [:model/Segment (map :id [s1 s2 s3])]]
              check       [mi/can-read? mi/can-write?]]
        (testing model
          (let [[two two-count] (check-cost model ids check 2)
                [all all-count] (check-cost model ids check 3)]
            (is (= two (take 2 all)))
            (is (= 3 (count all)))
            (is (= two-count all-count))))))))

(deftest parent-row-update-test
  (testing "an update of a cached parent row in a request makes later reads of it select the new values"
    (mt/with-temp [:model/Table {table-id :id} {:display_name "Before"}]
      (request/with-current-user (mt/user->id :rasta)
        (is (= "Before" (:display_name (mi/parent-row :model/Table table-id))))
        (t2/update! :model/Table :id table-id {:display_name "After"})
        (is (= "After" (:display_name (mi/parent-row :model/Table table-id))))))))

(deftest parent-row-batch-test
  (testing "the first read of a parent row in a request selects every registered parent of that model"
    (request/with-current-user (mt/user->id :rasta)
      (doseq [table-key [:venues :users :checkins]]
        (mi/register-parent! :model/Table (mt/id table-key)))
      (t2/with-call-count [call-count]
        (is (= (mt/id :users) (:id (mi/parent-row :model/Table (mt/id :users)))))
        (is (= (mt/id :venues) (:id (mi/parent-row :model/Table (mt/id :venues)))))
        (is (= (mt/id :checkins) (:id (mi/parent-row :model/Table (mt/id :checkins)))))
        (is (= 1 (call-count)))))))

(defn- cost-is-flat
  "Checks that `check` of the first two rows of `model` with `ids` costs as many queries as of all of them, after one
  run that fills the caches that live longer than a request."
  [model ids check]
  (check-cost model ids check 2)
  (let [[two two-count] (check-cost model ids check 2)
        [all all-count] (check-cost model ids check (count ids))]
    (testing (str model " " check)
      (is (= two (take 2 all)))
      (is (= (count ids) (count all)))
      (is (= two-count all-count)))))

(deftest content-parent-checks-cost-test
  (testing "checks of rows whose parents differ cost the same for two rows as for three"
    (mt/with-temp [:model/Collection         c1 {}
                   :model/Collection         c2 {}
                   :model/Collection         c3 {}
                   :model/Timeline           t1 {:collection_id (:id c1)}
                   :model/Timeline           t2 {:collection_id (:id c2)}
                   :model/Timeline           t3 {:collection_id (:id c3)}
                   :model/TimelineEvent      e1 {:timeline_id (:id t1)}
                   :model/TimelineEvent      e2 {:timeline_id (:id t2)}
                   :model/TimelineEvent      e3 {:timeline_id (:id t3)}
                   :model/Dashboard          d1 {:collection_id (:id c1)}
                   :model/Dashboard          d2 {:collection_id (:id c2)}
                   :model/Dashboard          d3 {:collection_id (:id c3)}
                   :model/DashboardTab       tab1 {:dashboard_id (:id d1)}
                   :model/DashboardTab       tab2 {:dashboard_id (:id d2)}
                   :model/DashboardTab       tab3 {:dashboard_id (:id d3)}
                   :model/Card               k1 {:collection_id (:id c1)}
                   :model/Card               k2 {:collection_id (:id c2)}
                   :model/Card               k3 {:collection_id (:id c3)}
                   :model/CacheConfig        q1 {:model "question" :model_id (:id k1) :strategy :ttl :config {}}
                   :model/CacheConfig        q2 {:model "question" :model_id (:id k2) :strategy :ttl :config {}}
                   :model/CacheConfig        q3 {:model "question" :model_id (:id k3) :strategy :ttl :config {}}
                   :model/Exploration        x1 {:collection_id (:id c1)}
                   :model/Exploration        x2 {:collection_id (:id c2)}
                   :model/Exploration        x3 {:collection_id (:id c3)}
                   :model/ExplorationThread  th1 {:exploration_id (:id x1)}
                   :model/ExplorationThread  th2 {:exploration_id (:id x2)}
                   :model/ExplorationThread  th3 {:exploration_id (:id x3)}
                   :model/ExplorationBlock   b1 {:exploration_thread_id (:id th1)}
                   :model/ExplorationBlock   b2 {:exploration_thread_id (:id th2)}
                   :model/ExplorationBlock   b3 {:exploration_thread_id (:id th3)}
                   :model/ExplorationPage    p1 {:exploration_block_id (:id b1) :card_id (:id k1) :dimension_id "d" :query_type "default"}
                   :model/ExplorationPage    p2 {:exploration_block_id (:id b2) :card_id (:id k2) :dimension_id "d" :query_type "default"}
                   :model/ExplorationPage    p3 {:exploration_block_id (:id b3) :card_id (:id k3) :dimension_id "d" :query_type "default"}]
      (doseq [[model rows] [[:model/TimelineEvent [e1 e2 e3]]
                            [:model/DashboardTab [tab1 tab2 tab3]]
                            [:model/CacheConfig [q1 q2 q3]]
                            [:model/ExplorationThread [th1 th2 th3]]
                            [:model/ExplorationBlock [b1 b2 b3]]
                            [:model/ExplorationPage [p1 p2 p3]]]
              check        [mi/can-read? mi/can-write?]]
        (cost-is-flat model (map :id rows) check)))))

(deftest document-card-checks-cost-test
  (testing "checks of Cards of different Documents cost the same for two Cards as for three"
    (mt/with-temp [:model/Collection c1 {}
                   :model/Collection c2 {}
                   :model/Collection c3 {}
                   :model/Document   d1 {:collection_id (:id c1)}
                   :model/Document   d2 {:collection_id (:id c2)}
                   :model/Document   d3 {:collection_id (:id c3)}
                   :model/Card       k1 {:collection_id (:id c1) :document_id (:id d1)}
                   :model/Card       k2 {:collection_id (:id c2) :document_id (:id d2)}
                   :model/Card       k3 {:collection_id (:id c3) :document_id (:id d3)}]
      (doseq [check [mi/can-read? mi/can-write?]]
        (cost-is-flat :model/Card (map :id [k1 k2 k3]) check)))))
