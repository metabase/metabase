(ns metabase.change-log.numbering-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.change-log.numbering :as change-log.numbering]
   [metabase.config.core :as config]
   [metabase.global-system.system :as system]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- entry!
  ([]
   (entry! nil))
  ([position]
   (t2/insert-returning-pk! :model/ChangeLog {:table_name "test_table", :row_id 1, :action "update", :position position})))

(defn- position [id]
  (t2/select-one-fn :position :model/ChangeLog :id id))

(defn- number-entries! []
  (#'change-log.numbering/number-entries!))

(deftest number-entries-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [a (entry!)
          b (entry!)]
      (testing "an entry has no position until it is numbered"
        (is (nil? (position a))))
      (number-entries!)
      (testing "each entry gets its own position, lowest id first"
        (is (< (position a) (position b))))
      (testing "with nothing to number, no position changes"
        (let [numbered (position a)]
          (number-entries!)
          (is (= numbered (position a)))))
      (testing "a later entry gets a higher position, which is at least the clock"
        (let [clock (* 1000 (System/currentTimeMillis))
              c     (entry!)]
          (number-entries!)
          (is (< (position b) (position c)))
          (is (<= clock (position c)))))
      (testing "a later entry gets a higher position than one that is ahead of the clock"
        (let [ahead (+ (* 1000 (System/currentTimeMillis)) (* 1000 1000 60 60))
              _     (entry! ahead)
              d     (entry!)]
          (number-entries!)
          (is (< ahead (position d))))))))

(deftest ids-out-of-order-test
  (let [commit-slow (promise)]
    (try
      (let [slow-id     (promise)
            slow-done   (future (t2/with-transaction [_conn]
                                  (deliver slow-id (entry!))
                                  @commit-slow))
            slow        (u/deref-with-timeout slow-id 10000)
            rolled-back (t2/with-transaction [_conn nil {:rollback-only true}]
                          (entry!))
            fast        (entry!)
            visible     #(t2/select-fn-set :id :model/ChangeLog :id [:in [slow rolled-back fast]])]
        (testing "ids are taken in the order the entries are written"
          (is (< slow rolled-back fast)))
        (testing "a higher id shows up while the transaction with a lower id is still open"
          (is (= #{fast} (visible))))
        (number-entries!)
        (deliver commit-slow true)
        (u/deref-with-timeout slow-done 10000)
        (testing "the lower id shows up later, and the id of a rolled back transaction never does"
          (is (= #{slow fast} (visible))))
        (number-entries!)
        (testing "positions follow when the entries showed up, not their ids"
          (is (< (position fast) (position slow)))))
      (finally
        (deliver commit-slow true)
        (t2/delete! :model/ChangeLog :table_name "test_table")))))

(deftest number-while-awake-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [a (entry!)]
      (testing "asleep, it numbers nothing"
        (#'change-log.numbering/number-while-awake! (atom 0))
        (is (nil? (position a))))
      (testing "awake, it numbers the entries"
        (#'change-log.numbering/number-while-awake! (atom Long/MAX_VALUE))
        (is (some? (position a))))
      (testing "it keeps numbering while its batches are full"
        (let [ids (vec (repeatedly 5 entry!))]
          (with-redefs [change-log.numbering/batch-size 2]
            (#'change-log.numbering/number-while-awake! (atom Long/MAX_VALUE)))
          (is (every? some? (map position ids))))))))

(deftest number-while-awake-interrupt-test
  (testing "it stops numbering full batches when its thread is interrupted"
    (mt/with-dynamic-fn-redefs [change-log.numbering/number-entries! (constantly @#'change-log.numbering/batch-size)]
      (let [thread (doto (Thread. ^Runnable (bound-fn []
                                              (#'change-log.numbering/number-while-awake! (atom Long/MAX_VALUE))))
                     (.setDaemon true)
                     (.start))]
        (.interrupt thread)
        (.join thread 5000)
        (is (not (.isAlive thread)))))))

(deftest worktree-entries-test
  (when config/ee-available?
    (testing "the entries of every remote sync worktree get a position"
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (mt/with-temp [:model/RemoteSyncWorktree {worktree-id :id} {:branch "test-branch"}]
          (let [main  (entry!)
                other (mdb/with-worktree-scope {:type :worktree :worktree-id worktree-id}
                        (entry!))]
            (number-entries!)
            (is (some? (position main)))
            (is (some? (mdb/with-worktree-scope {:type :all}
                         (position other))))))))))

(deftest stay-awake-test
  (with-redefs [change-log.numbering/interval-ms 20]
    (try
      (testing "the numbering starts, and numbers an entry that commits while it is awake"
        (change-log.numbering/stay-awake!)
        (let [a (entry!)]
          (is (some? (u/poll {:thunk #(position a), :done? some?, :timeout-ms 10000, :interval-ms 20})))))
      (testing "if the numbering cannot start, it does not throw"
        (system/stop! @#'change-log.numbering/numbering-component)
        (mt/with-dynamic-fn-redefs [change-log.numbering/start-numbering #(throw (ex-info "cannot start" {}))]
          (is (nil? (change-log.numbering/stay-awake!)))))
      (finally
        (system/stop! @#'change-log.numbering/numbering-component)
        (t2/delete! :model/ChangeLog :table_name "test_table")))))
