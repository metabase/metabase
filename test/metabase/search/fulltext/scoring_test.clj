(ns metabase.search.fulltext.scoring-test
  (:require
   [clojure.test :refer :all]
   ;; For now, this is specialized to postgres, but we should be able to abstract it to all index-based engines.
   [metabase.search :as search]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [metabase.search.postgres.scoring :as search.scoring]
   [metabase.test :as mt])
  (:import (java.time Instant)
           (java.time.temporal ChronoUnit)))

(set! *warn-on-reflection* true)

;; arbitrary
(def ^:private user-id 7331)

;; We act on a random localized table, making this thread-safe.
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-index-contents
  "Populate the index with the given appdb agnostic entity shapes."
  [entities & body]
  `(when (search/supports-index?)
     (let [table-name# (search.index/random-table-name)]
       (try
         (binding [search.index/*active-table* table-name#]
           (search.index/create-table! table-name#)
           (#'search.index/batch-upsert! table-name#
            ;; yup, we have two different shapes called "entry" at the moment
            (map (comp #'search.index/entity->entry
                       #'search.ingestion/->entry)
                 ~entities))
           ~@body)
         (finally
           (#'search.index/drop-table! table-name#))))))

(defn- search [ranker-key search-string & {:as raw-ctx}]
  (let [search-ctx (search.impl/search-context
                    (merge
                     {:archived              false
                      :search-string         search-string
                      :current-user-id       user-id
                      :current-user-perms    #{"/"}
                      :is-superuser?         true
                      :is-impersonated-user? false
                      :is-sandboxed-user?    false
                      :models                search.config/all-models
                      :model-ancestors?      false}
                     raw-ctx))]
    (is (get (search.scoring/scorers search-ctx) ranker-key) "The ranker is enabled")
    (map (juxt :model :id :name) (#'search.postgres/fulltext search-string search-ctx))))

;; ---- index-ony rankers ----
;; These are the easiest to test, as they don't depend on other appdb state.

(deftest ^:parallel model-test
  (with-index-contents
   [{:model "dataset" :id 1 :name "card ancient"}
    {:model "card"    :id 2 :name "card recent"}
    {:model "metric"  :id 3 :name "card old"}]
   (is (= [["metric"  3 "card old"]
           ["card"    2 "card recent"]
           ["dataset" 1 "card ancient"]]
          (search :model "card")))))

(deftest ^:parallel recency-test
  (let [right-now   (Instant/now)
        long-ago    (.minus right-now 1 ChronoUnit/DAYS)
        forever-ago (.minus right-now 10 ChronoUnit/DAYS)]
    (with-index-contents
     [{:model "card" :id 1 :name "card ancient" :last_viewed_at forever-ago}
      {:model "card" :id 2 :name "card recent"  :last_viewed_at right-now}
      {:model "card" :id 3 :name "card old"     :last_viewed_at long-ago}]
     (is (= [["card" 2 "card recent"]
             ["card" 3 "card old"]
             ["card" 1 "card ancient"]]
            (search :recency "card"))))))

;; ---- personalized rankers ---
;; These require some related appdb content

(deftest ^:parallel user-recency-test
  (let [right-now   (Instant/now)
        long-ago    (.minus right-now 10 ChronoUnit/DAYS)
        forever-ago (.minus right-now 30 ChronoUnit/DAYS)
        recent-view (fn [model-id timestamp]
                      {:model     "card"
                       :model_id  model-id
                       :user_id   user-id
                       :timestamp timestamp})]
    (mt/with-temp [:model/User        _ {:id user-id}
                   :model/RecentViews _ (recent-view 1 forever-ago)
                   :model/RecentViews _ (recent-view 2 right-now)
                   :model/RecentViews _ (recent-view 2 forever-ago)
                   :model/RecentViews _ (recent-view 3 forever-ago)
                   :model/RecentViews _ (recent-view 3 long-ago)]
      (with-index-contents
       [{:model "dataset" :id 1 :name "card ancient"}
        {:model "metric"  :id 2 :name "card recent"}
        {:model "card"    :id 3 :name "card old"}]
       (is (= [["metric"  2 "card recent"]
               ["card"    3 "card old"]
               ["dataset" 1 "card ancient"]]
              (search :user-recency "card")))))))
