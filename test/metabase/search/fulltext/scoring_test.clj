(ns metabase.search.fulltext.scoring-test
  (:require
   [clojure.test :refer :all]
   ;; For now, this is specialized to postgres, but we should be able to abstract it to all index-based engines.
   [metabase.api.common :as api]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search :as search]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [metabase.search.postgres.scoring :as search.scoring]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import (java.time Instant)
           (java.time.temporal ChronoUnit)))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *user-ctx* nil)

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

(defmacro with-api-user [raw-ctx & body]
  `(let [raw-ctx# ~raw-ctx]
     (if-let [user-id# (:current-user-id raw-ctx#)]
       ;; for brevity in some tests, we don't require that the user really exists
       (if (t2/exists? :model/User user-id#)
         (mw.session/with-current-user user-id# ~@body)
         (binding [*user-ctx* (merge {:current-user-id       user-id#
                                      :current-user-perms    #{"/"}
                                      :is-superuser?         true
                                      :is-sandboxed-user?    false
                                      :is-impersonated-user? false}
                                     (select-keys raw-ctx# [:current-user-perms
                                                            :is-superuser?
                                                            :is-sandboxed-user?
                                                            :is-impersonated-user?]))]
           ~@body))
       (mt/with-test-user :crowberto ~@body))))

(defn- search [ranker-key search-string & {:as raw-ctx}]
  (with-api-user raw-ctx
    (let [search-ctx (search.impl/search-context
                      (merge
                       (or *user-ctx*
                           {:current-user-id       api/*current-user-id*
                            :current-user-perms    @api/*current-user-permissions-set*
                            :is-superuser?         api/*is-superuser?*
                            :is-impersonated-user? (premium-features/impersonated-user?)
                            :is-sandboxed-user?    (premium-features/impersonated-user?)})
                       {:archived         false
                        :search-string    search-string
                        :models           search.config/all-models
                        :model-ancestors? false}
                       raw-ctx))]
      (is (get (search.scoring/scorers search-ctx) ranker-key) "The ranker is enabled")
      (map (juxt :model :id :name) (#'search.postgres/fulltext search-string search-ctx)))))

;; ---- index-ony rankers ----
;; These are the easiest to test, as they don't depend on other appdb state.

(deftest ^:parallel text-test
  (with-index-contents
    [{:model "card" :id 1 :name "orders"}
     {:model "card" :id 2 :name "unrelated"}
     {:model "card" :id 3 :name "classified" :description "available only by court order"}
     {:model "card" :id 4 :name "order"}
     {:model "card" :id 5 :name "orders, invoices, other stuff", :description "a verbose description"}
     {:model "card" :id 6 :name "ordering"}]
   ;; WARNING: this is likely to diverge between appdb types as we support more.
    (testing "Preferences according to textual matches "
     ;; Note that, ceteris paribus, the ordering in the database is currently stable - this might change!
     ;; Due to stemming, we do not distinguish between exact matches and those that differ slightly.
      (is (= [["card" 1 "orders"]
              ["card" 4 "order"]
             ;; We do not currently normalize the score based on the number of words in the vector / the coverage.
              ["card" 5 "orders, invoices, other stuff"]
              ["card" 6 "ordering"]
             ;; If the match is only in a secondary field, it is less preferred.
              ["card" 3 "classified"]]
             (search :model "order"))))))

(deftest ^:parallel model-test
  (with-index-contents
    [{:model "dataset" :id 1 :name "card ancient"}
     {:model "card"    :id 2 :name "card recent"}
     {:model "metric"  :id 3 :name "card old"}]
    (testing "There is a preferred ordering in which different models are returned"
      (is (= [["metric"  3 "card old"]
              ["card"    2 "card recent"]
              ["dataset" 1 "card ancient"]]
             (search :model "card"))))
    (testing "We can override this order with weights"
      (is (= [["dataset" 1 "card ancient"]
              ["metric"  3 "card old"]
              ["card"    2 "card recent"]]
             (mt/with-dynamic-redefs [search.config/weights (constantly {:model 1.0 :model/dataset 1.0})]
               (search :model "card")))))))

(deftest ^:parallel recency-test
  (let [right-now   (Instant/now)
        long-ago    (.minus right-now 1 ChronoUnit/DAYS)
        forever-ago (.minus right-now 10 ChronoUnit/DAYS)]
    (with-index-contents
      [{:model "card" :id 1 :name "card ancient" :last_viewed_at forever-ago}
       {:model "card" :id 2 :name "card recent" :last_viewed_at right-now}
       {:model "card" :id 3 :name "card old" :last_viewed_at long-ago}]
      (testing "More recently viewed results are preferred"
        (is (= [["card" 2 "card recent"]
                ["card" 3 "card old"]
                ["card" 1 "card ancient"]]
               (search :recency "card")))))))

;; ---- personalized rankers ---
;; These require some related appdb content

(deftest ^:parallel user-recency-test
  (let [user-id     (mt/user->id :crowberto)
        right-now   (Instant/now)
        long-ago    (.minus right-now 10 ChronoUnit/DAYS)
        forever-ago (.minus right-now 30 ChronoUnit/DAYS)
        recent-view (fn [model-id timestamp]
                      {:model     "card"
                       :model_id  model-id
                       :user_id   user-id
                       :timestamp timestamp})]
    (with-index-contents
      [{:model "card"    :id 1 :name "card ancient"}
       {:model "metric"  :id 2 :name "card recent"}
       {:model "dataset" :id 3 :name "card unseen"}
       {:model "dataset" :id 4 :name "card old"}]
      (mt/with-temp [:model/RecentViews _ (recent-view 1 forever-ago)
                     :model/RecentViews _ (recent-view 2 right-now)
                     :model/RecentViews _ (recent-view 2 forever-ago)
                     :model/RecentViews _ (recent-view 4 forever-ago)
                     :model/RecentViews _ (recent-view 4 long-ago)]
        (testing "We prefer results more recently viewed by the current user"
          (is (= [["metric"  2 "card recent"]
                  ["dataset" 4 "card old"]
                  ["card"    1 "card ancient"]
                  ["dataset" 3 "card unseen"]]
                 (search :user-recency "card" {:current-user-id user-id}))))))))
