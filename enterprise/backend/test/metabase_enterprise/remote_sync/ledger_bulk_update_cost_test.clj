(ns metabase-enterprise.remote-sync.ledger-bulk-update-cost-test
  "Bulk writes to the RemoteSyncObject ledger issue one UPDATE per call, whatever mix of statuses the rows they
  touch are in (HACKRDE-67).

  Toucan applies a model's `before-update` to each matching row and keeps only the columns whose value would
  change. A row already `synced` drops `:status` from its changes, so a batch mixing synced rows with dirty ones
  (as a merge pull leaves the ledger) produces two change maps, and Toucan then updates each row on its own,
  each statement carrying the whole batch's `CASE` expressions: quadratic in the batch size.

  Not ^:parallel: the JDBC counter ([[metabase-enterprise.remote-sync.db-activity]]) is JVM-wide. Counts are taken
  on this thread only."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.db-activity :as db-activity]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.events.core :as events]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.before-update :as t2.before-update]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(defn- this-thread-statements
  "Run `thunk` and return the number of JDBC statements this thread executed while it ran."
  [thunk]
  (let [tid (.threadId (Thread/currentThread))]
    (get-in (db-activity/count-db-activity thunk) [:by-thread tid :statements] 0)))

(def ^:private model-id-base
  "Well above any id the test content uses, so the ledger rows inserted here never collide with real ones."
  900000000)

(defn- insert-ledger-rows!
  "Insert one Card ledger row per status in `statuses`, returning their ids."
  [statuses]
  (let [ts   (t/offset-date-time)
        base (+ model-id-base (rand-int 1000000))]
    (t2/insert-returning-pks! :model/RemoteSyncObject
                              (map-indexed (fn [i status]
                                             {:model_type        "Card"
                                              :model_id          (+ base i)
                                              :model_name        (str "Ledger row " i)
                                              :status            status
                                              :status_changed_at ts})
                                           statuses))))

(defn- do-with-ledger-rows! [statuses f]
  (let [ids (insert-ledger-rows! statuses)]
    (try
      (f ids)
      (finally
        (t2/delete! :model/RemoteSyncObject :id [:in ids])))))

(def ^:private mixed-statuses
  "A batch like the one a merge pull leaves behind: mostly synced rows, some restored dirty."
  (concat (repeat 15 "synced") (repeat 5 "update")))

(defn- metadata-for [ids]
  (into {} (map (fn [id] [id {:file_path (str "path/" id) :content_hash (str "hash-" id)}])) ids))

