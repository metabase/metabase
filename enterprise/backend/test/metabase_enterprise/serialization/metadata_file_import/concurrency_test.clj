(ns metabase-enterprise.serialization.metadata-file-import.concurrency-test
  "Tests for the in-JVM concurrency guard on metadata-file-import. The guard
  is a single Clojure agent serializing all imports plus a busy-predicate
  registered with `metabase.sync.util` so that warehouse-sync skips with a
  WARN log line whenever an import is in flight."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import :as mfi]
   [metabase.sync.util :as sync.util]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (java.io File)
   (java.time Instant)))

(use-fixtures :once
  (fn [thunk]
    (mt/with-temporary-setting-values [disable-auto-sync true]
      (mt/test-helpers-set-global-values!
        (thunk)))))

(defn- tiny-meta-file ^File [data]
  (let [f (File/createTempFile "mfi-concurrency-" ".json")]
    (.deleteOnExit f)
    (spit f (json/encode data))
    f))

(defn- tiny-payload [db-name]
  {:databases [{:id 7 :name db-name :engine "postgres"}]
   :tables    [{:id 100 :db_id 7 :schema "public" :name "t"}]
   :fields    [{:id 1000 :table_id 100 :name "x"
                :base_type "type/Integer" :database_type "integer"}]})

;;; ============================== import-running? ==============================

(deftest import-running-false-when-idle-test
  (testing "import-running? returns false when no import is in flight"
    (await @#'mfi/import-agent)
    (is (false? (mfi/import-running?)))))

(deftest import-running-toggles-around-enqueue-test
  (testing "import-running? is true mid-flight, false after the agent settles"
    (mt/with-temp [:model/Database {} {:name "mfi-running-toggles" :engine :postgres}]
      (let [file        (tiny-meta-file (tiny-payload "mfi-running-toggles"))
            observed    (atom nil)
            ;; Wrap the real import in a function that records the running
            ;; flag at a known mid-flight point. Restoring redefs after the
            ;; await guarantees we observe the actual `:running` state.
            real-import mfi/import-metadata-file!]
        (with-redefs [mfi/import-metadata-file!
                      (fn [f] (reset! observed (mfi/import-running?))
                        (real-import f))]
          (mfi/enqueue-import! file)
          (await @#'mfi/import-agent))
        (is (true? @observed)
            "import-running? is true while the agent is inside the import fn")
        (is (false? (mfi/import-running?))
            "import-running? is false again once the agent finishes")))))

;;; ============================== Serialization ==============================

(deftest two-enqueues-run-sequentially-test
  (testing "two enqueued imports execute one-at-a-time, in arrival order"
    (mt/with-temp [:model/Database {} {:name "mfi-seq-1" :engine :postgres}
                   :model/Database {} {:name "mfi-seq-2" :engine :postgres}]
      (let [f1     (tiny-meta-file (tiny-payload "mfi-seq-1"))
            f2     (tiny-meta-file (tiny-payload "mfi-seq-2"))
            events (atom [])
            real-import mfi/import-metadata-file!]
        (with-redefs [mfi/import-metadata-file!
                      (fn [f]
                        (swap! events conj [:start (.getName f) (System/nanoTime)])
                        (real-import f)
                        (swap! events conj [:end (.getName f) (System/nanoTime)]))]
          (mfi/enqueue-import! f1)
          (mfi/enqueue-import! f2)
          (await @#'mfi/import-agent))
        (let [evs @events]
          (is (= 4 (count evs)) "two starts + two ends")
          (is (= :start (first  (nth evs 0))))
          (is (= :end   (first  (nth evs 1))))
          (is (= :start (first  (nth evs 2))))
          (is (= :end   (first  (nth evs 3))))
          (is (= (second (nth evs 0)) (second (nth evs 1)))
              "first import's start and end are for the same file")
          (is (= (second (nth evs 2)) (second (nth evs 3)))
              "second import's start and end are for the same file")
          (is (<= (nth (nth evs 1) 2) (nth (nth evs 2) 2))
              "second import does not start until first has finished"))))))

;;; ============================== Agent does not poison ==============================

(deftest agent-survives-failing-import-test
  (testing "an exception inside the import body does not leave the agent in a failed state"
    (await @#'mfi/import-agent)
    (with-redefs [mfi/import-metadata-file!
                  (fn [_f] (throw (ex-info "synthetic" {:kind :test-failure})))]
      (mfi/enqueue-import! (tiny-meta-file (tiny-payload "mfi-fail")))
      (await @#'mfi/import-agent))
    (is (nil? (agent-error @#'mfi/import-agent))
        "agent did not enter failed state")
    (is (false? (mfi/import-running?))
        "state reset to :idle after the failure")))

;;; ============================== Sync-side skip ==============================

(deftest sync-skips-when-import-is-running-test
  (testing "sync.util/do-sync-operation skips its body when an import is in flight"
    (mt/with-temp [:model/Database db {:name "mfi-sync-skip" :engine :postgres}]
      (let [import-state (deref #'mfi/import-state)]
        (try
          (reset! import-state {:status :running
                                :file   "test-file"
                                :since  (Instant/now)})
          (let [sync-ran? (atom false)]
            (sync.util/do-sync-operation
             :sync-metadata
             db
             "test-sync"
             (fn [] (reset! sync-ran? true) :result-not-checked))
            (is (false? @sync-ran?)
                "sync body did NOT run because import-busy short-circuited it"))
          (finally
            (reset! import-state {:status :idle :file nil :since nil :last-result nil})))))))

(deftest sync-runs-normally-when-no-import-in-flight-test
  (testing "control: sync body executes normally when no import is in flight"
    ;; The namespace fixture sets `disable-auto-sync true`, which itself makes
    ;; `should-sync?` short-circuit before the busy-check runs. Re-enable it
    ;; locally so we're actually exercising the busy-check path.
    (mt/with-temporary-setting-values [disable-auto-sync false]
      (mt/with-temp [:model/Database db {:name "mfi-sync-control" :engine :postgres}]
        (await @#'mfi/import-agent)
        (let [sync-ran? (atom false)]
          (sync.util/do-sync-operation
           :sync-metadata
           db
           "test-sync-control"
           (fn [] (reset! sync-ran? true) :result-not-checked))
          (is (true? @sync-ran?)
              "sync body DID run because no import is busy"))))))
