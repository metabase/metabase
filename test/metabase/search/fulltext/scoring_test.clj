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

(defn- search* [ranker-key search-string & {:as raw-ctx}]
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

(defn- search-no-weights
  "Like search but with all weights set to 0."
  [ranker-key & args]
  (mt/with-dynamic-redefs [search.config/weights #(assoc (:default @#'search.config/static-weights) ranker-key 0)]
    (apply search* ranker-key args)))

(defn- search [& args]
  (let [result (apply search* args)]
    (is (not= (apply search-no-weights args)
              result)
        "sanity check: search-no-weights should be different")
    result))

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
    (testing "Preferences according to textual matches"
      ;; Note that, ceteris paribus, the ordering in the database is currently stable - this might change!
      ;; Due to stemming, we do not distinguish between exact matches and those that differ slightly.
      (is (= [["card" 1 "orders"]
              ["card" 4 "order"]
              ;; We do not currently normalize the score based on the number of words in the vector / the coverage.
              ["card" 5 "orders, invoices, other stuff"]
              ["card" 6 "ordering"]
              ;; If the match is only in a secondary field, it is less preferred.
              ["card" 3 "classified"]]
             (search :text "order"))))))

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

(deftest ^:parallel view-count-test
  (testing "the more view count the better"
    (with-index-contents
      [{:model "card" :id 1 :name "card well known" :view_count 10}
       {:model "card" :id 2 :name "card famous"     :view_count 100}
       {:model "card" :id 3 :name "card popular"    :view_count 50}]
      (is (= [["card" 2 "card famous"]
              ["card" 3 "card popular"]
              ["card" 1 "card well known"]]
             (search :view-count "card")))))

  (testing "don't error on fresh instances with no view count"
    (with-index-contents
      [{:model "card"      :id 1 :name "view card"      :view_count 0}
       {:model "dashboard" :id 2 :name "view dashboard" :view_count 0}
       {:model "dataset"   :id 3 :name "view dataset"   :view_count 0}]
      (is (= [["dashboard" 2 "view dashboard"]
              ["card"      1 "view card"]
              ["dataset"   3 "view dataset"]]
             (search* :view-count "view"))))))

(deftest view-count-edge-case-test
  (testing "view count max out at p99, outlier is not preferred"
    (when (search/supports-index?)
      (let [table-name (search.index/random-table-name)]
        (binding [search.index/*active-table* table-name]
          (search.index/create-table! table-name)
          (mt/with-model-cleanup [:model/Card]
            (let [search-term    "view-count-edge-case"
                  card-with-view #(merge (mt/with-temp-defaults :model/Card)
                                         {:name search-term
                                          :view_count %})
                  _               (t2/insert! :model/Card (concat (repeat 20 (card-with-view 0))
                                                                  (for [i (range 1 80)]
                                                                    (card-with-view i))))
                  outlier-card-id (t2/insert-returning-pk! :model/Card (card-with-view 100000))
                  _               (#'search.ingestion/batch-update!
                                   (#'search.ingestion/spec-index-reducible "card" [:= :this.name search-term]))
                  first-result-id (-> (search* :view-count search-term) first)]
              (is (some? first-result-id))
              ;; Ideally we would make the outlier slightly less attractive in another way, with a weak weight,
              ;; but we can solve this later if it actually becomes a flake
              (is (not= outlier-card-id first-result-id)))))))))

(deftest ^:parallel dashboard-count-test
  (testing "cards used in dashboard have higher rank"
    (with-index-contents
      [{:model "card" :id 1 :name "card no used" :dashboardcard_count 2}
       {:model "card" :id 2 :name "card used" :dashboardcard_count 3}]
      (is (= [["card" 2 "card used"]
              ["card" 1 "card no used"]]
             (search :dashboard "card")))))

  (testing "it has a ceiling, more than the ceiling is considered to be equal"
    (with-index-contents
      [{:model "card" :id 1 :name "card popular" :dashboardcard_count 22}
       {:model "card" :id 2 :name "card" :dashboardcard_count 11}]
      (is (= [["card" 1 "card popular"]
              ["card" 2 "card"]]
             (search* :dashboard "card"))))))

;; ---- personalized rankers ---
;; These require some related appdb content

(deftest ^:parallel bookmark-test
  (let [crowberto (mt/user->id :crowberto)
        rasta     (mt/user->id :rasta)]
    (testing "bookmarked items are ranker higher"
      (with-index-contents
        [{:model "card" :id 1 :name "card normal"}
         {:model "card" :id 2 :name "card crowberto loved"}]
        (mt/with-temp [:model/CardBookmark _ {:card_id 2 :user_id crowberto}
                       :model/CardBookmark _ {:card_id 1 :user_id rasta}]
          (is (= [["card" 2 "card crowberto loved"]
                  ["card" 1 "card normal"]]
                 (search :bookmarked "card" {:current-user-id crowberto}))))))

    (testing "bookmarked dashboard"
      (with-index-contents
        [{:model "dashboard" :id 1 :name "dashboard normal"}
         {:model "dashboard" :id 2 :name "dashboard crowberto loved"}]
        (mt/with-temp [:model/DashboardBookmark _ {:dashboard_id 2 :user_id crowberto}
                       :model/DashboardBookmark _ {:dashboard_id 1 :user_id rasta}]
          (is (= [["dashboard" 2 "dashboard crowberto loved"]
                  ["dashboard" 1 "dashboard normal"]]
                 (search :bookmarked "dashboard" {:current-user-id crowberto}))))))

    (testing "bookmarked collection"
      (with-index-contents
        [{:model "collection" :id 1 :name "collection normal"}
         {:model "collection" :id 2 :name "collection crowberto loved"}]
        (mt/with-temp [:model/CollectionBookmark _ {:collection_id 2 :user_id crowberto}
                       :model/CollectionBookmark _ {:collection_id 1 :user_id rasta}]
          (is (= [["collection" 2 "collection crowberto loved"]
                  ["collection" 1 "collection normal"]]
                 (search :bookmarked "collection" {:current-user-id crowberto}))))))))

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
