(ns metabase-enterprise.remote-sync.merge-pull-dirty-hash-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.events.core :as events]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(deftest merge-pull-then-noop-save-keeps-local-edit-test
  (testing "After a merge pull that takes the full load, a no-op re-save of a locally edited card keeps it dirty, and
            the next push carries the edit (HACKRDE-32)"
    (mt/with-temporary-setting-values [remote-sync-enabled true remote-sync-type :read-write]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                       :model/Card {local-id :id} {:name "Local Card" :collection_id coll-id}
                       :model/Card {remote-id :id} {:name "Remote Card" :description "original" :collection_id coll-id}
                       ;; the remote deletes this collection, which the incremental path refuses: the merge pull
                       ;; must take the full load, where the bug lives
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
                  save!  #(let [c (t2/select-one :model/Card local-id)]
                            (events/publish-event! :event/card-update
                                                   {:object c :previous-object c :user-id (mt/user->id :rasta)}))
                  ;; push the initial state; that is the base both sides start from
                  src0   (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
                  base   (:version (sync! "export" #(impl/export! (source.p/snapshot src0) % "initial" :force? true)))
                  t0     (tree (source.p/snapshot src0))
                  ;; someone else edits Remote Card on the remote branch
                  path   (some (fn [[p c]] (when (str/includes? c "name: Remote Card") p)) t0)
                  doomed (some (fn [[p c]] (when (str/includes? c "name: Doomed") p)) t0)
                  t1     (-> t0
                             (update path str/replace "description: original" "description: remote edit")
                             (dissoc doomed))
                  src    (test-helpers/versioned-source :trees {base t0 "v1" t1} :current "v1")]
              (is (some? doomed))
              (is (not= t0 t1))
              ;; edit Local Card locally
              (t2/update! :model/Card local-id {:description "local edit"})
              (save!)
              (is (= "update" (status)))
              ;; merge pull: the remote edit lands, the local edit stays pending
              (let [full-loads (atom 0)
                    real       (mt/original-fn #'impl/load-snapshot!)]
                (mt/with-dynamic-fn-redefs [impl/load-snapshot! (fn [& args] (swap! full-loads inc) (apply real args))]
                  (sync! "import" #(impl/import! (source.p/snapshot src) %
                                                 :merge? true :base-snapshot (source.p/snapshot-at src base))))
                (is (= 1 @full-loads) "the merge pull took the full load"))
              (is (= "remote edit" (t2/select-one-fn :description :model/Card remote-id)))
              (is (= "local edit" (t2/select-one-fn :description :model/Card local-id)))
              (is (= "update" (status)))
              ;; re-save Local Card with no further changes
              (save!)
              (is (= "update" (status))
                  "a no-op save must not mark an un-pushed local edit as synced")
              ;; push
              (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))
              (is (some #(str/includes? % "local edit") (vals (tree (source.p/snapshot src))))
                  "the local edit reaches the remote branch"))))))))
