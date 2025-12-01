(ns metabase-enterprise.semantic-search.scoring-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.scoring :as semantic.scoring]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.config :as search.config]
   [metabase.test :as mt])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- add-doc-defaults
  [doc]
  (merge {:id 123
          :searchable_text (:name doc)
          :embeddable_text (:name doc)
          :created_at #t "2025-01-01T12:00:00Z"
          :creator_id (mt/user->id :rasta)
          :archived false
          :legacy_input {:id (or (:id doc) 123)
                         :model (:model doc)
                         :name (:name doc)}
          :metadata {:title (:name doc)}}
         doc))

(defmacro with-index-contents!
  "Populate the index with the given documents."
  {:style/indent :defn}
  [documents & body]
  `(semantic.tu/with-test-db! {:mode :mock-initialized}
     (semantic.tu/upsert-index! (map add-doc-defaults ~documents))
     ~@body))

(defn search-results**
  [search-string raw-ctx]
  (memoize/memo-clear! #'semantic.scoring/view-count-percentiles)
  ;; side-step filter-read-permitted for these tests
  (mt/with-dynamic-fn-redefs [semantic.index/filter-read-permitted identity]
    (semantic.tu/query-index (merge {:search-string search-string
                                     :search-engine "semantic"
                                     :current-user-id (mt/user->id :rasta)}
                                    raw-ctx))))

(defn search-results*
  [search-string & {:as raw-ctx}]
  (mapv (juxt :model :id :name)
        (search-results** search-string raw-ctx)))

(defn search-results
  "Like search-results* but with a sanity check that search without weights returns a different result."
  [ranker-key search-string & {:as raw-ctx}]
  (let [result   (semantic.tu/with-weights {ranker-key  1} (search-results* search-string raw-ctx))
        inverted (semantic.tu/with-weights {ranker-key -1} (search-results* search-string raw-ctx))]
    ;; note that this may not be a strict reversal, due to ties.
    (is (not= inverted result)
        "sanity check: search-no-weights should be different")
    result))

;;
;; index-based scorers
;;

(deftest rrf-test
  (mt/with-premium-features #{:semantic-search}
    (with-index-contents!
      [{:model "card" :id 1 :name "orders"}
       {:model "card" :id 2 :name "unrelated"}
       {:model "card" :id 3 :name "classified" :searchable_text "available only by court order" :embeddable_text "available only by court order"}
       {:model "card" :id 4 :name "order"}
       {:model "card" :id 5 :name "orders, invoices, other stuff", :searchable_text "a verbose description" :embeddable_text "a verbose description"}
       {:model "card" :id 6 :name "ordering"}]
      (with-redefs [semantic.tu/mock-embeddings {"order"      [0.11 -0.33  0.56 -0.77]
                                                 "orders"     [0.12 -0.34  0.57 -0.78]
                                                 "ordering"   [0.13 -0.35  0.58 -0.79]
                                                 "unrelated"  [-0.1 -0.2 -0.3 -0.4]
                                                 "classified" [0.11 0.22 0.33 0.44]
                                                 "orders, invoices, other stuff" [0.17 -0.39  0.62 -0.83]
                                                 "available only by court order" [-0.11 -0.22 -0.33 -0.44]}]
        (testing "Preferences according to textual matches"
          ;; Note that, ceteris paribus, the ordering in the database is currently stable - this might change!
          ;; Due to stemming, we do not distinguish between exact matches and those that differ slightly.
          (is (= [["card" 1 "orders"]
                  ["card" 4 "order"]
                  ["card" 6 "ordering"]
                  ["card" 5 "orders, invoices, other stuff"]
                  ;; If the match is only in a secondary field, it is less preferred.
                  ["card" 3 "classified"]]
                 (search-results :rrf "order"))))))))

(deftest exact-test
  (mt/with-premium-features #{:semantic-search}
    (with-index-contents!
      [{:model "card" :id 1 :name "the any most of stop words very"}
       {:model "card" :id 2 :name "stop words"}]
      (testing "Preferences according to exact name matches, including stop words"
        (is (= [["card" 1 "the any most of stop words very"]
                ["card" 2 "stop words"]]
               (search-results :exact "the any most of stop words very")))))))

(deftest prefix-test
  (mt/with-premium-features #{:semantic-search}
    (with-index-contents!
      [{:model "card" :id 1 :name "this is a prefix of something longer"}
       {:model "card" :id 2 :name "a prefix this is not, unfortunately"}]
      (testing "We can boost exact prefix matches"
        (is (= [["card" 1 "this is a prefix of something longer"]
                ["card" 2 "a prefix this is not, unfortunately"]]
               (search-results :prefix "this is a prefix")))))))

(deftest pinned-test
  (mt/with-premium-features #{:semantic-search}
    (with-index-contents!
      [{:model "card" :id 1 :name "not pinned" :pinned false}
       {:model "card" :id 2 :name "yes pinned" :pinned true}]
      (is (= [["card" 2 "yes pinned"]
              ["card" 1 "not pinned"]]
             (search-results :pinned "pinned"))))))

(deftest mine-test
  (mt/with-premium-features #{:semantic-search}
    (with-index-contents!
      [{:model "card" :id 1 :name "crowberto" :creator_id (mt/user->id :crowberto)}
       {:model "card" :id 2 :name "rasta" :creator_id (mt/user->id :rasta)}]
      (is (= [["card" 2 "rasta"]
              ["card" 1 "crowberto"]]
             (search-results :mine "mine" {:current-user-id (mt/user->id :rasta)}))))))

(deftest model-test
  (mt/with-premium-features #{:semantic-search}
    (with-index-contents!
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
               (semantic.tu/with-weights {:model 1.0 :model/dataset 1.0}
                 (search-results* "card"))))))))

(deftest recency-test
  (mt/with-premium-features #{:semantic-search}
    (let [right-now   (Instant/now)
          long-ago    (.minus right-now 1 ChronoUnit/DAYS)
          forever-ago (.minus right-now 10 ChronoUnit/DAYS)]
      (with-index-contents!
        [{:model "card" :id 1 :name "card ancient" :last_viewed_at forever-ago}
         {:model "card" :id 2 :name "card recent" :last_viewed_at right-now}
         {:model "card" :id 3 :name "card old" :last_viewed_at long-ago}]
        (testing "More recently viewed results are preferred"
          (is (= [["card" 2 "card recent"]
                  ["card" 3 "card old"]
                  ["card" 1 "card ancient"]]
                 (search-results :recency "card"))))))))

(deftest view-count-test
  (mt/with-premium-features #{:semantic-search}
    (testing "the more view count the better"
      (with-index-contents!
        [{:model "card" :id 1 :name "card well known" :view_count 10}
         {:model "card" :id 2 :name "card famous"     :view_count 100}
         {:model "card" :id 3 :name "card popular"    :view_count 50}]
        (is (= [["card" 2 "card famous"]
                ["card" 3 "card popular"]
                ["card" 1 "card well known"]]
               (search-results :view-count "card")))))))

(deftest view-count-test-2
  (mt/with-premium-features #{:semantic-search}
    (testing "don't error on fresh instances with no view count"
      (with-index-contents!
        [{:model "card"      :id 1 :name "view card"      :view_count 0}
         {:model "dashboard" :id 2 :name "view dashboard" :view_count 0}
         {:model "dataset"   :id 3 :name "view dataset"   :view_count 0}]
        (semantic.tu/with-weights (search.config/weights {:context :default
                                                          ;; fix some test flakes where dataset 3 exists and has some
                                                          ;; sort of recent views
                                                          :weights {:user-recency 0, :rrf 0}})
          (is (=? [{:model "dashboard", :id 2, :name "view dashboard"}
                   {:model "card",      :id 1, :name "view card"}
                   {:model "dataset",   :id 3, :name "view dataset"}]
                  (search-results** "view" {}))))))))

(deftest dashboard-count-test
  (mt/with-premium-features #{:semantic-search}
    (testing "cards used in dashboard have higher rank"
      (with-index-contents!
        [{:model "card" :id 1 :name "card no used" :dashboardcard_count 2}
         {:model "card" :id 2 :name "card used" :dashboardcard_count 3}]
        (is (= [["card" 2 "card used"]
                ["card" 1 "card no used"]]
               (search-results :dashboard "card")))))))

(defn indifferent?
  "Check that the results and their order do not depend on the given ranker."
  [ranker-key search-string & {:as raw-ctx}]
  (= (semantic.tu/with-weights {ranker-key  1} (search-results* search-string raw-ctx))
     (semantic.tu/with-weights {ranker-key -1} (search-results* search-string raw-ctx))))

(deftest dashboard-count-test-2
  (mt/with-premium-features #{:semantic-search}
    (testing "it has a ceiling, more than the ceiling is considered to be equal"
      (with-index-contents!
        [{:model "card" :id 1 :name "card popular" :dashboardcard_count 200}
         {:model "card" :id 2 :name "card" :dashboardcard_count 201}]
        (is (indifferent? :dashboard "card"))))))

;;;
;;; "premium" index-based scorers
;;;

(deftest official-collection-test
  (with-index-contents!
    [{:model "collection" :id 1 :name "collection normal" :official_collection false}
     {:model "collection" :id 2 :name "collection official" :official_collection true}]
    (testing "official collections has higher rank"
      (mt/with-premium-features #{:semantic-search :official-collections}
        (is (= [["collection" 2 "collection official"]
                ["collection" 1 "collection normal"]]
               (search-results :official-collection "collection")))))
    (testing "only if feature is enabled"
      (mt/with-premium-features #{:semantic-search}
        (is (= [["collection" 1 "collection normal"]
                ["collection" 2 "collection official"]]
               (search-results* "collection")))))))

(deftest verified-test
  (with-index-contents!
    [{:model "card" :id 1 :name "card normal" :verified false}
     {:model "card" :id 2 :name "card verified" :verified true}]
    (testing "verified items have higher rank"
      (mt/with-premium-features #{:semantic-search :content-verification}
        (is (= [["card" 2 "card verified"]
                ["card" 1 "card normal"]]
               (search-results :verified "card")))))
    (testing "only if feature is enabled"
      (mt/with-premium-features #{:semantic-search}
        (is (= [["card" 1 "card normal"]
                ["card" 2 "card verified"]]
               (search-results* "card")))))))

;;
;; appdb-based scorers
;;

(deftest bookmark-test
  (mt/with-premium-features #{:semantic-search}
    (let [crowberto (mt/user->id :crowberto)
          rasta     (mt/user->id :rasta)]
      (mt/with-temp [:model/Card {c1 :id} {}
                     :model/Card {c2 :id} {}]
        (testing "bookmarked items are ranker higher"
          (with-index-contents!
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
          (with-index-contents!
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
          (with-index-contents!
            [{:model "collection" :id c1 :name "collection normal"}
             {:model "collection" :id c2 :name "collection crowberto loved"}]
            (mt/with-temp [:model/CollectionBookmark _ {:collection_id c2 :user_id crowberto}
                           :model/CollectionBookmark _ {:collection_id c1 :user_id rasta}]
              (is (= [["collection" c2 "collection crowberto loved"]
                      ["collection" c1 "collection normal"]]
                     (search-results :bookmarked "collection" {:current-user-id crowberto}))))))))))

(deftest user-recency-test
  (mt/with-premium-features #{:semantic-search}
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
        (with-index-contents!
          [{:model "card"    :id c1 :name "card ancient"}
           {:model "metric"  :id c2 :name "card recent"}
           {:model "dataset" :id c3 :name "card unseen"}
           {:model "dataset" :id c4 :name "card old"}]
          (testing "We prefer results more recently viewed by the current user"
            (is (= [["metric"  c2 "card recent"]
                    ["dataset" c4 "card old"]
                    ["card"    c1 "card ancient"]
                    ["dataset" c3 "card unseen"]]
                   (search-results :user-recency "card" {:current-user-id user-id})))))))))

(deftest transform-user-recency-test
  (testing "Transforms get a hard-coded intermediate user-recency score since view events are not tracked"
    (let [user-id (mt/user->id :crowberto)
          right-now (Instant/now)]
      (mt/with-temp [:model/Card {c1 :id} {}
                     :model/RecentViews _ {:model "card" :model_id c1 :user_id user-id :timestamp right-now}]
        (with-index-contents!
          [{:model "card" :id c1 :name "recently viewed card"}
           {:model "transform" :id 1 :name "transform no views"}
           {:model "card" :id 2 :name "never viewed card"}]
          (testing "Transform ranks between recently viewed and never viewed cards"
            (let [results (search-results :user-recency "card" {:current-user-id user-id})]
              (def results results)
              (is (= [["card" c1 "recently viewed card"]
                      ["transform" 1 "transform no views"]
                      ["card" 2 "never viewed card"]]
                     results)))))))))
