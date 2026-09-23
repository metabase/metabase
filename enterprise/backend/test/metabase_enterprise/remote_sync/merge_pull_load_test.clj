(ns metabase-enterprise.remote-sync.merge-pull-load-test
  "A clean merge pull should load only what the remote changed, and end in the same local state (entities and
  ledger) as loading the whole merged tree.

  Not ^:parallel: redefines vars and measures with the JVM-wide JDBC counter via [[pull-cost-test/measure]]."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.pull-cost-test :as pull-cost-test]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase-enterprise.serialization.core :as serialization]
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

(defn- ledger
  "The RemoteSyncObject table, minus row ids and timestamps."
  []
  (into #{} (map #(select-keys % [:model_type :model_id :model_name :status :file_path :content_hash]))
        (t2/select :model/RemoteSyncObject)))

(defn- cards []
  (into {} (map (juxt :name :description)) (t2/select [:model/Card :name :description])))

(def ^:private n-cards
  "Dashboards use cards 0-5 (see `do-with-content!`); the scenario edits and deletes only cards 6-11."
  12)

(defn- merge-pull!
  "Loads `n-cards` cards and 2 dashboards at v0, then builds a remote v1 (cards 6 and 7 re-described, card 10's file
  deleted) and a local change (card 8 re-described, card 11 deleted, both marked dirty), and runs a merge pull of v1
  with `(measure thunk)`. Returns the measurement plus the local state afterwards."
  [measure]
  (search.tu/with-index-disabled
    (#'pull-cost-test/do-with-content!
     {:cards n-cards :dashboards 2 :dashcards 5}
     (fn [v0]
       (let [src (rs.test/versioned-source :trees {"v0" v0} :current "v0")]
         (is (= :success (:status (#'pull-cost-test/import-at! src "v0" :force? true))) "baseline load")
         ;; remote edits: serialize them, then put the app DB back to v0
         (t2/update! :model/Card (card-id 6) {:description "remote edit 6"})
         (t2/update! :model/Card (card-id 7) {:description "remote edit 7"})
         (let [edited (#'pull-cost-test/synced-tree)
               v1     (-> (merge v0 (select-keys edited (remove #(= (v0 %) (edited %)) (keys edited))))
                          (dissoc (some (fn [[p c]] (when (re-find #"Cost card 010" c) p)) v0)))]
           (t2/update! :model/Card (card-id 6) {:description nil})
           (t2/update! :model/Card (card-id 7) {:description nil})
           (is (= 2 (count (remove #(= (v0 %) (v1 %)) (keys v1)))) "v1 modifies two files")
           (is (= (dec (count v0)) (count v1)) "v1 deletes one file")
           (let [src (rs.test/versioned-source :trees {"v0" v0 "v1" v1} :current "v1")]
             ;; local edits
             (t2/update! :model/Card (card-id 8) {:description "local edit 8"})
             (set-status! 8 "update")
             (set-status! 11 "delete")
             (t2/delete! :model/Card (card-id 11))
             (let [task (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                        :initiated_by   (mt/user->id :rasta)})
                   m    (measure #(let [r (impl/import! (source.p/snapshot-at src "v1") task
                                                        :merge? true
                                                        :base-snapshot (source.p/snapshot-at src "v0"))]
                                    (impl/handle-task-result! r task)
                                    r))]
               (assoc m :ledger (ledger) :cards (cards) :v0 v0 :v1 v1)))))))))

(defn- counting-loads
  "Measures `thunk` and counts the entities `load-metabase!` loaded during it."
  [thunk]
  (let [loaded (atom 0)
        real   (mt/original-fn #'serialization/load-metabase!)]
    (mt/with-dynamic-fn-redefs [serialization/load-metabase! (fn [& args]
                                                               (let [r (apply real args)]
                                                                 (swap! loaded + (count (:seen r)))
                                                                 r))]
      (assoc (pull-cost-test/measure thunk) :entities-loaded @loaded))))

(deftest merge-pull-loads-only-remote-changes-test
  (testing "A clean merge pull loads the entities the remote changed, not the whole merged tree"
    (let [m (merge-pull! counting-loads)]
      (is (= :success (get-in m [:result :status])))
      (is (= {:added 0 :updated 2 :removed 1} (get-in m [:result :merge-summary])))
      (is (= 2 (:entities-loaded m)) "only the two remotely modified cards are loaded")
      (testing "remote changes landed, local changes kept"
        (is (= "remote edit 6" (get-in m [:cards "Cost card 006"])))
        (is (= "remote edit 7" (get-in m [:cards "Cost card 007"])))
        (is (= "local edit 8" (get-in m [:cards "Cost card 008"])))
        (is (not (contains? (:cards m) "Cost card 010")) "remote deletion applied")
        (is (not (contains? (:cards m) "Cost card 011")) "local deletion kept"))
      (testing "every ledger row's hash is that of its last synced content, so a no-op re-save of the dirty card 8
                does not flip it back to synced"
        (is (= #{} (into #{}
                         (remove (fn [{:keys [file_path content_hash]}]
                                   (= content_hash (source/content-hash (or (get (:v1 m) file_path)
                                                                            (get (:v0 m) file_path))))))
                         (:ledger m))))))))

(deftest merge-pull-ends-in-same-state-as-full-load-test
  (testing "Loading only the remote changes leaves the same cards and ledger statuses as loading the whole merged tree"
    ;; ids and entity_ids differ between the two runs, so compare the ledgers without ids and hashes; the test
    ;; above checks the new path's hashes
    (let [strip      (fn [m] (update m :ledger (fn [rows] (into #{} (map #(dissoc % :model_id :content_hash)) rows))))
          new-path   (strip (merge-pull! #(pull-cost-test/measure %)))
          full-path  (strip (mt/with-dynamic-fn-redefs [impl/incremental-import-plan
                                                        (constantly :remote-sync/incremental-not-possible)]
                              (merge-pull! #(pull-cost-test/measure %))))]
      (is (= :success (get-in new-path [:result :status]) (get-in full-path [:result :status])))
      (is (= (:cards full-path) (:cards new-path)))
      (is (= (:ledger full-path) (:ledger new-path))))))
