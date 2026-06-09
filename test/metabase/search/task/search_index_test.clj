(ns metabase.search.task.search-index-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.table :as search.table]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   ;; loaded for its side effect: registers ALL search engines' defmethods (appdb + semantic + in-place) so
   ;; the search facade's supported-engine?/active-engines work — supported-engine? :default throws rather
   ;; than returning false, so every candidate engine must be registered.
   [metabase.search.init]
   [metabase.search.spec :as search.spec]
   [metabase.search.task.search-index :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; TODO this is coupled to appdb engines at the moment
(defn- index-size []
  (t2/count (search.index/active-table)))

(defn- do-with-isolated-index!
  "Run `thunk` against the real (db-backed) index tracking under a throwaway version hash. init!/reindex!
   build, track, and rotate genuine tables — which is exactly what these tests exercise — but scoped to a
   test-only version so they neither read nor clobber the production index. Cleans up afterward.

   NB: do NOT use `search.tu/with-temp-index-table` here. That binds an in-memory MockStateStore whose
   force-refresh! is a no-op, so maybe-create-pending!/activate-table! can't track the tables they build —
   the store keeps pointing at the original temp table, and a rebuild writes to a dropped relation."
  [version thunk]
  (when (search/supports-index?)
    (binding [search.spec/*testing-only-index-version-hash* version]
      (try
        ;; Clear any cached production tracking so the build starts from a clean, empty version.
        (search.engine/reset-tracking! :search.engine/appdb)
        (thunk)
        (finally
          (search.engine/reset-tracking! :search.engine/appdb)
          (t2/delete! :model/SearchIndexMetadata :version version)
          (#'search.table/delete-obsolete-tables!))))))

(deftest ^:synchronized index!-test
  ;; A temp card guarantees there is at least one searchable document to index, independent of whatever the
  ;; test app DB happens to contain.
  (mt/with-temp [:model/Card _ {:name (mt/random-name)}]
    (do-with-isolated-index!
     "task-init-test"
     (fn []
       (testing "It can recreate the index from scratch"
         (is (task/init!))
         (is (pos? (index-size))))
       (testing "It will reuse an existing index"
         (is (not (task/init!))))))))

(deftest ^:synchronized reindex!-test
  (mt/with-temp [:model/Card _ {:name (mt/random-name)}]
    (do-with-isolated-index!
     "task-reindex-test"
     (fn []
       (testing "It can recreate the index from scratch"
         (is (search/reindex! {:async? false}))
         (let [initial-size (index-size)
               table-name   (search.index/active-table)]
           (is (pos? initial-size))
           (t2/delete! table-name (t2/select-one-pk table-name))
           (is (= (dec initial-size) (index-size)))
           (testing "It can cycle the index gracefully"
             (is (search/reindex! {:async? false}))
             (is (= initial-size (index-size))))))))))
