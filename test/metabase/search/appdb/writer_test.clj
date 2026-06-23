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
  (let [write-targets #'search.writer/write-targets
        commits?      #'search.index/commits-per-batch?
        ;; Mirror how index-docs! captures the destination table ONCE at the start of a committing reindex.
        captured      (fn [mode] (when (commits? mode) (or (search.index/pending-table) (search.index/active-table))))
        target-labels (fn [mode] (map first (write-targets mode (captured mode))))]
    (testing "a committing background reindex pins ALL writes to the single table captured at the start"
      ;; the active table keeps serving queries and is swapped in by activate-table! when the build finishes;
      ;; pinning prevents a concurrent resync from redirecting writes mid-rebuild
      (binding [search.index/*state-store*    (index-state/mock-store {:active :active-t :pending :pending-t})
                search.ingestion/*force-sync* false]
        (is (= [:pending] (target-labels (search.index/background-mode))))
        (is (true? (commits? (search.index/background-mode))))))
    (testing "an initial background build with no pending pins to the captured active table"
      ;; the captured destination is the active table (no pending yet); writes are still pinned to it
      (binding [search.index/*state-store*    (index-state/mock-store {:active :active-t :pending nil})
                search.ingestion/*force-sync* false]
        (is (= [:pending] (target-labels (search.index/background-mode))))
        (is (true? (commits? (search.index/background-mode))))))
    (testing "*force-sync* disables per-batch commits and keeps active current via dual-write"
      ;; synchronous runs happen inside the caller's transaction, so we must not open a side connection
      (binding [search.index/*state-store*    (index-state/mock-store {:active :active-t :pending :pending-t})
                search.ingestion/*force-sync* true]
        (is (false? (commits? (search.index/background-mode))))
        (is (= [:active :pending] (target-labels (search.index/background-mode))))))
    (testing "in-place and incremental modes always dual-write without committing"
      ;; dual-write keeps an in-flight background rebuild current with live edits
      (binding [search.index/*state-store*    (index-state/mock-store {:active :active-t :pending :pending-t})
                search.ingestion/*force-sync* false]
        (doseq [mode [(search.index/in-place-mode) (search.index/incremental-mode)]]
          (is (false? (commits? mode)))
          (is (= [:active :pending] (target-labels mode))))))))

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
