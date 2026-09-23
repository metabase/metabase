(ns metabase-enterprise.remote-sync.field-path-ops-cost-test
  "HACKRDE-28: besides the ledger-hashing pass (see [[metabase-enterprise.remote-sync.field-path-cost-test]]), every
  remote-sync operation that serializes synced cards turns each field reference into a portable path with a
  recursive `metabase_field` query: push (full and incremental), merge pull, export merge, and the export preflight
  (with and without a merge base). Cards reference a handful of fields many times over, so those lookups should be
  answered once per field, not once per reference.

  Counts calls to [[metabase.models.db/field-hierarchy-rows]] (one app-DB query each) with a thread-local redef; the
  operations here run synchronously on this thread. Not ^:parallel: it creates and syncs shared content."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.models.db :as models.db]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- synced-tree []
  (into {} (map (juxt :path :content)) (source/serialize-specs (spec/extract-entities-for-export) nil)))

(defn- run-task! [task-type f]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type :initiated_by (mt/user->id :rasta)})
        result (f task)]
    (impl/handle-task-result! result task)
    result))

(defn- edit-every-card
  "`tree` with every card's display changed, as a remote commit would."
  [tree]
  (update-vals tree #(str/replace % "display: line" "display: bar")))

(defn- mark-cards-dirty!
  "Marks the ledger rows of `card-names` as locally updated."
  [card-names]
  (doseq [id (t2/select-pks-set :model/Card :name [:in card-names])]
    (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id id} {:status "update"})))

(defn- assoc-current
  "A copy of the versioned source `src`'s trees whose current version is `version`."
  [src version]
  (rs.test/versioned-source :trees (into {} (map (fn [v]
                                                   (let [snap (source.p/snapshot-at src v)]
                                                     [v (into {} (map (juxt identity #(source.p/read-file snap %)))
                                                              (source.p/list-files snap))])))
                                         ["v0" "v1"])
                            :current version))

(def ^:private operations
  "Each operation, given the source (v0 = the synced tree, current; v1 = the remote with every card edited) and
  the card names, runs one remote-sync operation after the baseline load of v0. Returns its result."
  {:full-push
   (fn [src _names]
     (run-task! "export" #(impl/export! (source.p/snapshot src) % "push" :force? true :source src)))

   :incremental-push
   (fn [src names]
     (mark-cards-dirty! names)
     (run-task! "export" #(impl/export! (source.p/snapshot src) % "push" :source src)))

   :merge-pull
   (fn [src names]
     (mark-cards-dirty! (take 1 names))
     (run-task! "import" #(impl/import! (source.p/snapshot-at src "v1") % :merge? true
                                        :base-snapshot (source.p/snapshot-at src "v0"))))

   :export-merge
   (fn [src names]
     (mark-cards-dirty! (take 1 names))
     (run-task! "export" #(impl/export! (source.p/snapshot-at src "v1") % "push" :merge? true :source src
                                        :base-snapshot (source.p/snapshot-at src "v0"))))

   :preflight
   (fn [src _names]
     ;; the remote has advanced to v1 since the last sync (v0)
     (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly (assoc-current src "v1"))]
       (impl/preview-export-merge "main")))

   :preflight-without-merge-base
   (fn [src _names]
     (mt/with-dynamic-fn-redefs [remote-sync.task/last-version (constantly "rewritten-away")
                                 source/source-from-settings   (constantly src)]
       (impl/preview-export-merge "main")))})

(defn- field-path-queries
  "Creates `n` MBQL cards that all reference the same two venues fields, loads them, then counts field-path queries
  during `op` (a key of [[operations]]). Returns `[count result]`."
  [op n]
  (search.tu/with-index-disabled
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (let [coll  (t2/insert-returning-pk! :model/Collection {:name "Field paths" :is_remote_synced true :location "/"})
              names (mapv #(format "Field path card %03d" %) (range n))]
          (doseq [[i card-name] (map-indexed vector names)]
            (t2/insert! :model/Card
                        {:name                   card-name
                         :collection_id          coll
                         :creator_id             (mt/user->id :rasta)
                         :display                :line
                         :visualization_settings {}
                         :dataset_query          (mt/mbql-query venues
                                                   {:aggregation [[:sum $price]]
                                                    :breakout    [$category_id]
                                                    :filter      [:> $price i]})}))
          (let [v0  (synced-tree)
                src (rs.test/versioned-source :trees {"v0" v0 "v1" (edit-every-card v0)} :current "v0")]
            (is (= :success (:status (run-task! "import" #(impl/import! (source.p/snapshot-at src "v0") % :force? true))))
                "baseline load")
            (let [calls  (atom 0)
                  real   (mt/original-fn #'models.db/field-hierarchy-rows)
                  result (mt/with-dynamic-fn-redefs [models.db/field-hierarchy-rows (fn [& args] (swap! calls inc) (apply real args))]
                           ((operations op) src names))]
              [@calls result])))))))

(deftest field-path-lookups-do-not-scale-with-cards-test
  (doseq [op (sort (keys operations))]
    (testing (str op ": field-path lookups are per distinct field, not per card: 20 cards over the same fields cost no more lookups than 10")
      (let [[small small-result] (field-path-queries op 10)
            [large large-result] (field-path-queries op 20)]
        (testing (format "field-path queries: %d at 10 cards, %d at 20 cards; results %s / %s"
                         small large (pr-str (select-keys small-result [:status :clean? :conflicts :message]))
                         (pr-str (select-keys large-result [:status :clean? :conflicts :message])))
          (is (pos? small) "the scenario exercises field-path lookups at all")
          (is (= small large)))))))
