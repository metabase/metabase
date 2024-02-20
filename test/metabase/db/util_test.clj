(ns metabase.db.util-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest testing is]]
   [metabase.db.util :as mdb.u]
   [metabase.models.setting :refer [Setting]]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(defn- repeat-concurrently [n f]
  ;; Use a latch to ensure that the functions start as close to simultaneously as possible.
  (let [latch   (CountDownLatch. n)
        futures (atom [])]
    (dotimes [_ n]
      (swap! futures conj (future (.countDown latch)
                                  (.await latch)
                                  (f))))
    (into #{} (map deref) @futures)))

(deftest select-or-insert!-test
  ;; We test both a case where the database protects against duplicates, and where it does not.
  ;; Using Setting is perfect because it has only two required fields - (the primary) key & value (with no constraint).
  ;;
  ;; In the `:key` case using the `idempotent-insert!` rather than an `or` prevents the from application throwing an
  ;; exception when there are race conditions. For `:value` it prevents us silently inserting duplicates.
  ;;
  ;; It's important to test both, as only the latter has a phantom read issue and thus requires serializable isolation.
  (let [columns [:key :value]]
    (doseq [search-col columns]
      (testing (format "When the search column %s a uniqueness constraint in the db"
                       (if (= :key search-col) "has" "does not have"))
        (let [search-value   (str (random-uuid))
              other-col      (first (remove #{search-col} columns))]
          (try
            ;; ensure there is no database detritus to trip us up
            (t2/delete! Setting search-col search-value)

            (let [threads 5
                  latch   (CountDownLatch. threads)
                  thunk   (fn []
                            (mdb.u/select-or-insert! Setting {search-col search-value}
                                                     (fn []
                                ;; Make sure all the threads are in the mutating path
                                (.countDown latch)
                                (.await latch)
                                {other-col (str (random-uuid))})))
                  results (repeat-concurrently threads thunk)
                  n       (count results)
                  latest  (t2/select-one Setting search-col search-value)]

              (case search-col
                :key
                (do (testing "every call returns the same row"
                      (is (= #{latest} results)))

                    (testing "we never insert any duplicates"
                      (is (= 1 (t2/count Setting search-col search-value))))

                    (testing "later calls just return the existing row as well"
                      (is (= latest (thunk)))
                      (is (= 1 (t2/count Setting search-col search-value)))))

                :value
                (do
                  (testing "there may be race conditions, but we insert at least once"
                    (is (pos? n)))

                  (testing "we returned the same values that were inserted into the database"
                    (is (= results (set (t2/select Setting search-col search-value)))))

                  (testing "later calls just return an existing row as well"
                    (is (contains? results (thunk)))
                    (is (= results (set (t2/select Setting search-col search-value))))))))

            ;; Since we couldn't use with-temp, we need to clean up manually.
            (finally
              (t2/delete! Setting search-col search-value))))))))

(deftest updated-or-insert!-test
  ;; We test both a case where the database protects against duplicates, and where it does not.
  ;; Using Setting is perfect because it has only two required fields - (the primary) key & value (with no constraint).
  (let [columns [:key :value]]
    (doseq [search-col columns]
      (testing (format "When the search column %s a uniqueness constraint in the db"
                       (if (= :key search-col) "has" "does not have"))
        (doseq [already-exists? [true false]]
          (let [search-value (str (random-uuid))
                other-col    (first (remove #{search-col} columns))
                other-value  (str (random-uuid))]
            (try
              ;; ensure there is no database detritus to trip us up
              (t2/delete! Setting search-col search-value)

              (when already-exists?
                (t2/insert! Setting search-col search-value other-col other-value))

              (let [threads    5
                    latch      (CountDownLatch. threads)
                    thunk      (fn []
                                 (u/prog1 (str (random-uuid))
                                   (mdb.u/update-or-insert! Setting {search-col search-value}
                                     (fn [_]
                                       ;; Make sure all the threads are in the mutating path
                                       (.countDown latch)
                                       (.await latch)
                                       {other-col <>}))))
                    values-set (repeat-concurrently threads thunk)
                    latest     (get (t2/select-one Setting search-col search-value) other-col)]

                (testing "each update tried to set a different value"
                  (is (= threads (count values-set))))

                ;; Unfortunately updates are not serialized, but we cannot show that without using a model with more
                ;; than 2 fields.
                (testing "the row is updated to match the last update call that resolved"
                  (is (not= other-value latest))
                  (is (contains? values-set latest)))

                (when (or (= :key search-col) already-exists?)
                  (is (= 1 (count (t2/select Setting search-col search-value)))))

                (testing "After the database is created, it does not create further duplicates"
                  (let [count (t2/count Setting search-col search-value)]
                    (is (pos? count))
                    (is (empty? (set/intersection values-set (repeat-concurrently threads thunk))))
                    (is (= count (t2/count Setting search-col search-value))))))

              ;; Since we couldn't use with-temp, we need to clean up manually.
              (finally
                (t2/delete! Setting search-col search-value)))))))))
