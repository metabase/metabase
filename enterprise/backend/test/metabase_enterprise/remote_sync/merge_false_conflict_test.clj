(ns metabase-enterprise.remote-sync.merge-false-conflict-test
  "A merge pull must not report a conflict on an entity nobody changed locally, even when the repo's file for it is
  not byte-identical to what Metabase would serialize (a `name:` edited without renaming the file, or hand-written
  YAML).

  Not ^:parallel: uses the shared remote-sync fixtures and [[cost/do-with-content!]]."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- card-path
  "The path of the file in `tree` holding the card named `card-name`."
  [tree card-name]
  (some (fn [[p c]] (when (str/includes? c (str "name: " card-name "\n")) p)) tree))

(defn- run-import! [src version & opts]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                               :initiated_by   (mt/user->id :rasta)})
        result (apply impl/import! (source.p/snapshot-at src version) task opts)]
    (impl/handle-task-result! result task)
    result))

(defn- merge-pull-after-hand-edit!
  "Loads three cards at v0; pulls v1, whose only change is `hand-edit` applied to the first card's file (path
  unchanged); makes an unrelated local edit to the second card (so the next pull must merge); then merge-pulls v2,
  which renames the first card in its file again. Returns the merge-pull result and the card names afterwards. With
  `:local-edit` naming a card, that card gets the local edit instead of the second card."
  [hand-edit & {:keys [local-edit] :or {local-edit "Cost card 002"}}]
  (search.tu/with-index-disabled
    (cost/do-with-content!
     {:cards 3}
     (fn [v0]
       (let [path (card-path v0 "Cost card 001")
             v1   (update v0 path hand-edit)
             v2   (update v1 path #(str/replace % #"(?m)^name: .*$" "name: Remote rename 001"))
             src  (rs.test/versioned-source :trees {"v0" v0 "v1" v1 "v2" v2} :current "v0")]
         (is (= :success (:status (run-import! src "v0" :force? true))) "baseline load")
         (is (= :success (:status (run-import! src "v1"))) "pull of the hand-edited file")
         (let [card (t2/select-one-pk :model/Card :name local-edit)]
           (t2/update! :model/Card card {:description "local edit"})
           (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card} {:status "update"}))
         {:result (run-import! src "v2" :merge? true :base-snapshot (source.p/snapshot-at src "v1"))
          :cards  (into {} (map (juxt :name :description)) (t2/select [:model/Card :name :description]))})))))

(deftest merge-pull-after-name-only-edit-test
  (testing "A card whose `name:` was edited in the repo without renaming its file is not a local change"
    (let [{:keys [result cards]} (merge-pull-after-hand-edit!
                                  #(str/replace % #"(?m)^name: .*$" "name: Hand rename 001"))]
      (is (= :success (:status result)) (pr-str (:conflicts result)))
      (is (contains? cards "Remote rename 001") "the remote's second rename landed")
      (is (= "local edit" (get cards "Cost card 002")) "the local change was kept"))))

(deftest merge-pull-after-hand-written-yaml-test
  (testing "A card whose file differs from Metabase's own serialization only in text is not a local change"
    (let [{:keys [result cards]} (merge-pull-after-hand-edit! #(str "# edited by hand\n" %))]
      (is (= :success (:status result)) (pr-str (:conflicts result)))
      (is (contains? cards "Remote rename 001") "the remote's rename landed")
      (is (= "local edit" (get cards "Cost card 002")) "the local change was kept"))))

(deftest merge-pull-still-conflicts-on-a-real-local-edit-test
  (testing "A hand-edited card that was also edited locally still conflicts with the remote's edit"
    (let [{:keys [result]} (merge-pull-after-hand-edit!
                            #(str/replace % #"(?m)^name: .*$" "name: Hand rename 001")
                            :local-edit "Hand rename 001")]
      (is (= :conflict (:status result)))
      (is (= 1 (count (:conflicts result)))))))

(defn- run-export! [src message]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"
                                                               :initiated_by   (mt/user->id :rasta)})
        result (impl/export! (source.p/snapshot src) task message :source src)]
    (impl/handle-task-result! result task)
    result))

