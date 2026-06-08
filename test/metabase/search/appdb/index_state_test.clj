(ns metabase.search.appdb.index-state-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.appdb.index-state :as index-state])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(defn- tracking-sync-fn
  "Returns {:fn f :call-count atom} where f is a sync-fn that records invocations."
  [result]
  (let [call-count (atom 0)]
    {:fn         (fn [] (swap! call-count inc) result)
     :call-count call-count}))

;;; DbBackedStateStore

(deftest db-backed-initial-sync-test
  (let [{:keys [fn call-count]} (tracking-sync-fn {:active :table-a :pending nil})
        store (index-state/db-backed-store fn)]
    (testing "syncs from DB on first current-state call"
      (let [s (index-state/current-state store)]
        (is (= {:active :table-a :pending nil} s))
        (is (= 1 @call-count))))))

(deftest db-backed-ttl-caching-test
  (let [{:keys [fn call-count]} (tracking-sync-fn {:active :table-a :pending nil})
        store (index-state/db-backed-store fn)]
    (index-state/current-state store)
    (testing "does not call sync-fn again within the TTL window"
      (index-state/current-state store)
      (index-state/current-state store)
      (is (= 1 @call-count)))))

(deftest db-backed-force-refresh-test
  (let [{:keys [fn call-count]} (tracking-sync-fn {:active :table-a :pending nil})
        store (index-state/db-backed-store fn)]
    (index-state/current-state store)
    (testing "force-refresh! always calls sync-fn regardless of TTL"
      (index-state/force-refresh! store)
      (index-state/force-refresh! store)
      (is (= 3 @call-count)))))

(deftest db-backed-set-state-test
  (let [{:keys [fn call-count]} (tracking-sync-fn {:active :db-table :pending nil})
        store (index-state/db-backed-store fn)]
    (index-state/set-state! store {:active :new-table :pending :building})
    (testing "set-state! updates the cached state immediately without calling sync-fn"
      (is (= 0 @call-count)))
    (testing "current-state returns the value from set-state! within the TTL"
      (let [s (index-state/current-state store)]
        (is (= :new-table (:active s)))
        (is (= :building (:pending s)))
        (is (= 0 @call-count) "TTL was reset by set-state!, so sync-fn still not called")))))

(deftest db-backed-set-state-partial-test
  (let [{:keys [fn]} (tracking-sync-fn {:active :db-table :pending nil})
        store (index-state/db-backed-store fn)]
    (index-state/set-state! store {:active :first-table :pending :pend})
    (testing "set-state! with only :active clears :pending"
      (index-state/set-state! store {:active :second-table :pending nil})
      (is (= {:active :second-table :pending nil} (index-state/current-state store))))))

(deftest db-backed-concurrent-ttl-test
  (let [sync-count (atom 0)
        ;; Gate so all threads enter sync-fn together before any completes
        enter-latch (CountDownLatch. 1)
        sync-fn     (fn []
                      (swap! sync-count inc)
                      (.await ^CountDownLatch enter-latch 1 TimeUnit/SECONDS)
                      {:active :table :pending nil})
        store       (index-state/db-backed-store sync-fn)
        n           10
        threads     (repeatedly n #(Thread. ^Runnable (fn [] (index-state/current-state store))))]
    (run! #(.start ^Thread %) threads)
    (Thread/sleep 50)
    (.countDown ^CountDownLatch enter-latch)
    (run! #(.join ^Thread % 2000) threads)
    (is (= 1 @sync-count) "sync-fn called exactly once under concurrent TTL expiry")))

;;; MockStateStore

(deftest mock-store-initial-state-test
  (let [store (index-state/mock-store {:active :my-table})]
    (is (= {:active :my-table :pending nil} (index-state/current-state store)))))

(deftest mock-store-set-state-test
  (let [store (index-state/mock-store {:active :my-table})]
    (index-state/set-state! store {:active :my-table :pending :building})
    (is (= {:active :my-table :pending :building} (index-state/current-state store)))))

(deftest mock-store-force-refresh-is-noop-test
  (let [store (index-state/mock-store {:active :my-table})]
    (index-state/set-state! store {:active :updated})
    (is (= {:active :updated :pending nil} (index-state/force-refresh! store))
        "force-refresh! on mock returns current in-memory state unchanged")))

(deftest mock-store-empty-test
  (let [store (index-state/mock-store)]
    (is (= {:active nil :pending nil} (index-state/current-state store)))))

;;; db-backed?

(deftest db-backed-store-is-db-backed-test
  (let [{:keys [fn]} (tracking-sync-fn {:active :t :pending nil})
        store (index-state/db-backed-store fn)]
    (is (true? (index-state/db-backed? store)))))

(deftest mock-store-is-not-db-backed-test
  (let [store (index-state/mock-store {:active :t})]
    (is (false? (index-state/db-backed? store)))))
