(ns metabase.search.appdb.specializations.mysql-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.core]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.scoring :as appdb.scoring]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.db :as search.db]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.scoring :as search.scoring]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each (fn [thunk] (when (= :mysql (mdb/db-type)) (thunk))))

(defn- index-documents! [documents]
  (specialization/batch-upsert! (search.index/active-table)
                                (map (comp #'search.index/document->entry #'search.ingestion/->document)
                                     documents)))

(deftest mysql-index-lifecycle-test
  (is (search.engine/supported-engine? :search.engine/appdb))
  (search.index/with-temp-index-table
    (let [table     (search.index/active-table)
          long-text (apply str (repeat 20000 "🦉"))]
      (index-documents! [{:model       "card"
                          :id          1
                          :name        "Orders"
                          :description long-text}
                         {:model "card", :id 2, :name "Revenue"}])
      (is (= 2 (search.db/index-entry-count table)))
      (is (str/includes? (:search_terms (search.db/index-row table "card" "1")) long-text))
      (index-documents! [{:model "card", :id 1, :name "Renamed orders"}])
      (is (= 2 (search.db/index-entry-count table)))
      (is (= "Renamed orders" (:name (search.db/index-row table "card" "1"))))
      (search.db/delete-index-rows! table "card" ["1"])
      (is (= 1 (search.db/index-entry-count table))))))

(deftest view-count-percentiles-test
  (search.index/with-temp-index-table
    (index-documents! [{:model      "card"
                        :id         1
                        :name       "A"
                        :view_count 0}
                       {:model      "card"
                        :id         2
                        :name       "B"
                        :view_count 10}
                       {:model      "card"
                        :id         3
                        :name       "C"
                        :view_count 30}
                       {:model "card", :id 4, :name "D"}
                       {:model      "dashboard"
                        :id         1
                        :name       "E"
                        :view_count 8}])
    (doseq [[percentile expected] [[0 0] [0.25 5] [0.5 10] [0.75 20] [1 30]]]
      (is (= {"card" (double expected), "dashboard" 8.0}
             (into {} (map (juxt :model (comp double :vcp)))
                   (search.db/view-count-percentile-rows (search.index/active-table) percentile)))))))

(defn- matching-ids
  ([query] (matching-ids query false))
  ([query native?]
   (into #{} (map (comp parse-long :model_id))
         (search.db/search-index-rows (search.index/active-table) query native? [:model_id]))))

(deftest boolean-query-semantics-test
  (search.index/with-temp-index-table
    (index-documents! [{:model "card", :id 1, :name "Revenue by region"}
                       {:model       "card"
                        :id          2
                        :name        "Revenue forecast"
                        :description "Regional breakdown"}
                       {:model "card", :id 3, :name "Customer refunds"}
                       {:model "card", :id 4, :name "Test revenue by region"}])
    (doseq [[query expected] [[nil #{1
                                     2
                                     3
                                     4}]
                              ["" #{1
                                    2
                                    3
                                    4}]
                              ["revenue region" #{1 2 4}]
                              ["revenue and region" #{1 2 4}]
                              ["revenue -test" #{1 2}]
                              ["-test" #{1 2 3}]
                              ["refunds OR revenue region" #{1
                                                             2
                                                             3
                                                             4}]
                              ["\"revenue forecast\"" #{2}]
                              ;; Both engines concatenate the title and searchable text, which includes the title.
                              ["\"forecast revenue\"" #{2}]
                              ["\"revenue fore" #{2}]
                              ["rev region" #{}]
                              ["venue" #{}]
                              ["+revenue" #{1 2 4}]
                              ["revenue*" #{1 2 4}]
                              ["\"" #{}]]]
      (testing (pr-str query)
        (is (= expected (matching-ids query)))))))

(deftest native-query-matching-test
  (search.index/with-temp-index-table
    (index-documents! [{:model        "card"
                        :id           1
                        :name         "Orders"
                        :native_query "SELECT secret_column FROM orders"}
                       {:model       "card"
                        :id          2
                        :name        "Orders"
                        :description "secret_column"}])
    (is (= #{2} (matching-ids "orders secret_column")))
    (is (= #{1 2} (matching-ids "orders secret_column" true)))))

(deftest title-weight-test
  (search.index/with-temp-index-table
    (index-documents! [{:model "card", :id 1, :name "Revenue forecast"}
                       {:model       "card"
                        :id          2
                        :name        "Overview"
                        :description "Revenue forecast"}
                       {:model "card", :id 3, :name "Unrelated"}])
    (let [query {:search-string "revenue"}
          rows  (t2/query (assoc (specialization/base-query (search.index/active-table) "revenue" query
                                                            [:model_id [(specialization/text-score query) :score]])
                                 :order-by [[:score :desc]]))]
      (is (= ["1" "2"] (mapv :model_id rows)))
      (is (pos? (:score (first rows)))))))

(deftest literal-stopwords-test
  (search.index/with-temp-index-table
    (index-documents! [{:model "card", :id 1, :name "The Office"}
                       {:model "card", :id 2, :name "Office supplies"}])
    (is (= #{1} (matching-ids "the office")))))

(deftest accent-sensitive-matching-test
  (search.index/with-temp-index-table
    (index-documents! [{:model "card", :id 1, :name "Café sales"}
                       {:model "card", :id 2, :name "CAFE sales"}])
    (is (= #{2} (matching-ids "cafe")))
    (is (= #{1} (matching-ids "CAFÉ")))))

(deftest underscore-word-separator-test
  (search.index/with-temp-index-table
    (index-documents! [{:model "card", :id 1, :name "User ID"}])
    (is (= #{1} (matching-ids "user_id")))
    (is (= #{1} (matching-ids "\"user id\"")))))

(deftest reads-own-index-writes-test
  (search.index/with-temp-index-table
    (t2/with-transaction [_conn]
      (index-documents! [{:model "card", :id 1, :name "Revenue forecast"}])
      (is (= #{1} (matching-ids "revenue")))
      (index-documents! [{:model "card", :id 1, :name "Updated forecast"}])
      (is (= #{} (matching-ids "revenue")))
      (is (= #{1} (matching-ids "updated"))))))

(deftest user-recency-score-test
  (search.index/with-temp-index-table
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/RecentViews _ {:model "card", :model_id 123, :user_id user-id}]
      (index-documents! [{:model "card", :id 123, :name "Recent card"}])
      (let [context {:current-user-id user-id}
            rows    (t2/query {:select [:search_index.model_id
                                        [(search.scoring/user-recency-expr context) :viewed_at]
                                        [(search.scoring/inverse-duration
                                          (search.scoring/user-recency-expr context) [:now] 30)
                                         :score]]
                               :from   [[(search.index/active-table) :search_index]]})]
        (is (some? (:viewed_at (first rows))))
        (is (< 0.99 (:score (first rows))))))))

(deftest long-word-prefix-test
  (search.index/with-temp-index-table
    (let [long-word (apply str (repeat 100 "a"))]
      (index-documents! [{:model "card", :id 1, :name long-word}
                         {:model "card", :id 2, :name "aaaashort"}
                         {:model       "card"
                          :id          3
                          :name        "Overview"
                          :description long-word}
                         {:model        "card"
                          :id           4
                          :name         "Overview"
                          :native_query long-word}])
      (doseq [prefix-length [3 4 83 84 85]]
        (let [prefix   (subs long-word 0 prefix-length)
              expected (cond-> #{1 3} (= prefix-length 3) (conj 2) (= prefix-length 4) (conj 2))]
          (testing (str "prefix length " prefix-length)
            (is (= expected (matching-ids prefix)))
            (is (= (conj expected 4) (matching-ids prefix true))))))
      (testing "completion does not broaden a non-final exact word"
        (is (empty? (matching-ids "aaaa overview"))))
      (testing "exclusions also see prefixes of long words"
        (is (= #{4} (matching-ids "overview -aaaa")))))))

(deftest all-null-view-counts-test
  (search.index/with-temp-index-table
    (index-documents! [{:model "card", :id 1, :name "Unviewed"}])
    (is (empty? (search.db/view-count-percentile-rows (search.index/active-table) 0.99)))))

(deftest empty-upsert-test
  (mt/with-dynamic-fn-redefs [t2/query (fn [& _] (throw (ex-info "Unexpected query" {})))]
    (is (nil? (specialization/batch-upsert! :unused [])))))

(deftest fulltext-stopwords-restored-after-failure-test
  (doseq [initial [0 1]]
    (let [enabled? (atom (pos? initial))]
      (mt/with-dynamic-fn-redefs
        [search.db/mysql-fulltext-options (constantly {:stopwords initial})
         search.db/set-mysql-fulltext-stopwords! #(reset! enabled? %)
         search.db/create-search-index-table! (fn [_]
                                                (is (false? @enabled?))
                                                (throw (ex-info "Index creation failed" {})))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Index creation failed"
                              (search.index/create-table! :unused))))
      (is (= (pos? initial) @enabled?)))))

(deftest fulltext-stopwords-restored-after-success-test
  (doseq [initial [0 1]]
    (let [enabled? (atom (pos? initial))]
      (mt/with-dynamic-fn-redefs
        [search.db/mysql-fulltext-options (constantly {:stopwords initial})
         search.db/set-mysql-fulltext-stopwords! #(reset! enabled? %)
         search.db/create-search-index-table! (fn [_] (is (false? @enabled?)))]
        (search.index/create-table! :unused))
      (is (= (pos? initial) @enabled?)))))

(deftest missing-model-percentile-test
  (search.index/with-temp-index-table
    (index-documents! [{:model      "card"
                        :id         1
                        :name       "Viewed"
                        :view_count 5}])
    (is (== 1 (:score (t2/query-one
                       {:select [[(#'appdb.scoring/view-count-expr {:dashboard 10}) :score]]
                        :from   [[(search.index/active-table) :search_index]]}))))))
