(ns dev.search
  (:require
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.core-test :refer [legacy-results]]
   [metabase.search.postgres.index :as search.index]
   [toucan2.core :as t2]))

(defn- basic-view [xs]
  (mapv (juxt :model :id :name) xs))

(comment
  (#'search.index/drop-table! @#'search.index/active-table)
  (search.index/reset-index!)
  (search.index/create-pending!)
  (search.index/activate-pending!)

  {:initialized? @@#'search.index/initialized? :reindexing? @@#'search.index/reindexing?}
  (zipmap [:active :next :retired] (map #'search.index/exists?
                                        [@#'search.index/active-table
                                         @#'search.index/pending-table
                                         @#'search.index/retired-table]))

  (search.postgres/init! true)
  (search.postgres/init! false)
  (t2/count :search_index)

  ;; doesn't work, need to drop to lower level postgres functions
  (basic-view (search.postgres/hybrid "satis:*"))

  ;; nope, neither get it as the lexeme is not similar enough
  (basic-view (search.postgres/hybrid "satisfactory"))
  (basic-view (legacy-results "satisfactory"))

  (defn- mini-bench [n engine search-term & args]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (time
     (dotimes [_ n]
       (apply
        (case engine
          :index-only search.index/search
          :legacy-index-only legacy-query
          :legacy legacy-results
          :hybrid search.postgres/hybrid
          :hybrid-multi search.postgres/hybrid-multi)
        search-term
        args))))

  (mini-bench 500 :legacy-index-only nil)
  (mini-bench 500 :legacy-index-only "sample")
  ;; 30x speed-up for test-data on my machine
  (mini-bench 500 :index-only "sample")

  ;; but joining to the "hydrated query" reverses the advantage
  (mini-bench 100 :legacy nil)
  (mini-bench 100 :legacy "sample")
  ;; slower than fetching everything...
  (mini-bench 100 :hybrid "sample")
  ;; doing both filters... still a little bit more overhead with the join
  (mini-bench 100 :hybrid "sample" :double-filter? true)
  ;; oh! this monstrocity is actually 2x faaster than baseline B-)
  (mini-bench 100 :hybrid-multi "sample"))
