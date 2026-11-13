(ns metabase.search.appdb.index-state-test
  (:require
   [clojure.test :refer :all]
   [metabase.global-system.mutable-component :as mc]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.engine :as search.engine]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u])
  (:import
   (java.util.concurrent.atomic AtomicBoolean)))

(set! *warn-on-reflection* true)

;; a read of the index state syncs it from the app DB
(use-fixtures :once (fixtures/initialize :db))

(deftest ^:synchronized reset-tracking-in-a-binding-test
  (testing "resetting tracking inside a binding of the index state clears only the bound state, sync time included"
    ;; a read gives the root a time for its next sync, which the reset in the binding must leave alone
    (search.index/active-table)
    (let [handle (search.index/indexes-handle)
          root   @handle]
      (is (some? (:next-sync-at root)))
      (is (= {:inside nil, :root-after root}
             {:inside     (mc/binding handle {:active ::bound-active, :pending nil}
                                      (fn []
                                        (search.engine/reset-tracking! :search.engine/appdb)
                                        @handle))
              :root-after @handle})))))

(deftest ^:synchronized index-writers-hold-the-slot-lock-test
  (testing "creating a pending index waits for the index state's slot lock, which a writer holds across its reads"
    (let [handle  (search.index/indexes-handle)
          created (atom [])
          release (promise)
          held    (promise)]
      (mc/binding handle {:active nil, :pending nil}
                  (fn []
                    (with-bindings {#'search.index/*mocking-tables* true}
                      (mt/with-dynamic-fn-redefs [search.index/create-table! #(swap! created conj %)]
                        (let [holder  (future (mc/with-slot-lock handle
                                                (deliver held true)
                                                @release))
                              _       @held
                              creator (future (search.index/maybe-create-pending!))]
                          ;; gives the creator time to get as far as it can before reading what it did
                          (let [finished? (not= ::waiting (deref creator 300 ::waiting))]
                            (is (= {:created-while-held [], :finished? false}
                                   {:created-while-held @created, :finished? finished?})))
                          (deliver release true)
                          @holder
                          (is (= {:pending @creator, :created [@creator]}
                                 {:pending (:pending @handle), :created @created}))))))))))

(deftest ^:synchronized a-fresh-read-does-not-wait-for-the-slot-lock-test
  (testing "reading tables whose sync is not due takes no lock, so it does not wait behind a writer"
    (let [handle  (search.index/indexes-handle)
          release (promise)
          held    (promise)]
      (mc/binding handle {:active ::active, :pending nil, :next-sync-at Long/MAX_VALUE}
                  (fn []
                    (let [holder (future (mc/with-slot-lock handle
                                           (deliver held true)
                                           @release))]
                      @held
                      (try
                        (is (= ::active (deref (future (search.index/active-table)) 1000 ::waited)))
                        (finally
                          (deliver release true)
                          @holder))))))))

(deftest ^:synchronized one-stale-read-waits-for-the-slot-lock-test
  (testing "when a sync is due while a writer holds the slot lock, one reader waits to sync and the others read on"
    (let [handle   (search.index/indexes-handle)
          claiming ^AtomicBoolean @#'search.index/claiming-sync?
          syncs    (atom 0)
          release  (promise)
          held     (promise)]
      (mc/binding handle {:active ::active, :pending nil, :next-sync-at nil}
                  (fn []
                    (mt/with-dynamic-fn-redefs [search.index/sync-tracking-atoms! #(swap! syncs inc)]
                      (let [holder (future (mc/with-slot-lock handle
                                             (deliver held true)
                                             @release))
                            _      @held
                            waiter (future (search.index/active-table))]
                        (try
                          ;; the second reader starts only once the first has claimed the sync, so it cannot claim it
                          (let [claimed?    (boolean (u/poll {:thunk       #(.get claiming)
                                                              :done?       true?
                                                              :timeout-ms  5000
                                                              :interval-ms 10}))
                                second-read (deref (future (search.index/active-table)) 1000 ::waited)]
                            (is (= {:first-claimed? true
                                    :first-done?    false
                                    :second         ::active
                                    :syncs          0}
                                   {:first-claimed? claimed?
                                    :first-done?    (realized? waiter)
                                    :second         second-read
                                    :syncs          @syncs})))
                          (finally
                            (deliver release true)
                            @holder))
                        (is (= {:first ::active, :syncs 1}
                               {:first (deref waiter 5000 ::waited), :syncs @syncs})))))))))