(deftest merge-pull-then-push-after-local-collection-rename-test
  (testing "A local collection rename merged with a remote edit to a card inside it round-trips: merge pull, then push"
    (search.tu/with-index-disabled
      (cost/do-with-content!
       {:cards 3}
       (fn [v0]
         (let [coll-id  (t2/select-one-pk :model/Collection :name "Cost")
               card-id  (t2/select-one-pk :model/Card :name "Cost card 001")
               old-path (card-path v0 "Cost card 001")
               v1       (update v0 old-path #(str/replace-first % #"(?m)^(name: .*\n)" "$1description: remote edit\n"))
               src      (rs.test/versioned-source :trees {"v0" v0 "v1" v1} :current "v1")]
           (is (not= v0 v1) "Precondition: the remote edit changed the card's file")
           (is (= :success (:status (run-import! src "v0" :force? true))) "baseline load")
           (mt/user-http-request :crowberto :put 200 (str "collection/" coll-id) {:name "Renamed"})
           (is (= "update" (t2/select-one-fn :status :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))
               "Precondition: the rename is a pending local change")
           (let [result (run-import! src "v1" :merge? true :base-snapshot (source.p/snapshot-at src "v0"))]
             (is (= :success (:status result)) (pr-str (:conflicts result))))
           (testing "app DB after the merge pull"
             (is (= "Renamed" (t2/select-one-fn :name :model/Collection :id coll-id)) "the local rename is kept")
             (is (= {:description "remote edit" :collection_id coll-id}
                    (t2/select-one [:model/Card :description :collection_id] :id card-id))
                 "the card has the remote edit and stays in the renamed collection"))
           (is (= :success (:status (run-export! src "push"))))
           (let [tree     (into {} (map (fn [p] [p (source.p/read-file (source.p/snapshot src) p)]))
                                (source.p/list-files (source.p/snapshot src)))
                 new-path (card-path tree "Cost card 001")]
             (testing "the pushed repo"
               (is (= "collections/main/renamed/cost_card_001.yaml" new-path)
                   "the card is at the renamed collection's path")
               (is (re-find #"(?m)^description: remote edit$" (get tree new-path)) "with the remote edit")
               (is (not (contains? tree old-path)) "and no longer at the old path")
               (is (empty? (filter #(str/starts-with? % "collections/main/cost/") (keys tree)))
                   "nothing is left under the old collection's directory")))))))))

(deftest second-merge-pull-conflicts-on-a-local-edit-kept-by-the-first-test
  (testing (str "A local edit that a merge pull kept stays a local change: when the remote then edits the same card, "
                "the next merge pull reports a conflict and keeps the local edit")
    (search.tu/with-index-disabled
      (cost/do-with-content!
       {:cards 3}
       (fn [v0]
         (let [path-1 (card-path v0 "Cost card 001")
               path-2 (card-path v0 "Cost card 002")
               add    (fn [description] #(str/replace-first % #"(?m)^(name: .*\n)" (str "$1description: " description "\n")))
               v1     (update v0 path-2 (add "remote edit 2"))
               v2     (update v1 path-1 (add "remote edit 1"))
               src    (rs.test/versioned-source :trees {"v0" v0 "v1" v1 "v2" v2} :current "v0")
               card-1 (t2/select-one-pk :model/Card :name "Cost card 001")]
           (is (= :success (:status (run-import! src "v0" :force? true))) "baseline load")
           (t2/update! :model/Card card-1 {:description "local edit 1"})
           (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-1} {:status "update"})
           (is (= :success (:status (run-import! src "v1" :merge? true :base-snapshot (source.p/snapshot-at src "v0"))))
               "the first merge pull folds in the remote edit of the second card and keeps the local edit of the first")
           (is (= "update" (t2/select-one-fn :status :model/RemoteSyncObject :model_type "Card" :model_id card-1))
               "the local edit is still pending")
           (let [result (run-import! src "v2" :merge? true :base-snapshot (source.p/snapshot-at src "v1"))]
             (is (= :conflict (:status result)) "the remote edit of the first card conflicts with the local edit")
             (is (= "local edit 1" (t2/select-one-fn :description :model/Card :id card-1))
                 "the local edit is not replaced"))))))))

(defn- repo-tree
  "The files of `src`'s current snapshot, as a map of path to content."
  [src]
  (let [snap (source.p/snapshot src)]
    (into {} (map (fn [p] [p (source.p/read-file snap p)])) (source.p/list-files snap))))

(defn- merge-pull-leaving-hand-edited-card-alone!
  "Loads three cards at v0; pulls v1, which edits the `name:` of \"Cost card 001\" in its file (path unchanged); makes
  a local edit to \"Cost card 002\"; then merge-pulls v2, which edits only \"Cost card 000\". Calls `f` with the
  trees `{\"v0\" .. \"v2\"}` and the id of the hand-edited card, and returns its result."
  [f]
  (search.tu/with-index-disabled
    (cost/do-with-content!
     {:cards 3}
     (fn [v0]
       (let [path-0 (card-path v0 "Cost card 000")
             path-1 (card-path v0 "Cost card 001")
             v1     (update v0 path-1 #(str/replace % #"(?m)^name: .*$" "name: Hand rename 001"))
             v2     (update v1 path-0 #(str/replace-first % #"(?m)^(name: .*\n)" "$1description: remote edit 0\n"))
             trees  {"v0" v0 "v1" v1 "v2" v2}
             src    (rs.test/versioned-source :trees trees :current "v0")
             card-1 (t2/select-one-pk :model/Card :name "Cost card 001")
             card-2 (t2/select-one-pk :model/Card :name "Cost card 002")]
         (is (= :success (:status (run-import! src "v0" :force? true))) "baseline load")
         (is (= :success (:status (run-import! src "v1"))) "pull of the hand-edited file")
         (t2/update! :model/Card card-2 {:description "local edit"})
         (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-2} {:status "update"})
         (is (= :success (:status (run-import! src "v2" :merge? true :base-snapshot (source.p/snapshot-at src "v1"))))
             "the merge pull that does not touch the hand-edited card")
         (is (= path-1 (t2/select-one-fn :file_path :model/RemoteSyncObject :model_type "Card" :model_id card-1))
             "the row of the hand-edited card keeps the path of its file in the remote tip")
         (f trees card-1))))))

(deftest hand-edited-name-stays-unchanged-after-a-merge-pull-test
  (testing "A merge pull that leaves a card with a hand-edited `name:` alone"
    (testing "does not make a later remote edit of that card conflict"
      (merge-pull-leaving-hand-edited-card-alone!
       (fn [trees _card-1]
         (let [v2     (trees "v2")
               path-1 (card-path v2 "Hand rename 001")
               v3     (update v2 path-1 #(str/replace-first % #"(?m)^(name: .*\n)" "$1description: remote edit 1\n"))
               src    (rs.test/versioned-source :trees (assoc trees "v3" v3) :current "v2")
               result (run-import! src "v3" :merge? true :base-snapshot (source.p/snapshot-at src "v2"))]
           (is (= :success (:status result)) (pr-str (:conflicts result)))
           (is (= "remote edit 1" (t2/select-one-fn :description :model/Card :name "Hand rename 001"))
               "the remote edit landed")))))
    (testing "leaves one file for that card after a later local edit and push"
      (merge-pull-leaving-hand-edited-card-alone!
       (fn [trees card-1]
         (let [src (rs.test/versioned-source :trees trees :current "v2")
               eid (t2/select-one-fn :entity_id :model/Card :id card-1)]
           (t2/update! :model/Card card-1 {:description "local edit 1"})
           (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-1} {:status "update"})
           (is (= :success (:status (run-export! src "push"))))
           (is (= 1 (count (filter #(str/includes? % (str "entity_id: " eid "\n")) (vals (repo-tree src)))))
               (pr-str (keys (repo-tree src))))))))))
