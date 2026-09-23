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
  "Loads three cards at v0; pulls v1, whose only change is `hand-edit` applied to card 1's file (path unchanged);
  makes an unrelated local edit to card 2 (so the next pull must merge); then merge-pulls v2, which renames card 1
  in its file again. Returns the merge-pull result and the card names afterwards. With `:local-edit` naming a card,
  that card gets the local edit instead of card 2."
  [hand-edit & {:keys [local-edit] :or {local-edit "Cost card 002"}}]
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
