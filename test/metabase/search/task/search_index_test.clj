(ns metabase.search.task.search-index-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   ;; loaded for its side effect: registers ALL search engines' defmethods (appdb + semantic + in-place) so
   ;; the search facade's supported-engine?/active-engines work — supported-engine? :default throws rather
   ;; than returning false, so every candidate engine must be registered.
   [metabase.search.init]
   [metabase.search.task.search-index :as task]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; TODO this is coupled to appdb engines at the moment
(defn- index-size []
  (t2/count (search.index/active-table)))

;; These tests have init!/reindex! build, track, and rotate GENUINE tables — so they need a real (db-backed)
;; store, not with-temp-index-table's MockStateStore (whose force-refresh! is a no-op, so the rotations can't be
;; tracked). with-temp-real-index gives exactly that: a fresh, isolated db-backed store under a throwaway version,
;; so the rotations neither read nor clobber the shared production index tracking (which would leak a dropped
;; table into other parallel tests). See its docstring.

(deftest ^:synchronized index!-test
  ;; A temp card guarantees there is at least one searchable document to index, independent of whatever the
  ;; test app DB happens to contain.
  (mt/with-temp [:model/Card _ {:name (mt/random-name)}]
    (search.tu/with-temp-real-index "task-init-test"
      (testing "It can recreate the index from scratch"
        (is (task/init!))
        (is (pos? (index-size))))
      (testing "It will reuse an existing index"
        (is (not (task/init!)))))))

(deftest ^:synchronized reindex!-test
  (mt/with-temp [:model/Card _ {:name (mt/random-name)}]
    (search.tu/with-temp-real-index "task-reindex-test"
      (testing "It can recreate the index from scratch"
        (is (search/reindex! {:async? false}))
        (let [initial-size (index-size)
              table-name   (search.index/active-table)]
          (is (pos? initial-size))
          (t2/delete! table-name (t2/select-one-pk table-name))
          (is (= (dec initial-size) (index-size)))
          (testing "It can cycle the index gracefully"
            (is (search/reindex! {:async? false}))
            (is (= initial-size (index-size)))))))))
