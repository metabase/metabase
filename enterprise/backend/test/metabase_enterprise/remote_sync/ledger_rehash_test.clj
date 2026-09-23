(ns metabase-enterprise.remote-sync.ledger-rehash-test
  "HACKRDE-15: rebuilding the RemoteSyncObject ledger after a full load should re-serialize only the entities whose
  file is not the one the ledger already hashed, while every stored hash keeps its meaning: the hash of Metabase's
  own serialization of the local entity, which the save-event handler compares against to suppress no-op dirty
  marks.

  Not ^:parallel: counts with thread-local redefs while an import runs on this thread."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.pull-cost-test :as pull-cost-test]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.events.core :as events]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- counting-serializations
  "Runs `thunk` counting the entities serialized to a file spec on this thread; returns [result count]."
  [thunk]
  (let [n (atom 0)]
    (mt/with-dynamic-fn-redefs [source/entity->file-spec (let [real (mt/original-fn #'source/entity->file-spec)]
                                                           (fn [& args] (swap! n inc) (apply real args)))]
      (let [result (thunk)]
        [result @n]))))

(defn- ledger-hashes-match-fresh-serialization
  "{[model_type model_id] [stored-hash fresh-hash]} for every ledger row whose stored content_hash differs from a
  fresh serialization of the local entity. Empty when every stored hash still means what it should."
  []
  (into {}
        (for [{:keys [model_type model_id content_hash]} (t2/select :model/RemoteSyncObject)
              :let [fresh (source/row->content-hash {:model_type model_type :model_id model_id})]
              :when (not= content_hash fresh)]
          [[model_type model_id] [content_hash fresh]])))

(defn- card-status [card-id]
  (t2/select-one-fn :status :model/RemoteSyncObject :model_type "Card" :model_id card-id))

(defn- noop-card-save-status!
  "Publishes a no-op update of the card named `card-name` and returns its ledger status afterwards."
  [card-name]
  (let [card (t2/select-one :model/Card :name card-name)]
    (events/publish-event! :event/card-update {:object card :previous-object card :user-id (mt/user->id :rasta)})
    (card-status (:id card))))

(def ^:private shape {:cards 10 :dashboards 2 :dashcards 3})

(def ^:private entity-count
  "Entities in `shape`: the collection, the cards and the dashboards (dashcards live in their dashboard's file)."
  (+ 1 10 2))

(deftest forced-pull-of-unchanged-content-reserializes-nothing-test
  (search.tu/with-index-disabled
    (#'pull-cost-test/do-with-content!
     shape
     (fn [tree]
       (let [src (rs.test/versioned-source :trees {"v0" tree} :current "v0")]
         (testing "baseline: the first pull hashes every entity"
           (let [[result n] (counting-serializations #(#'pull-cost-test/import-at! src "v0" :force? true))]
             (is (= :success (:status result)))
             (is (= entity-count n))))
         (testing "a forced pull of the same files re-serializes no entity to rebuild the ledger"
           (let [[result n] (counting-serializations #(#'pull-cost-test/import-at! src "v0" :force? true))]
             (is (= :success (:status result)))
             (is (= entity-count (t2/count :model/RemoteSyncObject)))
             (is (zero? n))))
         (testing "every stored hash is still the hash of a fresh serialization of the local entity"
           (is (= {} (ledger-hashes-match-fresh-serialization))))
         (testing "so a no-op save after the pull stays synced"
           (is (= "synced" (noop-card-save-status! "Cost card 003")))))))))

(deftest forced-pull-reserializes-only-files-that-differ-from-the-ledger-test
  (search.tu/with-index-disabled
    (#'pull-cost-test/do-with-content!
     shape
     (fn [tree]
       (let [[path content] (first (filter (fn [[_ c]] (str/includes? c "name: Cost card 004")) tree))
             _              (assert (str/includes? content "display: line"))
             ;; a hand edit of content (not the name: a name edit also moves the file's canonical path, which marks
             ;; later saves dirty through the file_path check, whatever the hash)
             edited         (str/replace content "display: line" "display: bar")
             ;; a hand edit that changes only the file's form: Metabase's serialization of the loaded card will
             ;; differ from these bytes, so the file's hash must not be stored
             reformatted    (let [[p c] (first (filter (fn [[_ c]] (str/includes? c "name: Cost card 005")) tree))]
                              [p (str "# edited by hand\n" c)])
             src            (rs.test/versioned-source :trees {"v0" tree
                                                              "v1" (-> tree
                                                                       (assoc path edited)
                                                                       (conj reformatted))}
                                                      :current "v0")]
         (is (= :success (:status (#'pull-cost-test/import-at! src "v0" :force? true))) "baseline load")
         (testing "a forced pull re-serializes exactly the two entities whose file changed"
           (let [[result n] (counting-serializations #(#'pull-cost-test/import-at! src "v1" :force? true))]
             (is (= :success (:status result)))
             (is (= 2 n))))
         (testing "every stored hash is the hash of a fresh serialization, not of a hand-edited file"
           (is (= {} (ledger-hashes-match-fresh-serialization))))
         (testing "no-op saves of both the edited and an untouched card stay synced"
           (is (= :bar (t2/select-one-fn :display :model/Card :name "Cost card 004")))
           (is (= "synced" (noop-card-save-status! "Cost card 004")))
           (is (= "synced" (noop-card-save-status! "Cost card 005")))
           (is (= "synced" (noop-card-save-status! "Cost card 006")))))))))
