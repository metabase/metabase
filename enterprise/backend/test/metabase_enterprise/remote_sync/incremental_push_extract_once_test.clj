(ns metabase-enterprise.remote-sync.incremental-push-extract-once-test
  "HACKRDE-46: an incremental push (dirty rows, no divergence) used to extract every dirty entity twice: once to
  plan the push (where each file goes, whether the incremental path is possible at all) and again to stage the
  writes. Planning and staging now share one extraction per entity.

  Counts calls to [[metabase.models.serialization/extract-one]] with a thread-local redef; the export runs
  synchronously on this thread. Not ^:parallel: it creates and syncs shared content."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.models.serialization :as serdes]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- run-task! [task-type f]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type :initiated_by (mt/user->id :rasta)})
        result (f task)]
    (impl/handle-task-result! result task)
    result))

(defn- push-edited-cards!
  "Creates `n` cards in a synced collection, loads them, edits every card locally, then runs an incremental push.
  Returns `{:extracted {model-type calls} :result export-result :tree {path content}}`."
  [n]
  (search.tu/with-index-disabled
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (let [coll (t2/insert-returning-pk! :model/Collection {:name "Extract once" :is_remote_synced true :location "/"})]
          (doseq [i (range n)]
            (t2/insert! :model/Card
                        {:name                   (format "Extract once card %03d" i)
                         :collection_id          coll
                         :creator_id             (mt/user->id :rasta)
                         :display                :line
                         :visualization_settings {}
                         :dataset_query          (mt/mbql-query venues {:aggregation [[:count]] :filter [:> $price i]})}))
          (let [v0  (into {} (map (juxt :path :content)) (source/serialize-specs (spec/extract-entities-for-export) nil))
                src (rs.test/versioned-source :trees {"v0" v0} :current "v0")]
            (is (= :success (:status (run-task! "import" #(impl/import! (source.p/snapshot src) % :force? true))))
                "baseline load")
            ;; a local edit to every card: the ledger rows go dirty ("update") and the content changes
            (t2/update! :model/Card {:collection_id coll} {:display :bar})
            (t2/update! :model/RemoteSyncObject {:model_type "Card"} {:status "update"})
            (let [calls  (atom {})
                  real   (mt/original-fn #'serdes/extract-one)
                  result (mt/with-dynamic-fn-redefs [serdes/extract-one (fn [model-name & args]
                                                                          (swap! calls update model-name (fnil inc 0))
                                                                          (apply real model-name args))]
                           (run-task! "export" #(impl/export! (source.p/snapshot src) % "push" :source src)))
                  snap   (source.p/snapshot src)]
              {:extracted @calls
               :result    result
               :tree      (into {} (map (juxt identity #(source.p/read-file snap %))) (source.p/list-files snap))})))))))

(deftest incremental-push-extracts-each-dirty-entity-once-test
  (let [n 10
        {:keys [extracted result tree]} (push-edited-cards! n)
        card-files (into {} (filter #(str/includes? (val %) "Extract once card")) tree)]
    (testing "the push succeeds and wrote every edited card"
      (is (= :success (:status result)))
      (is (= {:kind "pushed" :count n} (select-keys (:outcome result) [:kind :count]))
          "incremental path: exactly the dirty cards were written, no full export")
      (is (= n (count card-files)))
      (is (every? #(str/includes? % "display: bar") (vals card-files))))
    (testing "each dirty card is extracted once, not once to plan and again to stage"
      (is (= {"Card" n} extracted)))))
