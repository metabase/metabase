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
   (java.io File)))

(set! *warn-on-reflection* true)

;; Kondo flags `test-helpers-set-global-values!` inside any fixture as
;; "destructive in parallel context". Here it is *intentionally* the opt-out
;; switch — without it the agent runs on a separate connection that can't see
;; the test's mt/with-temp rollback-only state.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :once
  (fn [thunk]
    ;; Warm test-data (load + sync) before disabling auto-sync: the first load must not happen with
    ;; sync off, or with-temp defaults that resolve test-data tables (e.g. `(data/id :checkins)`) fail.
    (mt/db)
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
                      (fn [^java.io.File f]
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

;;; ============================== Registry ==============================

(deftest enqueue-import-returns-string-id-and-creates-queued-record-test
  (testing "enqueue-import! returns a string UUID id and synchronously inserts a :queued record"
    (await @#'mfi/import-agent)
    ;; Block the agent so we can observe the :queued record before it transitions.
    (let [release (promise)]
      (with-redefs [mfi/import-metadata-file! (fn [_f] @release :ok)]
        (let [id (mfi/enqueue-import! (tiny-meta-file (tiny-payload "mfi-queued")))]
          (is (string? id) "enqueue-import! returns a string id, not :queued")
          (is (uuid? (java.util.UUID/fromString id))
              "the returned id parses as a UUID")
          (let [record (mfi/import-status id)]
            (is (some? record) "a registry record exists for the returned id")
            (is (= id (:id record)))
            (is (contains? #{:queued :running} (:status record))
                "record is :queued (or already :running if the agent picked it up)")
            (is (some? (:enqueued-at record)) ":enqueued-at is set on insert"))
          (deliver release :go)
          (await @#'mfi/import-agent))))))

(deftest record-transitions-queued-running-ok-test
  (testing "the registry record moves :queued -> :running -> :ok through the agent"
    (mt/with-temp [:model/Database {} {:name "mfi-lifecycle-ok" :engine :postgres}]
      (await @#'mfi/import-agent)
      (let [file (tiny-meta-file (tiny-payload "mfi-lifecycle-ok"))
            id   (mfi/enqueue-import! file)]
        ;; Capturing the record mid-flight is racy; settle the agent and assert
        ;; the terminal record — the recorded timestamps prove it passed
        ;; through :running.
        (await @#'mfi/import-agent)
        (let [record (mfi/import-status id)]
          (is (some? record))
          (is (= :ok (:status record)) "terminal status is :ok on success")
          (is (some? (:started-at record)) ":started-at set => passed through :running")
          (is (some? (:finished-at record)) ":finished-at set on completion")
          (is (number? (:wall-ms record)) ":wall-ms recorded on completion")
          (is (nil? (:error record)) "no :error on a successful import"))))))

(deftest record-transitions-to-error-on-failing-import-test
  (testing "a failing import yields an :error record and does not poison the agent"
    (await @#'mfi/import-agent)
    (let [id (with-redefs [mfi/import-metadata-file!
                           (fn [_f] (throw (ex-info "synthetic failure" {:kind :test-failure})))]
               (let [id (mfi/enqueue-import! (tiny-meta-file (tiny-payload "mfi-lifecycle-err")))]
                 (await @#'mfi/import-agent)
                 id))]
      (is (nil? (agent-error @#'mfi/import-agent))
          "agent did not enter a failed state")
      (let [record (mfi/import-status id)]
        (is (some? record))
        (is (= :error (:status record)) "terminal status is :error on failure")
        (is (some? (:started-at record)))
        (is (some? (:finished-at record)))
        (is (number? (:wall-ms record)))
        (is (string? (:error record)) ":error holds a stringified exception")))))

(deftest import-status-nil-for-unknown-id-test
  (testing "import-status returns nil for an id that was never enqueued"
    (is (nil? (mfi/import-status (str (java.util.UUID/randomUUID))))
        "unknown id => nil")
    (is (nil? (mfi/import-status "not-even-a-uuid"))
        "garbage id => nil")))

;;; ============================== Eviction ==============================

(defn- terminal-record [i]
  [(str "id-" i) {:id (str "id-" i) :status :ok
                  :finished-at (java.time.Instant/ofEpochSecond i)}])

(deftest prune-terminal-records-noop-under-bound-test
  (testing "prune-terminal-records leaves the registry untouched when terminal count is within the bound"
    (let [limit @#'mfi/terminal-record-limit
          reg   (into {} (map terminal-record) (range (dec limit)))]
      (is (= reg (#'mfi/prune-terminal-records reg))))))

(deftest prune-terminal-records-drops-oldest-terminal-test
  (testing "prune-terminal-records caps terminal records at the bound, dropping the oldest by :finished-at"
    (let [limit  @#'mfi/terminal-record-limit
          extra  5
          reg    (into {} (map terminal-record) (range (+ limit extra)))
          pruned (#'mfi/prune-terminal-records reg)]
      (is (= limit (count pruned))
          "terminal records are capped at the bound")
      (is (every? #(contains? pruned (str "id-" %)) (range extra (+ limit extra)))
          "the most-recent `limit` records are retained")
      (is (not-any? #(contains? pruned (str "id-" %)) (range extra))
          "the oldest records are evicted"))))

(deftest prune-terminal-records-never-drops-in-flight-test
  (testing ":queued and :running records are never pruned, regardless of count"
    (let [limit     @#'mfi/terminal-record-limit
          in-flight (into {} (for [i (range (* 3 limit))]
                               [(str "q-" i) {:id (str "q-" i)
                                              :status (if (even? i) :queued :running)}]))
          terminal  (into {} (map terminal-record) (range (* 2 limit)))
          pruned    (#'mfi/prune-terminal-records (merge in-flight terminal))]
      (is (every? #(contains? pruned (str "q-" %)) (range (* 3 limit)))
          "every in-flight record survives")
      (is (= limit (count (filter (comp #{:ok} :status val) pruned)))
          "terminal records are still capped at the bound"))))

;;; ============================== Sync-side skip ==============================

(deftest sync-skips-when-import-is-running-test
  (testing "sync.util/do-sync-operation skips its body when an import is in flight"
    (mt/with-temp [:model/Database db {:name "mfi-sync-skip" :engine :postgres}]
      (await @#'mfi/import-agent)
      ;; Drive a real :running record into the registry by blocking the agent
      ;; inside a redef'd slow import, then exercise the busy-check while it sits.
      (let [release (promise)]
        (with-redefs [mfi/import-metadata-file! (fn [_f] @release :ok)]
          (mfi/enqueue-import! (tiny-meta-file (tiny-payload "mfi-sync-skip")))
          ;; Wait until the agent has actually flipped a record to :running.
          (let [deadline (+ (System/currentTimeMillis) 5000)]
            (while (and (not (mfi/import-running?))
                        (< (System/currentTimeMillis) deadline))
              (Thread/sleep 10)))
          (try
            (is (true? (mfi/import-running?))
                "an import is in flight before we exercise the busy-check")
            (let [sync-ran? (atom false)]
              (sync.util/do-sync-operation
               :sync-metadata
               db
               "test-sync"
               (fn [] (reset! sync-ran? true) :result-not-checked))
              (is (false? @sync-ran?)
                  "sync body did NOT run because import-busy short-circuited it"))
            (finally
              (deliver release :go)
              (await @#'mfi/import-agent))))))))

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
