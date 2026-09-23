(ns metabase-enterprise.remote-sync.merge-false-conflict-test
  "A merge pull must not report a conflict on an entity nobody changed locally, even when the repo's file for it is
  not byte-identical to what Metabase would serialize (a `name:` edited without renaming the file, or hand-written
  YAML).

  Not ^:parallel: uses the shared remote-sync fixtures and [[pull-cost-test/do-with-content!]]."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.pull-cost-test :as pull-cost-test]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
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

(defn- merge-pull-on-route!
  "Merge-pulls `version` of `src` with `base-version` as the merge base, on merge `route`: `:incremental` leaves the
  incremental plan alone (so the pull takes the incremental route when the remote changes allow it) and `:full`
  forces it off, so every local entity is serialized and the whole merged tree is loaded. Returns `[result
  route-taken]`."
  [route src version base-version]
  (let [plans  (atom [])
        result (mt/with-dynamic-fn-redefs [impl/incremental-import-plan
                                           (fn [& args]
                                             (let [p (if (= :full route)
                                                       :remote-sync/incremental-not-possible
                                                       (apply (dynamic-redefs/original-fn #'impl/incremental-import-plan)
                                                              args))]
                                               (swap! plans conj p)
                                               p))]
                 (run-import! src version :merge? true :base-snapshot (source.p/snapshot-at src base-version)))]
    [result (if (some #{:remote-sync/incremental-not-possible} @plans) :full :incremental)]))

(defn- merge-pull-after-hand-edit!
  "Loads three cards at v0; pulls v1, whose only change is `hand-edit` applied to card 1's file (path unchanged);
  makes an unrelated local edit to card 2 (so the next pull must merge); then merge-pulls v2, which renames card 1
  in its file again. Returns the merge-pull result, the card names afterwards, and `:route`, the merge route the
  merge pull took. With `:local-edit` naming a card, that card gets the local edit instead of card 2.

  `route` picks the merge route: `:incremental` (v2 is incrementally loadable, so only the remote-changed local
  entities are serialized and merged) or `:full` (the incremental plan is forced off, so every local entity is
  serialized and the whole merged tree is loaded)."
  [route hand-edit & {:keys [local-edit] :or {local-edit "Cost card 002"}}]
  (search.tu/with-index-disabled
    (#'pull-cost-test/do-with-content!
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
         (let [[result taken] (merge-pull-on-route! route src "v2" "v1")]
           {:result result
            :route  taken
            :cards  (into {} (map (juxt :name :description)) (t2/select [:model/Card :name :description]))}))))))

(def ^:private routes [:full :incremental])

(deftest merge-pull-after-name-only-edit-test
  (doseq [route routes]
    (testing (str route " merge route: a card whose `name:` was edited in the repo without renaming its file is not a local change")
      (let [{:keys [result cards] taken :route} (merge-pull-after-hand-edit!
                                                 route #(str/replace % #"(?m)^name: .*$" "name: Hand rename 001"))]
        (is (= route taken) "Precondition: the merge pull took this route")
        (is (= :success (:status result)) (pr-str (:conflicts result)))
        (is (contains? cards "Remote rename 001") "the remote's second rename landed")
        (is (= "local edit" (get cards "Cost card 002")) "the local change was kept")))))

(deftest merge-pull-after-hand-written-yaml-test
  (doseq [route routes]
    (testing (str route " merge route: a card whose file differs from Metabase's own serialization only in text is not a local change")
      (let [{:keys [result cards] taken :route} (merge-pull-after-hand-edit! route #(str "# edited by hand\n" %))]
        (is (= route taken) "Precondition: the merge pull took this route")
        (is (= :success (:status result)) (pr-str (:conflicts result)))
        (is (contains? cards "Remote rename 001") "the remote's rename landed")
        (is (= "local edit" (get cards "Cost card 002")) "the local change was kept")))))

(deftest merge-pull-still-conflicts-on-a-real-local-edit-test
  (doseq [route routes]
    (testing (str route " merge route: a hand-edited card that was also edited locally still conflicts with the remote's edit")
      (let [{:keys [result] taken :route} (merge-pull-after-hand-edit!
                                           route #(str/replace % #"(?m)^name: .*$" "name: Hand rename 001")
                                           :local-edit "Hand rename 001")]
        (is (= route taken) "Precondition: the merge pull took this route")
        (is (= :conflict (:status result)))
        (is (= 1 (count (:conflicts result))))))))

(defn- run-export! [src message]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"
                                                               :initiated_by   (mt/user->id :rasta)})
        result (impl/export! (source.p/snapshot src) task message :source src)]
    (impl/handle-task-result! result task)
    result))

(deftest merge-pull-then-push-after-local-collection-rename-test
  (doseq [route routes]
    (testing (str route " merge route: a local collection rename merged with a remote edit to a card inside it round-trips: merge pull, then push")
      (search.tu/with-index-disabled
        (#'pull-cost-test/do-with-content!
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
             (let [[result taken] (merge-pull-on-route! route src "v1" "v0")]
               (is (= route taken) "Precondition: the merge pull took this route")
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
                     "nothing is left under the old collection's directory"))))))))))
