(ns metabase.change-log.numbering-test
  (:require
   [clojure.test :refer :all]
   [metabase.change-log.numbering :as change-log.numbering]
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

(deftest stay-awake-test
  (with-redefs [change-log.numbering/awake-ms    200
                change-log.numbering/interval-ms 20]
    (let [poll      #(u/poll {:thunk %, :done? some?, :timeout-ms 10000, :interval-ms 20})
          numbered? (fn [id] (poll #(position id)))
          asleep?   (fn [] (poll #(when (nil? @@#'change-log.numbering/awake-until) true)))]
      (try
        (testing "the numbering wakes, and numbers an entry that commits while it is awake"
          (change-log.numbering/stay-awake!)
          (is (some? (numbered? (entry!)))))
        (testing "it goes to sleep when the time is up"
          (is (true? (asleep?))))
        (testing "it wakes again"
          (let [a (entry!)]
            (is (nil? (position a)))
            (change-log.numbering/stay-awake!)
            (is (some? (numbered? a)))))
        (finally
          (asleep?)
          (t2/delete! :change_log :table_name "test_table"))))))
