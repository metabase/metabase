(ns dev.search
  (:require
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index :as search.index]
   [toucan2.core :as t2]))

(def ^:private non-indexed-models
  (disj search.config/all-models "indexed-entity"))

(defn- legacy-query
  "Use the source tables directly to search for records."
  [search-term & {:keys [models]}]
  (map (juxt :id :model)
       (t2/query
        (search.impl/full-search-query
         {:archived?          nil
          ;; this does not matter since we're a superuser
          :current-user-id    1
          :is-superuser?      true
          :current-user-perms #{"/"}
          :model-ancestors?   false
          :models             (or models non-indexed-models)
          :search-string      search-term}))))

(defn legacy-results
  "Let's compare to the in-place search"
  [search-term & {:keys [models]}]
  (t2/query
   (search.impl/full-search-query
    {:archived? nil

     ;; TODO pass the actual user
     :current-user-id    1
     :is-superuser?      true
     :current-user-perms #{"/"}

     :model-ancestors? false
     ;; this model needs dynamic vars
     :models           (or models non-indexed-models)

     :search-string search-term})))

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

  (search.index/search "user")

  (defn- basic-view [xs]
    (mapv (juxt :model :id :name) xs))

  ;; either
  (basic-view (search.postgres/hybrid "satisfaction"))
  (basic-view (search.postgres/hybrid "or"))
  (basic-view (search.postgres/hybrid "user"))
  (basic-view (search.postgres/hybrid "satisfaction or user"))
  (basic-view (legacy-results "satisfaction"))
  (basic-view (legacy-results "or"))
  (basic-view (legacy-results "user"))
  (basic-view (legacy-results "satisfaction or user"))
  ;; negation
  (basic-view (search.postgres/hybrid "user -people"))

  ;; sequential
  (basic-view (search.postgres/hybrid "orders"))
  (basic-view (search.postgres/hybrid "category"))
  (basic-view (search.postgres/hybrid "by"))
  (basic-view (search.postgres/hybrid "\"orders by category\""))
  (basic-view (legacy-results "\"orders by category\""))

  ;; doesn't work, need to drop to lower level postgres functions
  (basic-view (search.postgres/hybrid "satis:*"))

  ;; nope, neither get it as the lexeme is not similar enough
  (basic-view (search.postgres/hybrid "satisfactory"))
  (basic-view (legacy-results "satisfactory"))

  ;; strips tstop words!
  (search.postgres/hybrid "its the satisfaction")
  ;; gets loads of junk
  (legacy-query "its the satisfaction")

  ;; unrelated superstring - revenue
  (basic-view (search.postgres/hybrid "venue"))
  (basic-view (legacy-results "venue"))

  (basic-view (search.postgres/hybrid "example"))
  (basic-view (search.postgres/hybrid-multi "example"))

  ;; consistency checks
  (doseq [term ["e-commerce" "example" "rasta" "new" "collection" "revenue" #_"venue"]]
    (assert (= (set (search.index/search term))
               (set (legacy-query term)))
            term))

  (doseq [term ["e-commerce" "example" "rasta" "new" "collection" "revenue" #_"venue"]]
    (assert (= (set (search.postgres/hybrid term))
               (set (search.postgres/hybrid-multi term)))
            term))

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
