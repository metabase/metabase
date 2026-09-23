(ns metabase-enterprise.remote-sync.pull-cost-test
  "Example cost test for the git-sync perf cards: counts, not clocks.

  A worked example to copy and adapt freely — change the content shape, what you measure, what you assert. Runs
  on the default H2 test app DB in seconds; no Docker, no git, no big dataset. Not ^:parallel: the JDBC counter
  ([[metabase-enterprise.remote-sync.db-activity]]) is JVM-wide.

  Per-entity cost is the difference between two sizes of the same content (10 vs 20 cards), which cancels the
  fixed per-pull overhead. Costs are linear per entity, so small sizes give the same per-entity numbers as
  thousands of entities (see GIT-SYNC-PULL-SQL-COST.md).

  What `measure` returns: every JDBC-level count from `db-activity/count-db-activity` (:statements :prepares
  :checkouts :checkins :transactions :savepoints :commits :rollbacks — see that ns), plus two domain counts:
  - :metadata-inferences Card result_metadata inferences (QP preprocessing). Counted with a thread-local redef,
                         so only on this thread; the imports here run synchronously on it.
  - :rows-rewritten      synced cards/dashboards whose updated_at moved during the thunk"
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db-activity :as db-activity]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

;;; ------------------------------------------------ measuring ------------------------------------------------

(defn- counting [counter real]
  (fn [& args] (swap! counter inc) (apply real args)))

(defn- max-updated-at []
  {:card      (t2/select-one-fn :m :model/Card {:select [[:%max.updated_at :m]]})
   :dashboard (t2/select-one-fn :m :model/Dashboard {:select [[:%max.updated_at :m]]})})

(defn- rewritten-since [{:keys [card dashboard]}]
  (+ (t2/count :model/Card :updated_at [:> card])
     (t2/count :model/Dashboard :updated_at [:> dashboard])))

(defn measure
  "Runs `thunk` and returns its result under :result plus the counts described in the ns docstring."
  [thunk]
  (let [inferences (atom 0)
        before     (max-updated-at)]
    (Thread/sleep 5) ; so updated_at written during the thunk is strictly later than `before`
    (mt/with-dynamic-fn-redefs [card.metadata/infer-metadata
                                (counting inferences (mt/original-fn #'card.metadata/infer-metadata))]
      (let [counts (db-activity/count-db-activity thunk)]
        (assoc counts
               :metadata-inferences @inferences
               :rows-rewritten      (rewritten-since before))))))

(def ^:private cost-keys
  [:statements :prepares :checkouts :checkins :transactions :savepoints :releases :commits :rollbacks
   :metadata-inferences :rows-rewritten])

(defn per-entity
  "Per-entity cost from two measurements of the same scenario at sizes `n-small` and `n-large`."
  [small large n-small n-large]
  (into {}
        (for [k cost-keys]
          [k (double (/ (- (k large) (k small)) (- n-large n-small)))])))

;;; ------------------------------------------------ content ------------------------------------------------

(defn- synced-tree
  "What a fresh export of the remote-synced content would write, as {path content}."
  []
  (into {} (map (juxt :path :content)) (source/serialize-specs (spec/extract-entities-for-export) nil)))

(defn- do-with-content!
  "Creates a remote-synced collection with `cards` MBQL cards (3 field refs each) and `dashboards` dashboards of
  `dashcards` dashboard cards, then calls `f` with the serialized tree."
  [{:keys [cards dashboards dashcards] :or {dashboards 0 dashcards 0}} f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/Collection]
      (let [coll     (t2/insert-returning-pk! :model/Collection {:name "Cost" :is_remote_synced true :location "/"})
            card-ids (vec (for [i (range cards)]
                            (t2/insert-returning-pk!
                             :model/Card
                             {:name                   (format "Cost card %03d" i)
                              :collection_id          coll
                              :creator_id             (mt/user->id :rasta)
                              :display                :line
                              :visualization_settings {}
                              :dataset_query          (mt/mbql-query venues
                                                        {:aggregation [[:sum $price]]
                                                         :breakout    [$category_id]
                                                         :filter      [:> $price i]})})))]
        (dotimes [d dashboards]
          (let [dash (t2/insert-returning-pk! :model/Dashboard {:name (format "Cost dash %03d" d) :collection_id coll
                                                                :creator_id (mt/user->id :rasta) :parameters []})]
            (when (pos? dashcards)
              (t2/insert! :model/DashboardCard
                          (for [k (range dashcards)]
                            {:dashboard_id dash :card_id (card-ids (mod (+ d k) (count card-ids)))
                             :row (* 4 k) :col 0 :size_x 12 :size_y 4
                             :parameter_mappings [] :visualization_settings {}})))))
        (f (synced-tree))))))

;;; ------------------------------------------------ scenarios ------------------------------------------------

(defn- import-at!
  "Runs `import!` synchronously on this thread (so thread-bound counters see it) against `src` at `version`, and
  records the result on a task row."
  [src version & {:keys [force?]}]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
        result (impl/import! (source.p/snapshot-at src version) task :force? (boolean force?))]
    (impl/handle-task-result! result task)
    result))

(defn- forced-reload-of-unchanged!
  "Load `shape` once, then measure a forced pull of the very same content."
  [shape]
  (search.tu/with-index-disabled
    (do-with-content! shape
                      (fn [tree]
                        (let [src (rs.test/versioned-source :trees {"v0" tree} :current "v0")]
                          (is (= :success (:status (import-at! src "v0" :force? true))) "baseline load")
                          (measure #(import-at! src "v0" :force? true)))))))

;;; ------------------------------------------------ tests ------------------------------------------------

(deftest pull-cost-report-test
  (testing "Report per-card cost of a forced reload (always green; read the printed numbers)"
    (let [small (forced-reload-of-unchanged! {:cards 10})
          large (forced-reload-of-unchanged! {:cards 20})
          cost  (per-entity small large 10 20)]
      (log/infof "per MBQL card, forced reload of unchanged content: %s" cost)
      (is (= :success (get-in large [:result :status]))))))

;;; Example red tests, kept in a comment so the committed suite stays green. Copy one into your card's test,
;;; uncomment it, watch it fail, then make it pass. Today, on H2, per MBQL card on a forced reload of unchanged
;;; content: 16 statements, 3 check-outs/check-ins, 1 transaction, 1 savepoint, 1 commit, 1 metadata inference,
;;; 1 row rewritten.
(comment
  (deftest forced-reload-of-unchanged!-content-rewrites-nothing-test
    (testing "Card 2 red test (example): a forced pull of content identical to local rewrites no rows. RED today."
      (let [m (forced-reload-of-unchanged! {:cards 10 :dashboards 2 :dashcards 5})]
        (is (= :success (get-in m [:result :status])))
        (is (zero? (:rows-rewritten m))))))

  (deftest reload-statement-budget-test
    (testing "Card 4-style budget (example): JDBC statements per card on a forced reload stay under a target.
              RED today; the target is illustrative."
      (let [cost (per-entity (forced-reload-of-unchanged! {:cards 10})
                             (forced-reload-of-unchanged! {:cards 20})
                             10 20)]
        (is (<= (:statements cost) 10.0))))))
