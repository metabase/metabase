(ns metabase.search.appdb.scoring-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.db :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.scoring :as scoring]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)))

(set! *warn-on-reflection* true)

;; We act on a random localized table, making this thread-safe.
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-index-contents
  "Populate the index with the given appdb agnostic entity shapes."
  [entities & body]
  `(search.tu/with-temp-index-table
     (#'specialization/batch-upsert! (search.index/active-table)
                                     (map (comp #'search.index/document->entry
                                                #'search.ingestion/->document)
                                          ~entities))
     ~@body))

(defn search-results*
  [search-string & {:as raw-ctx}]
  (memoize/memo-clear! #'scoring/view-count-percentiles)
  (mapv (juxt :model :id :name)
        (search.tu/search-results search-string (assoc raw-ctx :search-engine "appdb"))))

(defmacro with-weights [weight-map & body]
  `(mt/with-dynamic-fn-redefs [search.config/weights (constantly ~weight-map)]
     ~@body))

(defn search-results
  "Like search-results* but with a sanity check that search without weights returns a different result."
  [ranker-key search-string & {:as raw-ctx}]
  (let [result   (with-weights {ranker-key 1} (search-results* search-string raw-ctx))
        inverted (with-weights {ranker-key -1} (search-results* search-string raw-ctx))]
    ;; note that this may not be a strict reversal, due to ties.
    (is (not= inverted result)
        "sanity check: search-no-weights should be different")
    result))

(defn indifferent?
  "Check that the results and their order do not depend on the given ranker."
  [ranker-key search-string & {:as raw-ctx}]
  (= (with-weights {ranker-key 1} (search-results* search-string raw-ctx))
     (with-weights {ranker-key -1} (search-results* search-string raw-ctx))))

(deftest ^:parallel used-fields-text
  (with-index-contents []
    (testing "We have defined all the fields that we reference within our ranking expressions"
      (is (set/subset? (into #{}
                             (comp (mapcat #'search.spec/find-fields-expr)
                                   (filter (comp #{:this :search_index} first))
                                   (map (comp keyword u/->kebab-case-en name second))
                                   ;; Remove db-specific fields
                                   (remove #{:search-vector :query}))
                             (vals (scoring/scorers {:search-string ""})))
                       (set (cons :model (keys search.spec/attr-types))))))))

;; ---- index-ony rankers ----
;; These are the easiest to test, as they don't depend on other appdb state.

(deftest ^:parallel no-search-string-test
  (with-index-contents
    [{:model "card" :id 1 :name "orders"}]
    (testing "For better or worse, we can omit a search query"
      (is (= [["card" 1 "orders"]] (search-results* nil))))))

(deftest ^:parallel text-test
  (with-index-contents
    [{:model "card" :id 1 :name "orders"}
     {:model "card" :id 2 :name "unrelated"}
     {:model "card" :id 3 :name "classified" :description "available only by court order"}
     {:model "card" :id 4 :name "order"}
     {:model "card" :id 5 :name "orders, invoices, other stuff", :description "a verbose description"}
     {:model "card" :id 6 :name "ordering"}]
    (case (mdb/db-type)
      :postgres
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
               (search-results :text "order"))))
      :h2
      ;; TODO text ranking (probably in-memory
      nil)))

(deftest ^:parallel exact-test
  (with-index-contents
    [{:model "card" :id 1 :name "the any most of stop words very"}
     {:model "card" :id 2 :name "stop words"}]
    (case (mdb/db-type)
      :postgres
      (testing "Preferences according to exact name matches, including stop words"
        (is (= [["card" 1 "the any most of stop words very"]
                ["card" 2 "stop words"]]
               (search-results :exact "the any most of stop words very"))))
      :h2
      ;; TODO text ranking (probably in-memory
      nil)))

(deftest ^:parallel prefix-test
  (with-index-contents
    [{:model "card" :id 1 :name "this is a prefix of something longer"}
     {:model "card" :id 2 :name "a prefix this is not, unfortunately"}]
    (testing "We can boost exact prefix matches"
      (is (= [["card" 1 "this is a prefix of something longer"]
              ["card" 2 "a prefix this is not, unfortunately"]]
             (search-results :prefix "this is a prefix"))))))

(deftest ^:parallel model-test
  (with-index-contents
    [{:model "dataset" :id 1 :name "card ancient"}
     {:model "card"    :id 2 :name "card recent"}
     {:model "metric"  :id 3 :name "card old"}]
    (testing "There is a preferred ordering in which different models are returned"
      (is (= [["metric"  3 "card old"]
              ["card"    2 "card recent"]
              ["dataset" 1 "card ancient"]]
             (search-results :model "card"))))
    (testing "We can override this order with weights"
      (is (= [["dataset" 1 "card ancient"]
              ["metric"  3 "card old"]
              ["card"    2 "card recent"]]
             (with-weights {:model 1.0 :model/dataset 1.0}
               (search-results* "card")))))))

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
               (search-results :recency "card")))))))

