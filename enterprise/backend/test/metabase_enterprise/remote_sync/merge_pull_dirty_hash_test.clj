(ns metabase-enterprise.remote-sync.merge-pull-dirty-hash-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.events.core :as events]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(defn- tree
  "The files in `snapshot`, as a map of path to content."
  [snapshot]
  (into {} (map (juxt identity #(source.p/read-file snapshot %))) (source.p/list-files snapshot)))

(defn- run-sync!
  "Run `f` with a new sync task of `task-type`, complete the task, and return the result of `f`."
  [task-type f]
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type
                                                                :initiated_by   (mt/user->id :rasta)})
        result  (f task-id)]
    (remote-sync.task/complete-sync-task! task-id)
    result))

(defn- sync!
  "Run `f` with a new sync task of `task-type`, check that it succeeds, and complete the task."
  [task-type f]
  (let [result (run-sync! task-type f)]
    (is (= :success (:status result)) (pr-str result))
    result))

(defn- save-card!
  "Publish a `:event/card-update` for card `card-id` as it is now."
  [card-id]
  (let [c (t2/select-one :model/Card card-id)]
    (events/publish-event! :event/card-update {:object c :previous-object c :user-id (mt/user->id :rasta)})))

(defn- archive-and-unarchive!
  "Archive the card `card-id`, then unarchive it, saving after each step. Its ledger row ends `update` with content
  equal to the last sync."
  [card-id]
  (t2/update! :model/Card card-id {:archived true})
  (save-card! card-id)
  (t2/update! :model/Card card-id {:archived false})
  (save-card! card-id))

(defn- files-with-entity-id
  "The paths in `tree` whose content holds `entity-id`."
  [tree entity-id]
  (vec (keep (fn [[p c]] (when (str/includes? c (str "entity_id: " entity-id)) p)) tree)))

(deftest merge-pull-then-noop-save-keeps-local-edit-test
  (testing "After a merge pull, a no-op re-save of a locally edited card keeps it dirty, and the next push carries
            the edit"
    (mt/with-temporary-setting-values [remote-sync-enabled true remote-sync-type :read-write]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                       :model/Card {local-id :id} {:name "Local Card" :collection_id coll-id}
                       :model/Card {remote-id :id} {:name "Remote Card" :description "original" :collection_id coll-id}
                       ;; the remote deletes this collection
                       :model/Collection {doomed-id :id} {:name "Doomed" :is_remote_synced true :location "/"}]
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
            (let [[_ loaded] (test-helpers/loaded-entities
                              #(sync! "import" (fn [task-id]
                                                 (impl/import! (source.p/snapshot src) task-id
                                                               :merge? true :base-snapshot (source.p/snapshot-at src base)))))]
              (is (= #{["Card" (t2/select-one-fn :entity_id :model/Card remote-id)]} loaded)
                  "the merge pull loads only the remote-changed card"))
            (is (not (t2/exists? :model/Collection :id doomed-id)) "the remote delete lands")
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
                "the local edit reaches the remote branch")))))))

(deftest merge-pull-then-push-of-locally-renamed-card-leaves-one-file-test
  (testing "A card renamed locally, then a merge pull, then a push: the repository has one file for the card"
    (mt/with-temporary-setting-values [remote-sync-enabled true remote-sync-type :read-write]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                       :model/Card {local-id :id} {:name "Local Card" :collection_id coll-id}
                       :model/Card _ {:name "Remote Card" :description "original" :collection_id coll-id}]
          (let [eid   (t2/select-one-fn :entity_id :model/Card local-id)
                save! #(let [c (t2/select-one :model/Card local-id)]
                         (events/publish-event! :event/card-update
                                                {:object c :previous-object c :user-id (mt/user->id :rasta)}))
                src0  (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
                base  (:version (sync! "export" #(impl/export! (source.p/snapshot src0) % "initial" :force? true)))
                t0    (tree (source.p/snapshot src0))
                path  (some (fn [[p c]] (when (str/includes? c "name: Remote Card") p)) t0)
                t1    (update t0 path str/replace "description: original" "description: remote edit")
                src   (test-helpers/versioned-source :trees {base t0 "v1" t1} :current base)
                ;; a forced pull of the base records the file paths and hashes in the ledger
                _     (sync! "import" #(impl/import! (source.p/snapshot src) % :force? true))
                src   (test-helpers/versioned-source :trees {base t0 "v1" t1} :current "v1")]
            (t2/update! :model/Card local-id {:name "Renamed Card"})
            (save!)
            (sync! "import" #(impl/import! (source.p/snapshot src) %
                                           :merge? true :base-snapshot (source.p/snapshot-at src base)))
            (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))
            (let [files (keep (fn [[p c]] (when (str/includes? c (str "entity_id: " eid)) p))
                              (tree (source.p/snapshot src)))]
              (is (= 1 (count files))
                  (str "the push deletes the file at the old path: " (pr-str files))))))))))

