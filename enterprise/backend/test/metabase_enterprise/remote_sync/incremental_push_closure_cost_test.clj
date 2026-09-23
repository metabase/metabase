(ns metabase-enterprise.remote-sync.incremental-push-closure-cost-test
  "HACKRDE-71: to find untracked content an incremental push must also write, the push walks each dirty entity's
  export closure (`serdes/descendants` + `serdes/required`). It used to walk it one dirty row at a time, costing app-DB
  queries per dirty entity; the walk now covers every dirty entity at once, with batched descendant lookups, so its
  queries don't grow with the number of dirty entities.

  Counts app-DB statements with [[metabase-enterprise.remote-sync.db-activity]] and compares two sizes so fixed and
  background costs cancel. Not ^:parallel: the counter is JVM-wide, and the test creates and syncs shared content."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db-activity :as db-activity]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- run-task! [task-type f]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type :initiated_by (mt/user->id :rasta)})
        result (f task)]
    (impl/handle-task-result! result task)
    result))

(defn- push-cost
  "Creates `n` cards in a synced collection, and with `dashboards?` also `n` dashboards each showing one of the cards,
  loads them, edits all of them locally, then counts app-DB activity during the incremental push. Returns the counts,
  with the export result under `:result`."
  [n dashboards?]
  (search.tu/with-index-disabled
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
      (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/Collection]
        (let [coll (t2/insert-returning-pk! :model/Collection {:name "Closure cost" :is_remote_synced true :location "/"})]
          (doseq [i (range n)]
            (let [card (t2/insert-returning-pk! :model/Card
                                                {:name                   (format "Closure cost card %03d" i)
                                                 :collection_id          coll
                                                 :creator_id             (mt/user->id :rasta)
                                                 :display                :line
                                                 :visualization_settings {}
                                                 :dataset_query          (mt/mbql-query venues {:aggregation [[:count]] :filter [:> $price i]})})]
              (when dashboards?
                (let [dash (t2/insert-returning-pk! :model/Dashboard
                                                    {:name          (format "Closure cost dashboard %03d" i)
                                                     :collection_id coll
                                                     :creator_id    (mt/user->id :rasta)
                                                     :parameters    []})]
                  (t2/insert! :model/DashboardCard {:dashboard_id dash :card_id card :row 0 :col 0 :size_x 4 :size_y 4})))))
          (let [v0  (into {} (map (juxt :path :content)) (source/serialize-specs (spec/extract-entities-for-export) nil))
                src (rs.test/versioned-source :trees {"v0" v0} :current "v0")]
            (is (= :success (:status (run-task! "import" #(impl/import! (source.p/snapshot src) % :force? true))))
                "baseline load")
            ;; a local edit to every card and dashboard: their ledger rows go dirty ("update")
            (t2/update! :model/Card {:collection_id coll} {:display :bar})
            (t2/update! :model/Dashboard {:collection_id coll} {:description "edited"})
            (t2/update! :model/RemoteSyncObject {:model_type [:in ["Card" "Dashboard"]]} {:status "update"})
            (db-activity/with-db-activity
              (run-task! "export" #(impl/export! (source.p/snapshot src) % "push" :source src)))))))))

(defn- statements-per-extra-entity
  "Pushes 10 and then 20 edited cards (with `dashboards?`, also as many edited dashboards) and returns the extra
  statements per extra dirty entity."
  [dashboards?]
  (let [per-card (if dashboards? 2 1)
        small    (push-cost 10 dashboards?)
        large    (push-cost 20 dashboards?)]
    (testing "both pushes take the incremental path and write every edited entity"
      (is (= {:kind "pushed" :count (* 10 per-card)} (select-keys (:outcome (:result small)) [:kind :count])))
      (is (= {:kind "pushed" :count (* 20 per-card)} (select-keys (:outcome (:result large)) [:kind :count]))))
    (/ (- (:statements large) (:statements small)) (* 10.0 per-card))))

(deftest incremental-push-closure-walk-does-not-scale-with-dirty-cards-test
  (testing "with only cards dirty, the closure walk is the only per-entity app-DB work in the push"
    (let [per-entity (statements-per-extra-entity false)]
      (testing (format "statements per extra dirty card: %s" per-entity)
        (is (<= per-entity 0.2))))))

(deftest incremental-push-closure-walk-does-not-scale-with-dirty-dashboards-test
  (testing "with cards and dashboards dirty (the dashboards' closures reach the cards)"
    (let [per-entity (statements-per-extra-entity true)]
      (testing (format "statements per extra dirty entity: %s" per-entity)
        ;; extracting a dashboard still costs about two statements of its own, apart from the closure walk: with one
        ;; card per dashboard that is about one statement per dirty entity. The per-row closure walk added three more.
        (is (<= per-entity 1.2))))))
