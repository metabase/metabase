(ns metabase-enterprise.search.scoring-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.search.scoring-test]}}}}}}
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.search.scoring :as ee-scoring]
   [metabase.lib.core :as lib]
   [metabase.search.appdb.scoring-test :as appdb.scoring-test]
   [metabase.search.in-place.scoring :as scoring]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json])
  (:import [java.time Instant]))

;; Initialize before any tests run. The app DB index tests below write search-index bookkeeping before anything
;; else accesses the app DB; a later lazy initialization, triggered by `mt/user->id` in `search-results`, would
;; recreate the H2 test DB while a test is running.
(use-fixtures :once (fixtures/initialize :db :test-users))

(set! *warn-on-reflection* true)

(deftest ^:parallel official-score-test
  (let [score #'ee-scoring/official-score
        item  (fn [id synced?] {:collection_is_remote_synced synced?
                                :id                          id
                                :model                       "card"})
        score (fn [items] (into [] (map :id) (reverse (sort-by score items))))]
    (testing "remote-synced collection bumps result"
      (is (= [3 2 1] (score [(item 1 false) (item 2 nil) (item 3 nil)])))
      (is (= [1 3 2] (score [(item 1 true) (item 2 nil) (item 3 nil)]))))))

(defn- ee-score
  [search-string item]
  (-> (scoring/score-and-result item {:search-string search-string}) :score))

(deftest official-bumps-value-test
  (testing "it should bump up the value of items in remote-synced collections"
    (let [search-string "custom expression examples"
          a             {:id "a" :name "custom expression examples" :model "dashboard"}
          b             {:id "b" :name "examples of custom expressions" :model "dashboard"}
          c             {:id "c"
                         :name                "customer success stories"
                         :dashboardcard_count 50
                         :updated_at          (t/offset-date-time)
                         :collection_position 1
                         :model               "dashboard"}
          d             {:id "d" :name "customer examples of bad sorting" :model "dashboard"}]
      (doseq [item [a b c d]]
        (is (> (ee-score search-string (assoc item :collection_is_remote_synced true))
               (ee-score search-string item))
            (str "Should be greater for item: " item)))
      (testing "official bump is only a tie-breaker, so it can't overcome text scorers"
        (is (= ["customer examples of bad sorting"
                "customer success stories"
                "examples of custom expressions"
                "custom expression examples"]
               (mapv :name (sort-by #(ee-score search-string %)
                                    (shuffle [a b c (assoc d :collection_is_remote_synced true)])))))))))

(defn- all-permutations-all-orders
  "(all-permutations-all-orders [1]) ;; => [[] [1]]
   (all-permutations-all-orders [1 2])
   ;; => [[] [1] [2] [1 2] [2 1]]
   (all-permutations-all-orders [1 2 3])
   ;; => [[]                                               ;; size 0
   ;;     [1]             [2]             [3]              ;; size 1
   ;;     [1 2]   [2 1]   [1 3]   [3 1]   [2 3]   [3 2]    ;; size 2
   ;;     [1 2 3] [1 3 2] [2 1 3] [2 3 1] [3 1 2] [3 2 1]] ;; size 3
  "
  [values]
  {:pre [(> 10 (count values))]}
  (mapv vec (mapcat math.combo/permutations (math.combo/subsets values))))

(defn test-corpus [words]
  (let [corpus (->> words
                    all-permutations-all-orders
                    (mapv #(str/join " " %))
                    (remove #{""}))
        the-query (json/encode {:type :query :query {:source-table 1}})
        ->query (fn [n] {:name n :dataset_query the-query})
        results (map ->query corpus)]
    (doseq [search-string corpus]
      (is (= search-string
             (-> (scoring/top-results
                  results
                  1
                  (keep #(scoring/score-and-result % {:search-string search-string})))
                 first
                 :name))))))

(deftest identical-results-result-in-identical-hits
  (test-corpus ["foo" "bar"])
  (test-corpus ["foo" "bar" "baz"])
  (test-corpus ["foo" "bar" "baz" "quux"]))

(deftest score-result-test
  (testing "includes official score"
    (is (contains? (set (map :name (scoring/score-result {}))) "official"))))

(deftest appdb-official-test
  (appdb.scoring-test/with-index-contents
    [{:model "collection" :id 1 :name "collection normal" :official false}
     {:model "collection" :id 2 :name "collection official" :official true}]
    (testing "official items have higher rank"
      (is (= [["collection" 2 "collection official"]
              ["collection" 1 "collection normal"]]
             (appdb.scoring-test/search-results :official "collection"))))))

(deftest transforms-user-recency-test
  ;; Create the temporary index table before `with-temp` opens its transaction. On H2 and MySQL, DDL on the
  ;; ambient connection would implicitly commit that transaction, preventing rollback and leaking rows into later
  ;; tests. The nested index-table scope below reuses this table. Materialize the test-data Database first as well;
  ;; otherwise its ingestion would enter the temporary index and appear as an extra search result.
  (mt/id)
  (search.tu/with-temp-index-table
    (mt/with-premium-features #{:transforms-basic :hosting}
      (let [user-id (mt/user->id :crowberto)
            now     (Instant/now)
            recent-view (fn [model-id timestamp]
                          {:model     "card"
                           :model_id  model-id
                           :user_id   user-id
                           :timestamp timestamp})]
        (mt/with-temp [:model/Card        {c1 :id} {}
                       :model/Card        {c2 :id} {}
                       :model/Transform   {t1 :id} {:name "test transform"
                                                    :source {:type :query
                                                             :query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                                                    :target {:type "table"
                                                             :name (mt/random-name)}}
                       :model/RecentViews _ (recent-view c1 now)]
          (appdb.scoring-test/with-index-contents
            [{:model "card"      :id c1 :name "test card recent"}
             {:model "card"      :id c2 :name "test card unseen"}
             {:model "transform" :id t1 :name "test transform" :source_type "mbql"}]
            (testing "Transforms get a hardcoded 1-day recency (between recently viewed card and never viewed card)"
              (is (= [["card"      c1 "test card recent"]
                      ["transform" t1 "test transform"]
                      ["card"      c2 "test card unseen"]]
                     (appdb.scoring-test/search-results :user-recency "test" {:current-user-id user-id
                                                                              :context :metabot}))))))))))
