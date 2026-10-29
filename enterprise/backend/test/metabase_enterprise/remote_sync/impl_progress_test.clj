(ns metabase-enterprise.remote-sync.impl-progress-test
  "Progress reporting through the export serialize phase (GHY-4132) and the import phases (GHY-4593)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as rst]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state)

;;; ------------------------------------------------- Import phases --------------------------------------------------

(def ^:private collection-path
  "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/M-Q4pcV0qkiyJ0kiSWECl_some_collection.yaml")

(def ^:private card-path
  "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/cards/f1C68pznmrpN1F5xFDj6d_some_question.yaml")

(defn- tree [card-name]
  {collection-path (rs.test/generate-collection-yaml "M-Q4pcV0qkiyJ0kiSWECl" "Some Collection")
   card-path       (rs.test/generate-card-yaml "f1C68pznmrpN1F5xFDj6d" card-name "M-Q4pcV0qkiyJ0kiSWECl")})

(defn- import-capturing-progress!
  "Runs `import!` of `snapshot` with the reporter replaced by one that records every fraction it would write
  (`:throttle-ms` 0 unless `opts` say otherwise). Records the result on the task. Returns [result fractions]."
  [snapshot & {:keys [force? throttle-ms now-fn] :or {throttle-ms 0 now-fn (constantly 0)}}]
  ;; the card in [[tree]] references the test-data database, which must exist before the load
  (mt/db)
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
        writes  (atom [])]
    (mt/with-dynamic-fn-redefs [impl/import-progress-reporter
                                (fn [_task-id]
                                  (rst/make-progress-reporter task-id {:throttle-ms throttle-ms
                                                                       :now-fn      now-fn
                                                                       :write-fn    (fn [f] (swap! writes conj f))}))]
      (let [result (impl/import! snapshot task-id :force? force?)]
        (impl/handle-task-result! result task-id)
        [result @writes]))))

(def ^:private checkpoints
  "Forced writes of a full import, in order: conflict scan, load start, load done, reconcile start, commit, reindex."
  [0.02 0.05 0.7 0.75 0.9 0.95])

(defn- approx= [expected actual]
  (and (= (count expected) (count actual))
       (every? true? (map #(< (abs (- %1 %2)) 1e-9) expected actual))))

(deftest full-import-progress-is-monotonic-and-checkpointed-test
  (testing "a first import reports 0.02 before the conflict scan, one fraction per loaded entity inside [0.05 0.7], then the fixed checkpoints"
    (search.tu/with-index-disabled
      (let [src             (rs.test/versioned-source :trees {"v0" (tree "Some Question")} :current "v0")
            [result writes] (import-capturing-progress! (source.p/snapshot src))]
        (is (= :success (:status result)))
        (is (= writes (sort writes)) "never moves backward")
        ;; two entities: the collection at the halfway point of the load range, the card on its top
        (is (approx= [0.02 0.05 0.375 0.7 0.7 0.75 0.9 0.95] writes))))))

(deftest per-entity-progress-writes-are-throttled-test
  (testing "with the real throttle and a frozen clock, only the forced checkpoints are written"
    (search.tu/with-index-disabled
      (let [src            (rs.test/versioned-source :trees {"v0" (tree "Some Question")} :current "v0")
            [result writes] (import-capturing-progress! (source.p/snapshot src) :throttle-ms 10000)]
        (is (= :success (:status result)))
        (is (= checkpoints writes))))))

(deftest incremental-import-progress-test
  (testing "an incremental pull skips the conflict-scan checkpoint and reports the changed entity inside the load range"
    (search.tu/with-index-disabled
      (let [src (rs.test/versioned-source :trees {"v0" (tree "Some Question") "v1" (tree "Renamed Question")} :current "v0")]
        (is (= :success (:status (first (import-capturing-progress! (source.p/snapshot-at src "v0") :force? true)))))
        (let [[result writes] (import-capturing-progress! (source.p/snapshot-at src "v1"))]
          (is (= :success (:status result)))
          (is (= {:kind "pulled" :count 1} (dissoc (:outcome result) :branch))
              "the incremental path ran: one changed entity pulled")
          ;; no conflict scan; the single changed entity lands on the top of the load range
          (is (= [0.05 0.7 0.7 0.75 0.9 0.95] writes)))))))

;;; ------------------------------------------------- Export phases --------------------------------------------------

;; A CommitBuilder that records staged paths and does nothing else.
(defrecord RecordingCommit [staged]
  source.p/CommitBuilder
  (stage-upsert! [_ {:keys [path]}] (swap! staged conj path) nil)
  (stage-delete! [_ _] nil)
  (replace-all! [_] nil)
  (empty-commit? [_] false)
  (finish-commit! [_ _message] "sha")
  (abort-commit! [_] nil))

(deftest stage-writes-invokes-on-chunk-with-cumulative-count-test
  (testing "stage-writes calls on-chunk once per chunk with the running staged count, and stages everything"
    (mt/with-dynamic-fn-redefs [;; make each row its own chunk (matching the real {:model_type :rows} chunk shape) and a
                                ;; trivial entity, so we exercise the loop deterministically without hitting serdes/the app DB
                                impl/->sized-chunks (fn [rows] (map (fn [row] {:model_type (:model_type row) :rows [row]}) rows))
                                impl/extract-chunk  (fn [{:keys [rows]}] (map (fn [row] [row {:e (:model_id row)}]) rows))]
      (let [staged (atom [])
            commit (->RecordingCommit staged)
            rows   [{:model_type "card" :model_id 1 :file_path "a"}
                    {:model_type "card" :model_id 2 :file_path "b"}
                    {:model_type "card" :model_id 3 :file_path "c"}]
            seen   (atom [])]
        (#'impl/stage-writes commit {} rows (fn [n] (swap! seen conj n)))
        (is (= [1 2 3] @seen) "cumulative staged count reported once per chunk")
        (is (= ["a" "b" "c"] @staged) "all rows staged")))))

(deftest finish-commit-reports-commit-checkpoint-test
  (testing "commit-staged! passes the progress callback to finish-commit!, invoked at the commit checkpoint"
    (let [reported (atom [])
          commit   (reify source.p/CommitBuilder
                     (stage-upsert! [_ _] nil)
                     (stage-delete! [_ _] nil)
                     (replace-all! [_] nil)
                     (empty-commit? [_] false)
                     (finish-commit! [_ _message] "sha")
                     (finish-commit! [_ _message report] (when report (report 0.8 {:force? true})) "sha")
                     (abort-commit! [_] nil))]
      (mt/with-dynamic-fn-redefs [source.p/open-commit (fn [_] commit)]
        (#'impl/commit-staged! {:managed-dirs []} "msg"
                               (fn [_c] [{:id 1}])
                               (fn [f & _] (swap! reported conj f))))
      (is (= [0.8] @reported)))))
