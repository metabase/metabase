(ns metabase.search.appdb.index-state-test
  (:require
   [clojure.test :refer :all]
   [metabase.global-system.mutable-component :as mc]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.engine :as search.engine]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:synchronized reset-tracking-in-a-binding-test
  (testing "resetting tracking inside a binding of the index state clears only the bound state"
    (let [handle (search.index/indexes-handle)
          root   @handle]
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
                      (mt/with-dynamic-fn-redefs [search.index/sync-tracking-atoms-if-stale! (constantly nil)
                                                  search.index/create-table!                 #(swap! created conj %)]
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