(deftest ^:parallel view-count-test
  (testing "the more view count the better"
    (with-index-contents
      [{:model "card" :id 1 :name "card well known" :view_count 10}
       {:model "card" :id 2 :name "card famous"     :view_count 100}
       {:model "card" :id 3 :name "card popular"    :view_count 50}]
      (is (= [["card" 2 "card famous"]
              ["card" 3 "card popular"]
              ["card" 1 "card well known"]]
             (search-results :view-count "card")))))

  (testing "don't error on fresh instances with no view count"
    (with-index-contents
      [{:model "card"      :id 1 :name "view card"      :view_count 0}
       {:model "dashboard" :id 2 :name "view dashboard" :view_count 0}
       {:model "dataset"   :id 3 :name "view dataset"   :view_count 0}]
      (is (= [["dashboard" 2 "view dashboard"]
              ["card"      1 "view card"]
              ["dataset"   3 "view dataset"]]
             (search-results* "view"))))))

(deftest view-count-edge-case-test
  (testing "view count max out at p99, outlier is not preferred"
    (when (search/supports-index?)
      (search.tu/with-temp-index-table
        (mt/with-model-cleanup [:model/Card]
          (let [search-term     "view-count-edge-case"
                card-with-view  #(merge (mt/with-temp-defaults :model/Card)
                                        {:name       search-term
                                         :view_count %})
               ;; Flake alert - we need to insert the outlier so that it is not chosen over the card it ties with.
                ;; NOTE: we have brought in the outlier *a lot* to compensate for h2 not calculating a real percentile.
                outlier-card-id (t2/insert-returning-pk! :model/Card (card-with-view 88 #_100000))
                _               (t2/insert! :model/Card (concat (repeatedly 20 #(card-with-view 0))
                                                                (for [i (range 1 81)]
                                                                  (card-with-view i))))
                _               (search.ingestion/consume!
                                 (#'search.ingestion/query->documents
                                  (#'search.ingestion/spec-index-reducible "card" [:= :this.name search-term])))
                first-result-id (-> (search-results* search-term) first second)]
            (is (some? first-result-id))
           ;; Ideally we would make the outlier slightly less attractive in another way, with a weak weight,
           ;; but we can solve this later if it actually becomes a flake
            (is (not= outlier-card-id first-result-id))))))))

(deftest ^:parallel dashboard-count-test
  (testing "cards used in dashboard have higher rank"
    (with-index-contents
      [{:model "card" :id 1 :name "card no used" :dashboardcard_count 2}
       {:model "card" :id 2 :name "card used" :dashboardcard_count 3}]
      (is (= [["card" 2 "card used"]
              ["card" 1 "card no used"]]
             (search-results :dashboard "card")))))

  (testing "it has a ceiling, more than the ceiling is considered to be equal"
    (with-index-contents
      [{:model "card" :id 1 :name "card popular" :dashboardcard_count 200}
       {:model "card" :id 2 :name "card" :dashboardcard_count 201}]
      (is (indifferent? :dashboard "card")))))

;; ---- personalized rankers ---
;; These require some related appdb content

(deftest ^:parallel bookmark-test
  (let [crowberto (mt/user->id :crowberto)
        rasta     (mt/user->id :rasta)]
    (mt/with-temp [:model/Card {c1 :id} {}
                   :model/Card {c2 :id} {}]
      (testing "bookmarked items are ranker higher"
        (with-index-contents
          [{:model "card" :id c1 :name "card normal"}
           {:model "card" :id c2 :name "card crowberto loved"}]
          (mt/with-temp [:model/CardBookmark _ {:card_id c2 :user_id crowberto}
                         :model/CardBookmark _ {:card_id c1 :user_id rasta}]
            (is (= [["card" c2 "card crowberto loved"]
                    ["card" c1 "card normal"]]
                   (search-results :bookmarked "card" {:current-user-id crowberto})))))))

    (mt/with-temp [:model/Dashboard {d1 :id} {}
                   :model/Dashboard {d2 :id} {}]
      (testing "bookmarked dashboard"
        (with-index-contents
          [{:model "dashboard" :id d1 :name "dashboard normal"}
           {:model "dashboard" :id d2 :name "dashboard crowberto loved"}]
          (mt/with-temp [:model/DashboardBookmark _ {:dashboard_id d2 :user_id crowberto}
                         :model/DashboardBookmark _ {:dashboard_id d1 :user_id rasta}]
            (is (= [["dashboard" d2 "dashboard crowberto loved"]
                    ["dashboard" d1 "dashboard normal"]]
                   (search-results :bookmarked "dashboard" {:current-user-id crowberto})))))))

    (mt/with-temp [:model/Collection {c1 :id} {}
                   :model/Collection {c2 :id} {}]
      (testing "bookmarked collection"
        (with-index-contents
          [{:model "collection" :id c1 :name "collection normal"}
           {:model "collection" :id c2 :name "collection crowberto loved"}]
          (mt/with-temp [:model/CollectionBookmark _ {:collection_id c2 :user_id crowberto}
                         :model/CollectionBookmark _ {:collection_id c1 :user_id rasta}]
            (is (= [["collection" c2 "collection crowberto loved"]
                    ["collection" c1 "collection normal"]]
                   (search-results :bookmarked "collection" {:current-user-id crowberto})))))))))

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
    (mt/with-temp [:model/Card        {c1 :id} {}
                   :model/Card        {c2 :id} {}
                   :model/Card        {c3 :id} {}
                   :model/Card        {c4 :id} {}
                   :model/RecentViews _ (recent-view c1 forever-ago)
                   :model/RecentViews _ (recent-view c2 right-now)
                   :model/RecentViews _ (recent-view c2 forever-ago)
                   :model/RecentViews _ (recent-view c4 forever-ago)
                   :model/RecentViews _ (recent-view c4 long-ago)]
      (with-index-contents
        [{:model "card"    :id c1 :name "card ancient"}
         {:model "metric"  :id c2 :name "card recent"}
         {:model "dataset" :id c3 :name "card unseen"}
         {:model "dataset" :id c4 :name "card old"}]
        (testing "We prefer results more recently viewed by the current user"
          (is (= [["metric"  c2 "card recent"]
                  ["dataset" c4 "card old"]
                  ["card"    c1 "card ancient"]
                  ["dataset" c3 "card unseen"]]
                 (search-results :user-recency "card" {:current-user-id user-id}))))))))

(deftest ^:parallel mine-test
  (let [crowberto (mt/user->id :crowberto)
        rasta     (mt/user->id :rasta)]
    (with-index-contents [{:model "card" :id 1 :name "crow's fly card" :creator_id crowberto}
                          {:model "card" :id 2 :name "this card is aerie mon" :creator_id rasta}]
      (is (= [["card" 1 "crow's fly card"]
              ["card" 2 "this card is aerie mon"]]
             (search-results :mine "card" {:current-user-id crowberto})))
      (is (= [["card" 2 "this card is aerie mon"]
              ["card" 1 "crow's fly card"]]
             (search-results :mine "card" {:current-user-id rasta}))))))
