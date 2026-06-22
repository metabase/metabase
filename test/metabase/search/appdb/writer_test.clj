(ns metabase.search.appdb.writer-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.index-state :as index-state]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.table :as search.table]
   [metabase.search.appdb.writer :as search.writer]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test.fixtures :as fixtures])
  (:import
   (org.postgresql.util PSQLException PSQLState)))

(set! *warn-on-reflection* true)

;; classify-upsert-error's :stale-table branch calls table/exists?, which needs a configured app DB.
(use-fixtures :once (fixtures/initialize :db))

;;; ---------------------------------- Reindex-mode write routing -----------------------------------

(deftest reindex-mode-write-routing-test
  (let [write-targets     #'search.writer/write-targets
        commits?          #'search.index/commits-per-batch?
        target-labels     (fn [mode reindex-table] (map first (write-targets mode reindex-table)))]
    (testing "a committing background rebuild writes ONLY to the captured reindex table"
      ;; the destination is captured once at the start of the run (pending while a rebuild stages one, else the
      ;; freshly-activated active table); the active table keeps serving and is swapped in by activate-table!
      (binding [search.index/*state-store*    (index-state/mock-store {:active :active-t :pending :pending-t})
                search.ingestion/*force-sync* false]
        (is (true? (commits? (search.index/background-mode))))
        (is (= [:pending] (target-labels (search.index/background-mode) :pending-t)))))
    (testing "*force-sync* disables per-batch commits and keeps active current via dual-write"
      ;; synchronous runs happen inside the caller's transaction, so we must not open a side connection;
      ;; there is no captured reindex table, so writes dual-write to active AND pending
      (binding [search.index/*state-store*    (index-state/mock-store {:active :active-t :pending :pending-t})
                search.ingestion/*force-sync* true]
        (is (false? (commits? (search.index/background-mode))))
        (is (= [:active :pending] (target-labels (search.index/background-mode) nil)))))
    (testing "in-place and incremental modes always dual-write without committing"
      ;; dual-write keeps an in-flight background rebuild current with live edits
      (binding [search.index/*state-store*    (index-state/mock-store {:active :active-t :pending :pending-t})
                search.ingestion/*force-sync* false]
        (doseq [mode [(search.index/in-place-mode) (search.index/incremental-mode)]]
          (is (false? (commits? mode)))
          (is (= [:active :pending] (target-labels mode nil))))))))

;;; ---------------------------------- Batch upsert error recovery ----------------------------------

(defn- missing-table-ex
  "An exception shaped like the one a driver throws when upserting into a dropped table."
  []
  (ex-info "boom" {} (PSQLException. "relation does not exist" PSQLState/UNDEFINED_TABLE)))

(deftest classify-upsert-error-test
  (let [classify #'search.writer/classify-upsert-error]
    (testing "interruption is recognised so the thread can be re-interrupted"
      (is (= :interrupted (classify (InterruptedException.) (search.table/gen-table-name)))))
    (testing "an error with no missing-table cause is :unknown-error (short-circuits before touching the DB)"
      (is (= :unknown-error (classify (ex-info "plain" {}) (search.table/gen-table-name)))))
    (testing "a missing-table error against a table that really is gone is :stale-table"
      ;; gen-table-name is never created, so exists? is false
      (is (= :stale-table (classify (missing-table-ex) (search.table/gen-table-name)))))))

(deftest safe-batch-upsert-recovers-from-stale-table-test
  (testing "a stale tracked table triggers one state refresh and the batch is retried against the new table"
    (let [missing (search.table/gen-table-name)
          good    (search.table/gen-table-name)
          writes  (atom [])
          ;; First read of state points at the (missing) table; force-refresh! then reveals the new one.
          states  (atom [{:active missing :pending nil} {:active good :pending nil}])
          sync-fn (fn [] (let [[head & tail] @states]
                           (when tail (reset! states (vec tail)))
                           head))]
      (with-redefs [specialization/batch-upsert!
                    (fn [table entries]
                      (if (= (keyword table) missing)
                        (throw (missing-table-ex))
                        (swap! writes conj [(keyword table) (count entries)])))]
        (binding [search.index/*state-store* (index-state/db-backed-store sync-fn)]
          (is (= good (#'search.writer/safe-batch-upsert! :active search.index/active-table [{:x 1}])))
          (is (= [[good 1]] @writes) "the batch landed in the refreshed table exactly once"))))))

(deftest safe-batch-upsert-skips-unknown-errors-test
  (testing "a non-stale upsert error is logged and skipped (returns nil) so the rest of the reindex continues"
    (let [t (search.table/gen-table-name)]
      (with-redefs [specialization/batch-upsert! (fn [_ _] (throw (ex-info "kaboom" {})))]
        (binding [search.index/*state-store* (index-state/mock-store {:active t})]
          (is (nil? (#'search.writer/safe-batch-upsert! :active search.index/active-table [{:x 1}]))))))))