(deftest mark-rsos-synced!-is-one-statement-for-a-mixed-batch-test
  (testing "marking a batch of synced and dirty ledger rows synced is one UPDATE, not one per row"
    (do-with-ledger-rows!
     mixed-statuses
     (fn [ids]
       (let [written (take 10 ids)
             ts      (t/offset-date-time)
             n       (this-thread-statements
                      #(remote-sync.db/mark-rsos-synced! ids (metadata-for written) ts))]
         (is (<= n 1) (str "statements: " n " for " (count ids) " rows"))
         (testing "and writes what it did before"
           (is (= #{"synced"} (set (t2/select-fn-set :status :model/RemoteSyncObject :id [:in ids]))))
           (is (= (into {} (map (fn [id] [id (str "path/" id)])) written)
                  (t2/select-pk->fn :file_path :model/RemoteSyncObject :id [:in written])))
           (is (= #{nil}
                  (t2/select-fn-set :file_path :model/RemoteSyncObject :id [:in (drop 10 ids)]))
               "rows without metadata keep their (empty) path")))))))

(deftest set-rsos-status!-is-one-statement-for-a-mixed-batch-test
  (testing "setting the status of ledger rows some of which already have it is one UPDATE"
    (do-with-ledger-rows!
     (concat (repeat 15 "update") (repeat 5 "synced"))
     (fn [ids]
       (let [n (this-thread-statements
                #(remote-sync.db/set-rsos-status! ids "update" (t/offset-date-time)))]
         (is (<= n 1) (str "statements: " n " for " (count ids) " rows"))
         (is (= #{"update"} (t2/select-fn-set :status :model/RemoteSyncObject :id [:in ids]))))))))

(deftest mark-all-rsos-synced!-is-one-statement-for-a-mixed-ledger-test
  (testing "marking the whole ledger synced when some of it already is is one UPDATE"
    (do-with-ledger-rows!
     mixed-statuses
     (fn [ids]
       (let [n (this-thread-statements
                #(remote-sync.db/mark-all-rsos-synced! (t/offset-date-time)))]
         (is (<= n 1) (str "statements: " n))
         (is (= #{"synced"} (t2/select-fn-set :status :model/RemoteSyncObject :id [:in ids]))))))))

(deftest bulk-ledger-writes-skip-only-the-worktree-hook-test
  (testing "the bulk ledger writes update the table, skipping the model's before-update; that is safe only while
            the one before-update the model has is the worktree hook, whose guarantee they enforce themselves"
    (is (= [:hook/worktree-id]
           (filterv #(isa? :model/RemoteSyncObject %)
                    (keys (methodical/primary-methods t2.before-update/before-update))))
        "a new before-update on RemoteSyncObject must be applied by `update-rsos-in-bulk!` too")
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot be changed"
                          (#'remote-sync.db/update-rsos-in-bulk! {:id [:in [1]]} {:worktree_id 1})))))

(deftest bulk-ledger-writes-stay-in-their-worktree-test
  (testing "the bulk ledger writes touch only the worktree being worked in, and cannot move a row out of it"
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "ledger-bulk-" (random-uuid))})]
      (try
        (let [main-ids   (insert-ledger-rows! ["update" "synced"])
              branch-ids (mdb.worktree/with-worktree worktree-id
                           (insert-ledger-rows! ["update" "synced"]))
              all-ids    (concat main-ids branch-ids)
              statuses   #(mdb.worktree/without-worktree-scoping
                           (t2/select-pk->fn :status :model/RemoteSyncObject :id [:in all-ids]))
              ts         (t/offset-date-time)]
          (try
            (is (= #{worktree-id}
                   (mdb.worktree/without-worktree-scoping
                    (t2/select-fn-set :worktree_id :model/RemoteSyncObject :id [:in branch-ids]))))
            (testing "mark-rsos-synced! from the main app leaves the branch's rows alone, even when named"
              (remote-sync.db/mark-rsos-synced! all-ids (metadata-for all-ids) ts)
              (is (= {(first main-ids) "synced" (second main-ids) "synced"
                      (first branch-ids) "update" (second branch-ids) "synced"}
                     (statuses)))
              (is (= #{nil} (mdb.worktree/without-worktree-scoping
                             (t2/select-fn-set :file_path :model/RemoteSyncObject :id [:in branch-ids])))))
            (testing "set-rsos-status! inside the branch leaves the main app's rows alone"
              (mdb.worktree/with-worktree worktree-id
                (remote-sync.db/set-rsos-status! all-ids "removed" ts))
              (is (= {(first main-ids) "synced" (second main-ids) "synced"
                      (first branch-ids) "removed" (second branch-ids) "removed"}
                     (statuses))))
            (testing "mark-all-rsos-synced! inside the branch leaves the main app's rows alone"
              (remote-sync.db/set-rsos-status! main-ids "update" ts)
              (mdb.worktree/with-worktree worktree-id
                (remote-sync.db/mark-all-rsos-synced! ts))
              (is (= {(first main-ids) "update" (second main-ids) "update"
                      (first branch-ids) "synced" (second branch-ids) "synced"}
                     (statuses))))
            (testing "no bulk write moves a row to another worktree"
              (is (= {worktree-id 2 nil 2}
                     (frequencies (mdb.worktree/without-worktree-scoping
                                   (t2/select-fn-vec :worktree_id :model/RemoteSyncObject :id [:in all-ids]))))))
            (finally
              (t2/delete! :model/RemoteSyncObject :id [:in main-ids]))))
        (finally
          (remote-sync.db/delete-worktree! worktree-id))))))

;;; ------------------------------------------- merge pull, then forced push -------------------------------------------

(defn- counting-ledger-updates
  "Run `thunk`; return `[n result]`, `n` the number of UPDATE statements on `remote_sync_object` it compiled.

  The JDBC counter can't see these: the export marks the ledger inside a transaction whose connection was checked
  out before a counter scoped to the call could swap in its counting data source. So this counts at Toucan's
  compile step instead, where each statement Toucan sends is compiled once."
  [thunk]
  (let [n (atom 0)
        k ::count-ledger-updates]
    (methodical/add-aux-method-with-unique-key!
     #'t2.pipeline/compile :before :default
     (fn [_query-type _model built]
       (when (and (map? built) (some #{:remote_sync_object} (flatten [(:update built)])))
         (swap! n inc))
       built)
     k)
    (try
      (let [result (thunk)]
        [@n result])
      (finally
        (methodical/remove-aux-method-with-unique-key! #'t2.pipeline/compile :before :default k)))))

(deftest forced-push-after-merge-pull-writes-the-ledger-in-one-statement-per-chunk-test
  (testing "the first forced push after a merge pull that restored dirty rows marks the ledger synced with one
            UPDATE per chunk, not one per row"
    (mt/with-temporary-setting-values [remote-sync-enabled true remote-sync-type :read-write]
         (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
           (mt/with-temp [:model/Collection {coll-id :id} {:name "Ledger Push" :is_remote_synced true :location "/"}
                          :model/Card {local-id :id} {:name "Local Card" :collection_id coll-id}
                          :model/Card {remote-id :id} {:name "Remote Card" :description "original" :collection_id coll-id}
                          :model/Card _ {:name "Bystander 1" :collection_id coll-id}
                          :model/Card _ {:name "Bystander 2" :collection_id coll-id}
                          :model/Card _ {:name "Bystander 3" :collection_id coll-id}
                          :model/Card _ {:name "Bystander 4" :collection_id coll-id}
                          :model/Card _ {:name "Bystander 5" :collection_id coll-id}
                          :model/Card _ {:name "Bystander 6" :collection_id coll-id}
                          :model/Card _ {:name "Bystander 7" :collection_id coll-id}
                          :model/Card _ {:name "Bystander 8" :collection_id coll-id}
                          ;; the remote deletes this collection, which the incremental path refuses: the merge pull
                          ;; takes the full load and restores the dirty rows afterwards
                          :model/Collection _ {:name "Doomed" :is_remote_synced true :location "/"}]
             (letfn [(tree [snapshot]
                       (into {} (map (juxt identity #(source.p/read-file snapshot %))) (source.p/list-files snapshot)))
                     (sync! [task-type f]
                       (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type
                                                                                     :initiated_by   (mt/user->id :rasta)})
                             result  (f task-id)]
                         (is (= :success (:status result)) (pr-str result))
                         (remote-sync.task/complete-sync-task! task-id)
                         result))]
               (let [status #(t2/select-one-fn :status :model/RemoteSyncObject :model_type "Card" :model_id local-id)
                     src0   (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
                     base   (:version (sync! "export" #(impl/export! (source.p/snapshot src0) % "initial" :force? true)))
                     t0     (tree (source.p/snapshot src0))
                     path   (some (fn [[p c]] (when (str/includes? c "name: Remote Card") p)) t0)
                     doomed (some (fn [[p c]] (when (str/includes? c "name: Doomed") p)) t0)
                     t1     (-> t0
                                (update path str/replace "description: original" "description: remote edit")
                                (dissoc doomed))
                     src    (test-helpers/versioned-source :trees {base t0 "v1" t1} :current "v1")]
                 ;; a local edit, pending when the merge pull runs
                 (t2/update! :model/Card local-id {:description "local edit"})
                 (let [c (t2/select-one :model/Card local-id)]
                   (events/publish-event! :event/card-update {:object c :previous-object c :user-id (mt/user->id :rasta)}))
                 (is (= "update" (status)))
                 (sync! "import" #(impl/import! (source.p/snapshot src) %
                                                :merge? true :base-snapshot (source.p/snapshot-at src base)))
                 (is (= "remote edit" (t2/select-one-fn :description :model/Card remote-id)))
                 (is (= "update" (status)) "the merge pull restored the local edit's dirty row")
                 (let [ledger-rows (t2/count :model/RemoteSyncObject)
                       calls       (atom [])
                       real        (mt/original-fn #'remote-sync.db/mark-rsos-synced!)]
                   (is (< 10 ledger-rows))
                   (mt/with-dynamic-fn-redefs [remote-sync.db/mark-rsos-synced!
                                               (fn [& args]
                                                 (let [[n result] (counting-ledger-updates #(apply real args))]
                                                   (swap! calls conj n)
                                                   result))]
                     (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src :force? true)))
                   (is (seq @calls) "the forced push marked the ledger synced")
                   (is (every? #(<= % 1) @calls)
                       (str "UPDATEs per ledger chunk: " (pr-str @calls) " for " ledger-rows " ledger rows"))
                   (is (= "synced" (status)))
                   (is (some #(str/includes? % "local edit") (vals (tree (source.p/snapshot src))))
                       "the local edit reaches the remote branch")))))))))
