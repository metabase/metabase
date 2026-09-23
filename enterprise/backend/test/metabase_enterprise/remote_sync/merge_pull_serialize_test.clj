(ns metabase-enterprise.remote-sync.merge-pull-serialize-test
  "HACKRDE-16: a merge pull whose remote changes can be loaded on their own should serialize local content in
  proportion to what the remote changed, not the whole local tree: only entities the remote changed can conflict or
  appear in the summary, and the load no longer needs the merged tree.

  Not ^:parallel: counts with thread-local redefs while the import runs on this thread."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.pull-cost-test :as pull-cost-test]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- card-id [i] (t2/select-one-pk :model/Card :name (format "Cost card %03d" i)))

(defn- set-status! [i status]
  (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id (card-id i)} {:status status}))

(defn- cards []
  (into {} (map (juxt :name :description)) (t2/select [:model/Card :name :description])))

(defn- changed-files [before after]
  (into {} (remove (fn [[p c]] (= c (before p)))) after))

(defn- merge-pull!
  "Loads `n` cards (n >= 12) and 2 dashboards at v0. The remote v1 re-describes cards 6 and 7, deletes card 10's
  file and adds a new card; locally card 8 is re-described (and `local-edit-7?` also re-describes card 7, a
  conflict), card 11 deleted, both marked dirty. Runs a merge pull of v1 counting the entities serialized to YAML."
  [n & {:keys [local-edit-7?]}]
  (search.tu/with-index-disabled
    (#'pull-cost-test/do-with-content!
     {:cards n :dashboards 2 :dashcards 5}
     (fn [v0]
       (let [src (rs.test/versioned-source :trees {"v0" v0} :current "v0")]
         (is (= :success (:status (#'pull-cost-test/import-at! src "v0" :force? true))) "baseline load")
         ;; remote edits: serialize them, then put the app DB back to v0
         (t2/update! :model/Card (card-id 6) {:description "remote edit 6"})
         (t2/update! :model/Card (card-id 7) {:description "remote edit 7"})
         (let [added-id (t2/insert-returning-pk! :model/Card
                                                 (-> (t2/select-one :model/Card (card-id 0))
                                                     (select-keys [:collection_id :creator_id :display
                                                                   :visualization_settings :dataset_query])
                                                     (assoc :name "Cost card remote new")))
               edited   (#'pull-cost-test/synced-tree)
               v1       (-> (merge v0 (changed-files v0 edited))
                            (dissoc (some (fn [[p c]] (when (re-find #"Cost card 010" c) p)) v0)))]
           (t2/delete! :model/Card added-id)
           (t2/update! :model/Card (card-id 6) {:description nil})
           (t2/update! :model/Card (card-id 7) {:description nil})
           (is (= 3 (count (changed-files v0 v1))) "v1 modifies two files and adds one")
           (let [src (rs.test/versioned-source :trees {"v0" v0 "v1" v1} :current "v1")]
             (t2/update! :model/Card (card-id 8) {:description "local edit 8"})
             (set-status! 8 "update")
             (when local-edit-7?
               (t2/update! :model/Card (card-id 7) {:description "local edit 7"})
               (set-status! 7 "update"))
             (set-status! 11 "delete")
             (t2/delete! :model/Card (card-id 11))
             (let [task       (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                              :initiated_by   (mt/user->id :rasta)})
                   serialized (atom 0)
                   result     (mt/with-dynamic-fn-redefs
                                [source/entity->file-spec (let [real (mt/original-fn #'source/entity->file-spec)]
                                                            (fn [& args] (swap! serialized inc) (apply real args)))]
                                (let [r (impl/import! (source.p/snapshot-at src "v1") task
                                                      :merge? true
                                                      :base-snapshot (source.p/snapshot-at src "v0"))]
                                  (impl/handle-task-result! r task)
                                  r))]
               {:result result :serialized @serialized :cards (cards)}))))))))

(deftest merge-pull-serializes-in-proportion-to-remote-changes-test
  (testing "A clean, incrementally loadable merge pull serializes the same number of entities whatever the local size"
    (let [small (merge-pull! 12)
          large (merge-pull! 24)]
      (doseq [m [small large]]
        (is (= :success (get-in m [:result :status])))
        (is (= {:added 1 :updated 2 :removed 1} (get-in m [:result :merge-summary])))
        (is (= "remote edit 6" (get-in m [:cards "Cost card 006"])))
        (is (= "remote edit 7" (get-in m [:cards "Cost card 007"])))
        (is (contains? (:cards m) "Cost card remote new"))
        (is (= "local edit 8" (get-in m [:cards "Cost card 008"])))
        (is (not (contains? (:cards m) "Cost card 010")) "remote deletion applied")
        (is (not (contains? (:cards m) "Cost card 011")) "local deletion kept"))
      (is (= (:serialized small) (:serialized large))
          (format "serialized %d entities at 12 cards and %d at 24" (:serialized small) (:serialized large)))
      (testing "at most: the 3 remote-changed entities that exist locally, plus re-hashing the 3 it loads"
        (is (<= (:serialized large) 6)))))
  (testing "A card changed on both sides is still a conflict, and nothing is loaded"
    (let [m (merge-pull! 12 :local-edit-7? true)]
      (is (= :conflict (get-in m [:result :status])))
      (is (= 1 (count (get-in m [:result :conflicts]))))
      (is (= "local edit 7" (get-in m [:cards "Cost card 007"])))
      (is (nil? (get-in m [:cards "Cost card 006"])) "the remote edit to card 6 was not loaded")
      (is (not (contains? (:cards m) "Cost card remote new"))))))
