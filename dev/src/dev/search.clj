(ns dev.search
  (:require
   [metabase.api.common :as api]
   [metabase.search :as search]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.postgres.index-test :refer [legacy-results]]
   [toucan2.core :as t2]))

(defn- basic-view [xs]
  (mapv (juxt :model :id :name) xs))

(comment
  (#'search.index/drop-table! @#'search.index/active-table)
  (search.index/reset-index!)
  (search.index/maybe-create-pending!)
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
  (basic-view (#'search.postgres/hybrid "satis:*"))

  ;; nope, neither get it as the lexeme is not similar enough
  (basic-view (#'search.postgres/hybrid "satisfactory"))
  (basic-view (legacy-results "satisfactory"))

  (defn- mini-bench [n engine search-term & args]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (let [f (case engine
              :index-only             search.index/search
              :legacy                 legacy-results
              :hybrid                 @#'search.postgres/hybrid
              :hybrid-multi           @#'search.postgres/hybrid-multi
              :minimal                @#'search.postgres/minimal
              :minimal-wth-perms      @#'search.postgres/minimal-with-perms)]
      (time
       (dotimes [_ n]
         (doall (apply f search-term args))))))

  (mini-bench 500 :legacy nil)
  (mini-bench 500 :legacy "sample")
  ;; 30x speed-up for test-data on my machine
  (mini-bench 500 :index-only "sample")
  ;; No noticeaable degradation, without permissions and filters
  (mini-bench 500 :minimal "sample")

  ;; but joining to the "hydrated query" reverses the advantage
  (mini-bench 100 :legacy nil)
  (mini-bench 100 :legacy "sample")
  ;; slower than fetching everything...
  (mini-bench 100 :hybrid "sample")
  ;; using index + LIKE on the join ... still a little bit more overhead
  (mini-bench 100 :hybrid "sample" {:search-string "sample"})
  ;; oh! this monstrocity is actually 2x faster than baseline B-)
  (mini-bench 100 :hybrid-multi "sample")
  (mini-bench 100 :minimal "sample"))

(defn- test-search [search-string & [search-engine]]
  (let [user-id    (t2/select-one-pk :model/User :is_superuser true)
        user-perms #{"/"}]
    (binding [api/*current-user*                 (atom (t2/select-one :model/User user-id))
              api/*current-user-id*              user-id
              api/*is-superuser?*                true
              api/*current-user-permissions-set* (atom user-perms)]
      (search/search
       (search/search-context
        {:archived                            nil
         :created-at                          nil
         :created-by                          #{}
         :current-user-id                     user-id
         :is-superuser?                       true
         :current-user-perms                  user-perms
         :filter-items-in-personal-collection nil
         :last-edited-at                      nil
         :last-edited-by                      #{}
         :limit                               50
         :model-ancestors?                    nil
         :models                              search/all-models
         :offset                              0
         :search-engine                       (some-> search-engine name)
         :search-native-query                 nil
         :search-string                       search-string
         :table-db-id                         nil
         :verified                            nil
         :ids                                 nil})))))

(comment
  (require '[clj-async-profiler.core :as prof])
  (prof/serve-ui 8081)

  (prof/profile
   #_{:clj-kondo/ignore [:discouraged-var]}
   (time
    (count
     (dotimes [_ 1000]
       (test-search "trivia")))))

  (prof/profile
   {:event :alloc}
   #_{:clj-kondo/ignore [:discouraged-var]}
   (time
    (count
     (dotimes [_ 1000]
       (test-search "trivia" :minimal))))))
