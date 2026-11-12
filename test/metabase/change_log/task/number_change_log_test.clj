(ns metabase.change-log.task.number-change-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.change-log.task.number-change-log :as task.number-change-log]
   [metabase.config.core :as config]
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
   (t2/insert-returning-pk! :change_log {:table_name "test_table", :row_id 1, :action "update", :position position})))

(defn- position [id]
  (t2/select-one-fn :position :change_log :id id))

(defn- number-entries! []
  (#'task.number-change-log/number-entries!))

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
            visible     #(t2/select-fn-set :id :change_log :id [:in [slow rolled-back fast]])]
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
        (t2/delete! :change_log :table_name "test_table")))))

(deftest number-change-log-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [a (entry!)]
      (testing "while the change log is off, the task numbers nothing"
        (mt/with-premium-features #{}
          (#'task.number-change-log/number-change-log! 1 0))
        (is (nil? (position a))))
      (when config/ee-available?
        (testing "while the change log is on, the task numbers the entries"
          (mt/with-premium-features #{:change-log}
            (#'task.number-change-log/number-change-log! 1 0))
          (is (some? (position a))))))))