(deftest merge-pull-taking-remote-rename-of-dirty-card-keeps-file-reused-by-other-card-test
  (testing "A dirty card with content equal to the last sync, renamed on the remote while another card takes its old
            file name: after a merge pull and a push, the repository has a file for each card"
    (mt/with-temporary-setting-values [remote-sync-enabled true remote-sync-type :read-write]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                       :model/Card {foo-id :id} {:name "Foo Card" :collection_id coll-id}
                       :model/Card {other-id :id} {:name "Other Card" :collection_id coll-id}]
          (let [foo-eid   (t2/select-one-fn :entity_id :model/Card foo-id)
                other-eid (t2/select-one-fn :entity_id :model/Card other-id)
                src0      (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
                base      (:version (sync! "export" #(impl/export! (source.p/snapshot src0) % "initial" :force? true)))
                t0        (tree (source.p/snapshot src0))
                foo-path  (some (fn [[p c]] (when (str/includes? c "name: Foo Card") p)) t0)
                oth-path  (some (fn [[p c]] (when (str/includes? c "name: Other Card") p)) t0)
                ;; the remote renames Foo Card to Bar Card, and Other Card to Foo Card, which takes foo_card.yaml
                t1        (-> t0
                              (dissoc foo-path oth-path)
                              (assoc (str/replace foo-path "foo_card" "bar_card")
                                     (str/replace (get t0 foo-path) "name: Foo Card" "name: Bar Card"))
                              (assoc foo-path (str/replace (get t0 oth-path) "name: Other Card" "name: Foo Card")))
                src       (test-helpers/versioned-source :trees {base t0 "v1" t1} :current base)
                ;; a forced pull of the base records the file paths and hashes in the ledger
                _         (sync! "import" #(impl/import! (source.p/snapshot src) % :force? true))
                src       (test-helpers/versioned-source :trees {base t0 "v1" t1} :current "v1")]
            (is (= #{foo-path (str/replace foo-path "foo_card" "bar_card")}
                   (set (filter #(str/includes? % "_card.yaml") (keys t1)))))
            (archive-and-unarchive! foo-id)
            (sync! "import" #(impl/import! (source.p/snapshot src) %
                                           :merge? true :base-snapshot (source.p/snapshot-at src base)))
            (is (= #{"Bar Card" "Foo Card"} (set (t2/select-fn-vec :name :model/Card :collection_id coll-id))))
            (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))
            (let [t2* (tree (source.p/snapshot src))]
              (is (= 1 (count (files-with-entity-id t2* foo-eid)))
                  (pr-str (keys t2*)))
              (is (= [foo-path] (files-with-entity-id t2* other-eid))
                  (str "the push keeps the file the remote gave to the other card: " (pr-str (keys t2*)))))))))))

(deftest merge-pull-taking-remote-edit-of-dirty-card-then-local-revert-pushes-revert-test
  (testing "A dirty card with content equal to the last sync takes a remote edit in a merge pull; a later local edit
            back to the old value reaches the remote branch"
    (mt/with-temporary-setting-values [remote-sync-enabled true remote-sync-type :read-write]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                       :model/Card {card-id :id} {:name "Foo Card" :description "original" :collection_id coll-id}]
          (let [eid  (t2/select-one-fn :entity_id :model/Card card-id)
                src0 (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
                base (:version (sync! "export" #(impl/export! (source.p/snapshot src0) % "initial" :force? true)))
                t0   (tree (source.p/snapshot src0))
                path (some (fn [[p c]] (when (str/includes? c "name: Foo Card") p)) t0)
                t1   (update t0 path str/replace "description: original" "description: remote edit")
                src  (test-helpers/versioned-source :trees {base t0 "v1" t1} :current base)
                _    (sync! "import" #(impl/import! (source.p/snapshot src) % :force? true))
                src  (test-helpers/versioned-source :trees {base t0 "v1" t1} :current "v1")]
            (archive-and-unarchive! card-id)
            (sync! "import" #(impl/import! (source.p/snapshot src) %
                                           :merge? true :base-snapshot (source.p/snapshot-at src base)))
            (is (= "remote edit" (t2/select-one-fn :description :model/Card card-id)))
            (t2/update! :model/Card card-id {:description "original"})
            (save-card! card-id)
            (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))
            (let [repo (some (fn [[_ c]] (when (str/includes? c (str "entity_id: " eid)) c))
                             (tree (source.p/snapshot src)))]
              (is (= "original" (second (re-find #"(?m)^description: (.*)$" repo)))
                  "the repository has the description of the app DB"))))))))

(defn- released-dirty-row!
  "Sync card `a-id` (description \"original\") at a base version, edit it locally, and give its dirty ledger row the
  hash of the local edit, as a released merge pull left it. Return `{:src :base}`: `src` is at the tip \"v1\", where
  the remote edited the card; `base` is the version of the last sync."
  [a-id]
  (let [src0 (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
        base (:version (sync! "export" #(impl/export! (source.p/snapshot src0) % "initial" :force? true)))
        t0   (tree (source.p/snapshot src0))
        pa   (some (fn [[p c]] (when (str/includes? c "name: Card A") p)) t0)
        t1   (update t0 pa str/replace "description: original" "description: remote edit A")
        src  (test-helpers/versioned-source :trees {base t0 "v1" t1} :current base)
        ;; a forced pull of the base records the file paths and hashes in the ledger
        _    (sync! "import" #(impl/import! (source.p/snapshot src) % :force? true))
        row  #(t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id a-id)]
    (t2/update! :model/Card a-id {:description "local edit A"})
    (save-card! a-id)
    (is (= ["update" pa] ((juxt :status :file_path) (row))))
    ;; the row that a released merge pull left: the path of the last sync, and the hash of the local edit
    (t2/update! :model/RemoteSyncObject (:id (row))
                {:content_hash (source/row->content-hash {:model_type "Card" :model_id a-id})})
    {:src  (test-helpers/versioned-source :trees {base t0 "v1" t1} :current "v1")
     :base base}))

(deftest merge-pull-over-dirty-row-written-by-released-merge-pull-reports-conflict-test
  (testing "A dirty row whose hash a released merge pull set from the un-pushed local edit: a remote edit of the
            same card gives a conflict on the next merge pull, and the local edit stays"
    (mt/with-temporary-setting-values [remote-sync-enabled true remote-sync-type :read-write]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                       :model/Card {a-id :id} {:name "Card A" :description "original" :collection_id coll-id}]
          (let [{:keys [src base]} (released-dirty-row! a-id)
                pull               (run-sync! "import" #(impl/import! (source.p/snapshot src) %
                                                                      :merge? true
                                                                      :base-snapshot (source.p/snapshot-at src base)))]
            (is (= :conflict (:status pull)) (pr-str pull))
            (is (= "local edit A" (t2/select-one-fn :description :model/Card a-id)))))))))

(deftest export-merge-over-dirty-row-written-by-released-merge-pull-reports-conflict-test
  (testing "A dirty row whose hash a released merge pull set from the un-pushed local edit: a remote edit of the
            same card gives a conflict on the next export merge, and the local edit stays"
    (mt/with-temporary-setting-values [remote-sync-enabled true remote-sync-type :read-write]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                       :model/Card {a-id :id} {:name "Card A" :description "original" :collection_id coll-id}]
          (let [{:keys [src base]} (released-dirty-row! a-id)
                push               (run-sync! "export" #(impl/export! (source.p/snapshot src) % "push"
                                                                      :merge? true
                                                                      :source src
                                                                      :base-snapshot (source.p/snapshot-at src base)))]
            (is (= :conflict (:status push)) (pr-str push))
            (is (= "local edit A" (t2/select-one-fn :description :model/Card a-id)))
            (is (= "update" (t2/select-one-fn :status :model/RemoteSyncObject :model_type "Card" :model_id a-id)))
            (is (not-any? #(str/includes? % "local edit A") (vals (tree (source.p/snapshot src))))
                "the conflict pushes nothing")))))))
