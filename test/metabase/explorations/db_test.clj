(ns metabase.explorations.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.models.exploration-query :as exploration-query]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest update-queries!-writes-query-and-stamp-together-test
  (let [mp    (mt/metadata-provider)
        stamp {:dataset_query       (lib/query mp (lib.metadata/table mp (mt/id :venues)))
               :data_access_token   {}
               :resolved_source_ids {:table-ids #{(mt/id :venues)}}}]
    (doseq [k (keys stamp)]
      (testing (str "rejects " k " without the rest of the stamp")
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"go together"
                              (exploration-query/update-queries! [(assoc (select-keys stamp [k]) :id Integer/MAX_VALUE)]))))
      (testing (str "rejects the stamp without " k)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"go together"
                              (exploration-query/update-queries! [(assoc (dissoc stamp k) :id Integer/MAX_VALUE)])))))
    (testing "accepts the whole stamp, or none of it"
      (is (= 0 (exploration-query/update-queries! [(assoc stamp :id Integer/MAX_VALUE)])))
      (is (= 0 (exploration-query/update-queries! [{:id Integer/MAX_VALUE :status "done"}]))))))

(deftest partitioned-reads-match-whole-reads-test
  (mt/with-temp [:model/Exploration       {e1 :id} {}
                 :model/Exploration       {e2 :id} {}
                 :model/Exploration       {e3 :id} {}
                 :model/ExplorationThread {t1 :id} {:exploration_id e1 :position 2}
                 :model/ExplorationThread {t2 :id} {:exploration_id e2 :position 1}
                 :model/ExplorationThread {t3 :id} {:exploration_id e3 :position 0}
                 :model/ExplorationThread {t4 :id} {:exploration_id e1 :position 0}
                 :model/ExplorationThread {t5 :id} {:exploration_id e2 :position 2}
                 :model/ExplorationBlock  _        {:exploration_thread_id t1 :position 1}
                 :model/ExplorationBlock  _        {:exploration_thread_id t2 :position 0}
                 :model/ExplorationBlock  _        {:exploration_thread_id t3 :position 2}
                 :model/ExplorationBlock  _        {:exploration_thread_id t4 :position 0}
                 :model/ExplorationBlock  _        {:exploration_thread_id t5 :position 1}]
    (let [explorations [e1 e2 e3]
          threads      [t1 t2 t3 t4 t5]
          reads        {:ordered-threads       #(mapv :id (explorations.db/threads-for-explorations explorations))
                        :ordered-blocks        #(mapv (juxt :exploration_thread_id :position) (explorations.db/blocks-for-threads threads))
                        :newest-first-metrics  #(mapv :exploration_thread_id (explorations.db/block-metrics-for-threads-newest-first threads))
                        :set-of-threads        #(explorations.db/thread-ids-by-exploration-id (set explorations))}]
      (doseq [[read-name read-fn] reads]
        (testing read-name
          (let [whole (read-fn)]
            (is (seq whole))
            (is (= whole (with-redefs [mdb.query/select-partition-size 2]
                           (read-fn))))))))))
