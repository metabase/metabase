(ns metabase.usage-metadata.insights-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.content-verification.core :as moderation]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidate-builders :as candidate-builders]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.candidate-suggestions :as candidate-suggestions]
   [metabase.usage-metadata.extract :as usage-metadata.extract]
   [metabase.usage-metadata.frequent-itemsets :as frequent-itemsets]
   [metabase.usage-metadata.insights :as insights]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [metabase.usage-metadata.query-source :as query-source]
   [metabase.usage-metadata.rollups :as rollups]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users-personal-collections))

(def ^:private mine-itemsets               @#'frequent-itemsets/mine-itemsets)
(def ^:private closed-only                 @#'frequent-itemsets/closed-only)
(def ^:private itemset-support             @#'frequent-itemsets/itemset-support)
(def ^:private any-atom-support            frequent-itemsets/any-atom-support)
(def ^:private rebuild-and-clause          @#'rollups/rebuild-and-clause)
(def ^:private relative-support-ok?        frequent-itemsets/relative-support-ok?)
(def ^:private existing-composite-atomsets @#'rollups/existing-composite-atomsets)
(def ^:private composite-atomsets-memo     @#'rollups/existing-segment-facts*-memo)
(def ^:private candidate-source-cards       candidate-mining/candidate-source-cards)
(def ^:private candidate-lineage-card-index candidate-mining/candidate-lineage-card-index)
(def ^:private candidate-model-index        candidate-mining/candidate-model-index)
(def ^:private mapcat-id-batches           @#'candidate-mining/mapcat-id-batches)
(def ^:private verified-card-ids           @#'candidate-mining/verified-card-ids)
(def ^:private official-collection-ids     @#'candidate-mining/official-collection-ids)
(def ^:private recent-card-view-counts     @#'candidate-mining/recent-card-view-counts)
(def ^:private existing-measure-signatures @#'candidate-builders/existing-measure-signatures)
(def ^:private existing-segment-signatures @#'candidate-builders/existing-segment-signatures)
(def ^:private segment-signature           candidate-mining/segment-signature)
(def ^:private canonical-signature         candidate-mining/canonical-signature)
(def ^:private add-measure-suggestions     candidate-suggestions/add-measure-suggestions)
(def ^:private add-segment-suggestions     candidate-suggestions/add-segment-suggestions)
(def ^:private column-predicate-kind       candidate-suggestions/column-predicate-kind)
(def ^:private predicate-candidates        candidate-mining/predicate-candidates)
(def ^:private merge-candidates            @#'candidate-builders/merge-candidates)
(def ^:private card-table-dependencies     @#'candidate-builders/card-table-dependencies)
(def ^:private eligible-candidate-table?   @#'candidate-builders/eligible-candidate-table?)
(def ^:private merge-metric-candidates     @#'candidate-builders/merge-metric-candidates)
(def ^:private raw-table-candidate-analysis @#'candidate-builders/raw-table-candidate-analysis)
(def ^:private rank-candidate-tables       @#'candidate-builders/rank-candidate-tables)
(def ^:private table-candidate-evidence    @#'candidate-builders/table-candidate-evidence)
(def ^:private usable-table-dependency?    @#'candidate-builders/usable-table-dependency?)
(def ^:private suggestions-or-fallback     candidate-suggestions/suggestions-or-fallback)

(deftest ^:parallel malformed-candidate-naming-falls-back-test
  (let [failure (fn [_] (throw (ex-info "stale field" {})))]
    (is (=? {:aggregation {:type :sum, :base-name "Measure"}
             :source {:display-name "Orders"}
             :suggested-name "Measure"
             :suggested-description "Measure on Orders"}
            (suggestions-or-fallback {:aggregation {:type :sum}
                                      :source {:display-name "Orders"}}
                                     :measure
                                     failure)))
    (is (=? {:atoms []
             :source {:display-name "Orders"}
             :suggested-name "Segment"
             :suggested-description "Filtered by Segment on Orders"}
            (suggestions-or-fallback {:source {:display-name "Orders"}}
                                     :segment
                                     failure)))))

(deftest ^:parallel itemset-support-counts-containing-baskets-weighted-by-count-test
  (let [baskets [{:atoms #{:a :b :c} :count 3}
                 {:atoms #{:a :b}     :count 2}
                 {:atoms #{:a :c}     :count 1}
                 {:atoms #{:b}        :count 4}]]
    (testing "support = sum of basket counts for baskets containing ALL atoms in the itemset"
      (are [expected itemset] (= expected (itemset-support baskets itemset))
        5 #{:a :b}
        4 #{:a :c}
        3 #{:a :b :c}
        0 #{:z}))
    (testing "any-atom-support = sum of basket counts for baskets containing ANY atom in the itemset"
      (are [expected itemset] (= expected (any-atom-support baskets itemset))
        10 #{:a :b}
        6  #{:a}))
    (testing "a basket contributes to an itemset's support exactly once per its own count"
      (doseq [basket baskets]
        (let [contributes? (every? (:atoms basket) #{:a :b})]
          (is (= (if contributes? (:count basket) 0)
                 (itemset-support [basket] #{:a :b}))))))))

(deftest ^:parallel mine-itemsets-worked-example-test
  (testing "design-doc worked example: baskets {a1,a2,a3}+{a1,a2,a4} yield the {a1,a2} closed itemset"
    (let [baskets [{:atoms #{:a1 :a2 :a3} :count 1}
                   {:atoms #{:a1 :a2 :a4} :count 1}]
          mined   (mine-itemsets baskets)
          closed  (closed-only mined)]
      (is (= {[:a1 :a2] 2} mined)
          "absolute support floor of 2 keeps only the pair that co-occurs in both baskets")
      (is (= {[:a1 :a2] 2} closed)
          "closed filter has nothing to collapse when only one itemset survives"))))

(deftest ^:parallel closed-only-drops-subsumed-itemsets-of-equal-support-test
  (testing "if {a,b} and {a,b,c} have equal support, closed filter drops the smaller subset"
    (is (= {[:a :b :c] 2}
           (closed-only {[:a :b]     2
                         [:a :b :c]  2}))))
  (testing "subsets with strictly greater support are preserved"
    (is (= {[:a :b]     5
            [:a :b :c]  2}
           (closed-only {[:a :b]     5
                         [:a :b :c]  2}))))
  (testing "unrelated itemsets are untouched"
    (is (= {[:a :b] 3 [:c :d] 3}
           (closed-only {[:a :b] 3 [:c :d] 3})))))

(deftest ^:parallel mine-itemsets-respects-size-bounds-test
  (testing "only itemsets of size ≥ fim-k-min (2) appear in output — no singletons"
    (let [baskets [{:atoms #{:a :b} :count 5}]
          mined   (mine-itemsets baskets)]
      (is (every? #(>= (count %) 2) (keys mined)))
      (is (not (contains? mined [:a])))
      (is (not (contains? mined [:b]))))))

(deftest ^:parallel merge-candidates-applies-complete-ranking-before-limit-test
  (letfn [(source-items [n {:keys [verified? official? total-views]}]
            (mapv (fn [i]
                    {:id                   i
                     :name                 (str "Source " i)
                     :type                 :question
                     :verified?            (and verified? (zero? i))
                     :official-collection? (and official? (zero? i))
                     :popular?             false
                     :view-count           (if (zero? i) total-views 0)
                     :stage-number         0
                     :joined?              false})
                  (range n)))
          (raw-candidates [label signature atom-count evidence]
            (mapv (fn [source-item]
                    {:metabase.usage-metadata.candidate-mining/signature   signature
                     :metabase.usage-metadata.candidate-mining/table-id    1
                     :metabase.usage-metadata.candidate-mining/source-item source-item
                     :label                                        label
                     :atom-count                                   atom-count})
                  (source-items (:distinct-sources evidence) evidence)))]
    (let [candidates (mapcat (fn [[label signature atom-count evidence]]
                               (raw-candidates label signature atom-count evidence))
                             [[:signature-b ["b"] 2 {:distinct-sources 2 :total-views 50}]
                              [:views       ["views"] 2 {:distinct-sources 2 :total-views 100}]
                              [:atoms       ["atoms"] 1 {:distinct-sources 2 :total-views 0}]
                              [:distinct    ["distinct"] 5 {:distinct-sources 3 :total-views 0}]
                              [:official    ["official"] 5 {:distinct-sources 1 :official? true :total-views 0}]
                              [:verified    ["verified"] 5 {:distinct-sources 1 :verified? true :total-views 0}]
                              [:signature-a ["a"] 2 {:distinct-sources 2 :total-views 50}]])
          source-index {[:table 1] {:type :table :id 1 :name "Table"}}
          limited      (merge-candidates candidates source-index #{} 6)]
      (is (= [:verified :official :distinct :atoms :views :signature-a]
             (mapv :label limited))))))

(deftest existing-segment-predicates-cached-test
  (testing "existing-segment-predicates is TTL-memoized — repeated calls with the same opts hit the DB once"
    (let [segment-selects (atom 0)
          real-select     t2/select
          existing-fn     @#'rollups/existing-segment-predicates
          memo-var        @#'rollups/existing-segment-facts*-memo]
      (memoize/memo-clear! memo-var)
      (with-redefs [t2/select (fn [& args]
                                (when (and (sequential? (first args))
                                           (= :model/Segment (ffirst args)))
                                  (swap! segment-selects inc))
                                (apply real-select args))]
        (existing-fn {})
        (existing-fn {})
        (is (= 1 @segment-selects)))
      (memoize/memo-clear! memo-var))))

(deftest existing-metric-signatures-cached-test
  (testing "existing-metric-signatures is TTL-memoized"
    (let [card-selects (atom 0)
          real-select  t2/select
          existing-fn  @#'rollups/existing-metric-signatures
          memo-var     @#'rollups/existing-metric-signatures*-memo]
      (memoize/memo-clear! memo-var)
      (with-redefs [t2/select (fn [& args]
                                (when (and (sequential? (first args))
                                           (= :model/Card (ffirst args)))
                                  (swap! card-selects inc))
                                (apply real-select args))]
        (existing-fn)
        (existing-fn)
        (is (= 1 @card-selects)))
      (memoize/memo-clear! memo-var))))

;;; ---------- composite-segment read-path tests ----------

(deftest ^:parallel rebuild-and-clause-test
  (let [fp-a "[\"=\",{},[\"field\",{},1],1]"
        fp-b "[\">\",{},[\"field\",{},2],0]"]
    (testing "builds a properly-shaped :and MBQL clause from atom fingerprints"
      (is (lib/clause-of-type? (rebuild-and-clause [fp-a fp-b]) :and)))
    (testing "returns nil below fim-k-min (2) atoms"
      (is (nil? (rebuild-and-clause [])))
      (is (nil? (rebuild-and-clause [fp-a]))))
    (testing "returns nil when decode-predicate drops everything below the floor"
      (is (nil? (rebuild-and-clause [nil nil])))
      (is (nil? (rebuild-and-clause [fp-a nil]))))))

(deftest ^:parallel relative-support-ok?-test
  (testing "ratio above 0.2 floor → true"
    (let [baskets [{:atoms #{:a :b} :count 4}
                   {:atoms #{:a :c} :count 1}]]
      (is (relative-support-ok? baskets [:a :b] 4))))
  (testing "ratio below 0.2 floor → false"
    (let [baskets [{:atoms #{:a :b} :count 1}
                   {:atoms #{:a :c} :count 4}
                   {:atoms #{:b :c} :count 5}]]
      (is (not (relative-support-ok? baskets [:a :b] 1)))))
  (testing "zero denominator → true (boundary)"
    (is (relative-support-ok? [] [:z] 0))))

(def ^:private composite-test-bucket-date (t/local-date "2099-01-01"))

(defn- composite-orders-query []
  (let [mp        (lib-be/application-database-metadata-provider (mt/id))
        orders    (lib.metadata/table mp (mt/id :orders))
        prod-id   (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal  (lib.metadata/field mp (mt/id :orders :subtotal))]
    (-> (lib/query mp orders)
        (lib/filter (lib/and (lib/= prod-id 1)
                             (lib/> subtotal 0))))))

(defn- composite-fact-for-orders []
  (->> (composite-orders-query)
       usage-metadata.extract/extract-usage-facts
       :composites
       (filter (fn [{:keys [source-type ownership-mode]}]
                 (and (= :table source-type) (= :direct ownership-mode))))
       first))

(defn- seed-composite-row!
  [{:keys [source-type source-id clause atom-fingerprints atom-count]} cnt]
  (t2/insert! :model/SourceSegmentCompositeDaily
              {:source_type       source-type
               :source_id         source-id
               :ownership_mode    :direct
               :clause            clause
               :atom_fingerprints (json/encode atom-fingerprints)
               :atom_count        atom-count
               :bucket_date       composite-test-bucket-date
               :count             cnt}))

(defn- cleanup-composite-rows! []
  (t2/delete! :model/SourceSegmentCompositeDaily :bucket_date composite-test-bucket-date))

(defn- composite-opts [source-id]
  {:source-type  :table
   :source-id    source-id
   :bucket-start composite-test-bucket-date
   :bucket-end   composite-test-bucket-date})

(deftest suggested-segments-for-owner-happy-path-test
  (cleanup-composite-rows!)
  (memoize/memo-clear! composite-atomsets-memo)
  (let [fact (composite-fact-for-orders)
        opts (composite-opts (mt/id :orders))]
    (try
      (seed-composite-row! fact 3)
      (let [results (insights/suggested-segments-for-owner opts)]
        (testing "candidate is returned when no saved Segment matches"
          (is (seq results)))
        (testing "top candidate is a valid :and MBQL clause attributed to the right source"
          (let [{:keys [clause itemset-size source]} (first results)]
            (is (lib/clause-of-type? clause :and))
            (is (= (:atom-count fact) itemset-size))
            (is (= :table (:type source)))
            (is (= (mt/id :orders) (:id source))))))
      (finally
        (cleanup-composite-rows!)
        (memoize/memo-clear! composite-atomsets-memo)))))

(deftest suggested-segments-for-owner-skips-saved-segment-match-test
  (cleanup-composite-rows!)
  (memoize/memo-clear! composite-atomsets-memo)
  (let [fact (composite-fact-for-orders)
        opts (composite-opts (mt/id :orders))]
    (try
      (seed-composite-row! fact 3)
      (testing "precondition: candidate is present without a saved Segment"
        (is (seq (insights/suggested-segments-for-owner opts))))
      (memoize/memo-clear! composite-atomsets-memo)
      (mt/with-temp [:model/Segment _seg {:table_id   (mt/id :orders)
                                          :definition (composite-orders-query)}]
        (let [results (insights/suggested-segments-for-owner opts)]
          (testing "candidate is filtered out when a saved Segment has the same atom-set"
            (is (not-any? (fn [{:keys [source itemset-size]}]
                            (and (= :table (:type source))
                                 (= (mt/id :orders) (:id source))
                                 (= (:atom-count fact) itemset-size)))
                          results)))))
      (finally
        (cleanup-composite-rows!)
        (memoize/memo-clear! composite-atomsets-memo)))))

(deftest existing-composite-atomsets-cached-test
  (testing "existing-composite-atomsets is TTL-memoized — repeated calls hit the DB once"
    (memoize/memo-clear! composite-atomsets-memo)
    (let [segment-selects (atom 0)
          real-select     t2/select]
      (try
        (with-redefs [t2/select (fn [& args]
                                  (when (and (sequential? (first args))
                                             (= :model/Segment (ffirst args)))
                                    (swap! segment-selects inc))
                                  (apply real-select args))]
          (existing-composite-atomsets {:source-type :table :source-id (mt/id :orders)})
          (existing-composite-atomsets {:source-type :table :source-id (mt/id :orders)})
          (is (= 1 @segment-selects)))
        (finally
          (memoize/memo-clear! composite-atomsets-memo))))))

(deftest suggested-segments-for-owner-empty-when-no-rows-test
  (cleanup-composite-rows!)
  (memoize/memo-clear! composite-atomsets-memo)
  (try
    (is (= [] (insights/suggested-segments-for-owner
               (composite-opts (mt/id :orders)))))
    (finally
      (memoize/memo-clear! composite-atomsets-memo))))

;;; ---------- deterministic candidate mining tests ----------

(defn- orders-base-query []
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(defn- orders-measure-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (lib/aggregate (orders-base-query) (lib/sum subtotal))))

(defn- orders-named-measure-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (lib/aggregate (orders-base-query)
                   (lib/with-expression-name (lib/sum subtotal) "Custom subtotal total"))))

(defn- orders-count-query []
  (lib/aggregate (orders-base-query) (lib/count)))

(defn- orders-extended-measures-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (reduce lib/aggregate
            (orders-base-query)
            [(lib/count subtotal)
             (lib/median subtotal)
             (lib/stddev subtotal)
             (lib/var subtotal)
             (lib/percentile subtotal 0.9)])))

(defn- orders-conditional-measure-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        user-id    (lib.metadata/field mp (mt/id :orders :user_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (reduce lib/aggregate
            (lib/filter (orders-base-query) (lib/= product-id 987654))
            [(lib/count)
             (lib/distinct user-id)
             (lib/sum subtotal)])))

(defn- orders-segment-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (lib/filter (orders-base-query)
                (lib/and (lib/= product-id 987654)
                         (lib/> subtotal 12345)))))

(deftest predicate-candidates-canonicalize-source-atom-order-test
  (let [mp          (lib-be/application-database-metadata-provider (mt/id))
        first-field (lib.metadata/field mp (mt/id :orders :subtotal))
        second-field (lib.metadata/field mp (mt/id :orders :product_id))
        first-atom  {:predicate (lib/> first-field 10), :columns [first-field]}
        second-atom {:predicate (lib/= second-field 20), :columns [second-field]}
        predicates  (fn [atoms]
                      (:predicates (last (predicate-candidates atoms))))]
    (is (= (mapv canonical-signature (predicates [first-atom second-atom]))
           (mapv canonical-signature (predicates [second-atom first-atom]))))
    (is (= (sort [(canonical-signature (:predicate first-atom))
                  (canonical-signature (:predicate second-atom))])
           (mapv canonical-signature (predicates [first-atom second-atom]))))))

(defn- orders-filtered-metric-query
  ([] (orders-filtered-metric-query 987654))
  ([product-value]
   (let [mp         (lib-be/application-database-metadata-provider (mt/id))
         product-id (lib.metadata/field mp (mt/id :orders :product_id))
         subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
     (-> (orders-base-query)
         (lib/filter (lib/= product-id product-value))
         (lib/aggregate (lib/sum subtotal))))))

(defn- orders-filtered-count-metric-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))]
    (-> (orders-base-query)
        (lib/filter (lib/= product-id 987654))
        (lib/aggregate (lib/count)))))

(defn- orders-temporal-metric-query
  ([] (orders-temporal-metric-query :month))
  ([unit]
   (let [mp         (lib-be/application-database-metadata-provider (mt/id))
         created-at (lib.metadata/field mp (mt/id :orders :created_at))]
     (lib/breakout (orders-filtered-metric-query)
                   (lib/with-temporal-bucket created-at unit)))))

(defn- orders-breakout-only-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        created-at (lib.metadata/field mp (mt/id :orders :created_at))]
    (lib/breakout (orders-measure-query)
                  (lib/with-temporal-bucket created-at :month))))

(defn- orders-categorical-breakout-metric-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))]
    (lib/breakout (orders-filtered-metric-query) product-id)))

(defn- orders-expression-metric-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (as-> (orders-base-query) query
      (lib/expression query "Adjusted subtotal" (lib/* subtotal 2))
      (lib/aggregate query (lib/sum (lib/expression-ref query "Adjusted subtotal"))))))

(defn- model-source-query
  [card-id]
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- orders-three-atom-segment-query [quantity-value]
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))
        quantity   (lib.metadata/field mp (mt/id :orders :quantity))]
    (lib/filter (orders-base-query)
                (lib/and (lib/= product-id 987654)
                         (lib/> subtotal 12345)
                         (lib/= quantity quantity-value)))))

(defn- orders-multi-stage-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (-> (orders-base-query)
        (lib/with-fields [product-id subtotal])
        lib/append-stage
        (lib/filter -1 (lib/= product-id 987654))
        (lib/aggregate -1 (lib/sum subtotal)))))

(defn- orders-joined-query []
  (let [mp               (lib-be/application-database-metadata-provider (mt/id))
        products         (lib.metadata/table mp (mt/id :products))
        orders-product   (lib.metadata/field mp (mt/id :orders :product_id))
        orders-subtotal  (lib.metadata/field mp (mt/id :orders :subtotal))
        products-id      (lib.metadata/field mp (mt/id :products :id))
        products-category (lib.metadata/field mp (mt/id :products :category))
        join-alias       "Products"]
    (-> (orders-base-query)
        (lib/join (-> (lib/join-clause
                       products
                       [(lib/= orders-product (lib/with-join-alias products-id join-alias))])
                      (lib/with-join-alias join-alias)))
        (lib/filter (lib/= orders-subtotal 12345))
        (lib/filter (lib/= (lib/with-join-alias products-category join-alias) "Gadget"))
        (lib/filter (lib/= orders-product (lib/with-join-alias products-id join-alias)))
        (lib/aggregate (lib/sum orders-subtotal)))))

(defn- orders-implicit-join-query []
  (let [mp              (lib-be/application-database-metadata-provider (mt/id))
        source-field-id (mt/id :orders :product_id)
        target-field    (lib.metadata/field mp (mt/id :products :category))
        target-ref      (assoc-in (lib/ref target-field) [1 :source-field] source-field-id)]
    (lib/filter (orders-base-query)
                (lib/= target-ref "Gadget"))))

(defn- orders-implicit-join-metric-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (lib/aggregate (orders-implicit-join-query) (lib/sum subtotal))))

(defn- selected-cards-source
  [& card-ids]
  (reify query-source/CandidateQuerySource
    (card-ids [_] (set card-ids))))

(defn- candidates-from-card
  [card-id candidates]
  (filterv (fn [candidate]
             (some #(= card-id (:id %)) (get-in candidate [:evidence :source-items])))
           candidates))

(deftest candidate-source-cards-use-curation-or-popularity-test
  (let [query (orders-base-query)
        now   (t/offset-date-time)]
    (mt/with-temp [:model/Collection {official-collection-id :id} {:authority_level "official"}
                   :model/Card {plain-id :id} {:name "candidate mining plain"
                                               :type :question
                                               :dataset_query query
                                               :view_count 1000000}
                   :model/Card {official-id :id} {:name "candidate mining official"
                                                  :type :model
                                                  :dataset_query query
                                                  :collection_id official-collection-id
                                                  :view_count 0}
                   :model/Card {verified-id :id} {:name "candidate mining verified"
                                                  :type :question
                                                  :dataset_query query
                                                  :view_count 0}
                   :model/Card {popular-id :id} {:name "candidate mining popular"
                                                 :type :question
                                                 :dataset_query query
                                                 :view_count 0}
                   :model/Card {stale-id :id} {:name "candidate mining stale"
                                               :type :question
                                               :dataset_query query
                                               :view_count 1000000}]
      (moderation/create-review! {:moderated_item_id   verified-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :status              "verified"})
      (t2/insert! :model/ViewLog
                  [{:user_id   (mt/user->id :crowberto)
                    :model     "card"
                    :model_id  popular-id
                    :timestamp now}
                   {:user_id   (mt/user->id :crowberto)
                    :model     "card"
                    :model_id  popular-id
                    :timestamp (t/minus now (t/days 30))}
                   {:user_id   (mt/user->id :crowberto)
                    :model     "card"
                    :model_id  stale-id
                    :timestamp (t/minus now (t/days 91))}])
      (let [cards (candidate-source-cards {:min-view-count 2, :view-count-window-days 90})
            by-id (into {} (map (juxt :id identity)) cards)]
        (is (not (contains? by-id plain-id)))
        (is (not (contains? by-id stale-id)))
        (is (true? (:official-collection? (by-id official-id))))
        (is (= :model (:type (by-id official-id))))
        (is (true? (:verified? (by-id verified-id))))
        (is (true? (:popular? (by-id popular-id))))
        (is (= 2 (:view-count (by-id popular-id))))))))

(deftest candidate-source-cards-exclude-personal-collection-subtrees-test
  (let [query       (orders-base-query)
        personal-id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))]
    (mt/with-temp [:model/Collection {personal-child-id :id} {:location (format "/%d/" personal-id)}
                   :model/Collection {shared-id :id} {}
                   :model/Card {personal-card-id :id} {:name          "candidate mining personal root"
                                                       :type          :question
                                                       :dataset_query query
                                                       :collection_id personal-id
                                                       :view_count    1000000}
                   :model/Card {personal-child-card-id :id} {:name          "candidate mining personal child"
                                                             :type          :model
                                                             :dataset_query query
                                                             :collection_id personal-child-id
                                                             :view_count    1000000}
                   :model/Card {shared-card-id :id} {:name          "candidate mining shared collection"
                                                     :type          :question
                                                     :dataset_query query
                                                     :collection_id shared-id
                                                     :view_count    1000000}
                   :model/Card {root-card-id :id} {:name          "candidate mining root collection"
                                                   :type          :question
                                                   :dataset_query query
                                                   :collection_id nil
                                                   :view_count    1000000}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  personal-card-id
                                     :timestamp (t/offset-date-time)}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  personal-child-card-id
                                     :timestamp (t/offset-date-time)}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  shared-card-id
                                     :timestamp (t/offset-date-time)}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  root-card-id
                                     :timestamp (t/offset-date-time)}]
      (let [all-ids      #{personal-card-id personal-child-card-id shared-card-id root-card-id}
            default-ids  (into #{} (map :id)
                               (candidate-source-cards {:min-view-count 10}))
            explicit-ids (into #{} (map :id)
                               (candidate-source-cards
                                {:query-source (apply selected-cards-source all-ids)
                                 :min-view-count 10}))
            qualified-ids (set (insights/qualified-card-ids 1 90))]
        (doseq [ids [default-ids explicit-ids qualified-ids]]
          (is (contains? ids shared-card-id))
          (is (contains? ids root-card-id))
          (is (not (contains? ids personal-card-id)))
          (is (not (contains? ids personal-child-card-id))))))))

(deftest candidate-source-cards-accept-custom-query-source-test
  (let [query (orders-base-query)]
    (mt/with-temp [:model/Card {selected-id :id} {:name          "candidate mining explicitly selected"
                                                  :type          :question
                                                  :dataset_query query
                                                  :view_count    0}
                   :model/Card {unselected-id :id} {:name          "candidate mining not selected"
                                                    :type          :question
                                                    :dataset_query query
                                                    :view_count    1000000}]
      (let [source (reify query-source/CandidateQuerySource
                     (card-ids [_] #{selected-id}))
            cards  (candidate-source-cards {:query-source source :min-view-count 10})
            by-id  (into {} (map (juxt :id identity)) cards)]
        (testing "the source controls inclusion instead of the default curation/popularity gate"
          (is (contains? by-id selected-id))
          (is (not (contains? by-id unselected-id))))
        (testing "curation and popularity are still recorded as ranking evidence"
          (is (false? (:verified? (by-id selected-id))))
          (is (false? (:official-collection? (by-id selected-id))))
          (is (false? (:popular? (by-id selected-id)))))))))

(deftest candidate-tables-resolve-complete-mbql-dependencies-test
  (mt/with-temp [:model/Card {joined-id :id} {:name "candidate table joined question"
                                              :type :question
                                              :dataset_query (orders-joined-query)
                                              :view_count 0}
                 :model/Card {implicit-id :id} {:name "candidate table implicit join question"
                                                :type :question
                                                :dataset_query (orders-implicit-join-query)
                                                :view_count 0}
                 :model/Card {multi-stage-id :id} {:name "candidate table multi-stage question"
                                                   :type :question
                                                   :dataset_query (orders-multi-stage-query)
                                                   :view_count 0}]
    (let [opts       {:query-source (selected-cards-source joined-id implicit-id multi-stage-id)
                      :limit 1000}
          report     (insights/candidate-tables opts)
          candidates (into {} (map (juxt #(get-in % [:table :id]) identity)) (:candidates report))
          orders     (candidates (mt/id :orders))
          products   (candidates (mt/id :products))]
      (testing "direct, explicit-join, implicit-join, and multi-stage table references are discovered"
        (is (= #{(mt/id :orders) (mt/id :products)} (set (keys candidates))))
        (is (= #{joined-id implicit-id multi-stage-id}
               (into #{} (map :id) (get-in orders [:evidence :source-items]))))
        (is (= #{joined-id implicit-id}
               (into #{} (map :id) (get-in products [:evidence :source-items])))))
      (testing "each direct source-to-table endorsement has one direct dependency path"
        (is (every? #(= [{:direct? true, :models []}] (:dependency-paths %))
                    (concat (get-in orders [:evidence :source-items])
                            (get-in products [:evidence :source-items])))))
      (is (empty? (:unsupported-source-items report)))
      (is (= report (insights/candidate-tables opts))
          "repeating the same analysis returns byte-for-byte deterministic output"))))

(deftest candidate-tables-preserve-curation-through-model-lineage-test
  (mt/with-temp [:model/Collection {official-collection-id :id} {:authority_level "official"}
                 :model/Card {base-model-id :id} {:name "candidate table base model"
                                                  :type :model
                                                  :dataset_query (orders-base-query)
                                                  :view_count 0}
                 :model/Card {outer-model-id :id} {:name "candidate table outer model"
                                                   :type :model
                                                   :dataset_query (model-source-query base-model-id)
                                                   :view_count 0}
                 :model/Card {verified-id :id} {:name "candidate table verified question"
                                                :type :question
                                                :dataset_query (model-source-query outer-model-id)
                                                :view_count 0}
                 :model/Card {official-id :id} {:name "candidate table official question"
                                                :type :question
                                                :dataset_query (model-source-query outer-model-id)
                                                :collection_id official-collection-id
                                                :view_count 0}]
    (moderation/create-review! {:moderated_item_id verified-id
                                :moderated_item_type "card"
                                :moderator_id (mt/user->id :crowberto)
                                :status "verified"})
    (let [report    (insights/candidate-tables
                     {:query-source (selected-cards-source verified-id official-id)
                      :limit 1000})
          candidate (first (filter #(= (mt/id :orders) (get-in % [:table :id]))
                                   (:candidates report)))
          items     (into {} (map (juxt :id identity)) (get-in candidate [:evidence :source-items]))
          path      [{:id outer-model-id :name "candidate table outer model"}
                     {:id base-model-id :name "candidate table base model"}]]
      (is (=? {:evidence {:distinct-source-count 2
                          :verified-source-count 1
                          :official-source-count 1}
               :verified-item {:verified? true
                               :dependency-paths [{:direct? false, :models path}]}
               :official-item {:official-collection? true
                               :dependency-paths [{:direct? false, :models path}]}}
              {:evidence (:evidence candidate)
               :verified-item (items verified-id)
               :official-item (items official-id)})))))

(deftest candidate-table-dependency-traversal-preserves-paths-and-guards-cycles-test
  (let [root   {:id 1
                :name "Root"
                :type :question
                :verified? false
                :official-collection? false
                :popular? true
                :view-count 10
                :dataset_query {:models #{2 3}}}
        models {2 {:id 2, :name "Left", :dataset_query {:tables #{99}, :models #{2}}}
                3 {:id 3, :name "Right", :dataset_query {:tables #{99}}}}
        analyze (fn []
                  (card-table-dependencies root models [] #{1}))]
    (with-redefs-fn {#'candidate-mining/wrap-query (fn [_ query] query)
                     #'lib/any-native-stage? (constantly false)
                     #'lib/all-source-table-ids :tables
                     #'lib/all-implicitly-joined-table-ids (constantly nil)
                     #'lib/all-source-card-ids :models}
      (fn []
        (let [dependency-result (analyze)
              rows     (:table-source-items (raw-table-candidate-analysis [root] models))
              evidence (table-candidate-evidence (map :source-item rows))]
          (is (=? {:table-paths {99 #{{:direct? false, :models [{:id 2, :name "Left"}]}
                                      {:direct? false, :models [{:id 3, :name "Right"}]}}}
                   :unsupported []}
                  dependency-result))
          (is (=? {:source-row-count 1
                   :distinct-source-count 1
                   :dependency-path-count 2}
                  {:source-row-count (count rows)
                   :distinct-source-count (:distinct-source-count evidence)
                   :dependency-path-count (count (get-in evidence [:source-items 0 :dependency-paths]))})))))))

(deftest candidate-tables-report-native-and-unreadable-sources-test
  (mt/with-temp [:model/Card {native-id :id} {:name "candidate table native question"
                                              :type :question
                                              :dataset_query (lib/native-query
                                                              (lib-be/application-database-metadata-provider (mt/id))
                                                              "select 1")
                                              :view_count 0}
                 :model/Card {unreadable-id :id} {:name "candidate table unreadable question"
                                                  :type :question
                                                  :dataset_query {}
                                                  :view_count 0}]
    (let [report (insights/candidate-tables
                  {:query-source (selected-cards-source native-id unreadable-id)})]
      (is (empty? (:candidates report)))
      (is (= [{:id native-id
               :name "candidate table native question"
               :type :question
               :reason :native-query}
              {:id unreadable-id
               :name "candidate table unreadable question"
               :type :question
               :reason :unreadable-query}]
             (:unsupported-source-items report))))))

(deftest eligible-candidate-table-exclusions-test
  (let [table    {:active true, :visibility_type nil, :data_layer :internal, :is_published false}
        database {:is_audit false, :is_sample false, :router_database_id nil}]
    (testing "usable dependencies may be published; publication candidates may not"
      (are [expected usable? eligible? table database]
           (= expected [(usable? table database) (eligible? table database)])
        [true true]   usable-table-dependency? eligible-candidate-table? table database
        [true false]  usable-table-dependency? eligible-candidate-table? (assoc table :is_published true) database
        [false false] usable-table-dependency? eligible-candidate-table? (assoc table :active false) database
        [false false] usable-table-dependency? eligible-candidate-table? (assoc table :visibility_type :technical) database
        [false false] usable-table-dependency? eligible-candidate-table? (assoc table :data_layer :hidden) database
        [false false] usable-table-dependency? eligible-candidate-table? table nil
        [false false] usable-table-dependency? eligible-candidate-table? table (assoc database :is_audit true)
        [false false] usable-table-dependency? eligible-candidate-table? table (assoc database :is_sample true)
        [false false] usable-table-dependency? eligible-candidate-table? table (assoc database :router_database_id 123)))
    (is (true? (eligible-candidate-table? (assoc table :data_layer :final) database))
        "final data-layer tables remain eligible")))

(deftest candidate-table-ranking-applies-every-tier-before-limit-test
  (let [base-table {:id 100, :database-name "db", :schema "schema", :name "z"
                    :data-authority :unconfigured, :data-layer :internal, :view-count 0}
        evidence   {:verified-source-count 0, :official-source-count 0, :distinct-source-count 1
                    :popular-source-count 0, :total-view-count 0}
        candidate  (fn [label table-overrides evidence-overrides]
                     {:label label
                      :table (merge base-table table-overrides)
                      :evidence (merge evidence evidence-overrides)})
        candidates [(candidate :tie-loser {:id 102, :name "zz"} {})
                    (candidate :table-views {:id 90, :view-count 1} {})
                    (candidate :total-views {:id 80} {:total-view-count 1})
                    (candidate :popular {:id 70} {:popular-source-count 1})
                    (candidate :distinct {:id 60} {:distinct-source-count 2})
                    (candidate :final {:id 50, :data-layer :final} {})
                    (candidate :authoritative {:id 40, :data-authority :authoritative} {})
                    (candidate :official {:id 30} {:official-source-count 1})
                    (candidate :verified {:id 20} {:verified-source-count 1})]
        limited    (rank-candidate-tables candidates 8)]
    (is (= [:verified :official :authoritative :final :distinct :popular :total-views :table-views]
           (mapv :label limited)))))

(deftest ^:parallel candidate-metric-ranking-applies-every-tier-before-limit-test
  (letfn [(source-items [n {:keys [verified? official? popular? total-views]}]
            (mapv (fn [i]
                    {:id                   i
                     :name                 (str "Source " i)
                     :description          "Source description"
                     :type                 :question
                     :verified?            (boolean (and verified? (zero? i)))
                     :official-collection? (boolean (and official? (zero? i)))
                     :popular?             (boolean (and popular? (zero? i)))
                     :view-count           (if (zero? i) (or total-views 0) 0)
                     :stage-number         0
                     :joined?              false})
                  (range n)))
          (raw-candidates [[label signature evidence]]
            (mapv (fn [source-item]
                    {:metabase.usage-metadata.candidate-mining/signature   signature
                     :metabase.usage-metadata.candidate-mining/source-item source-item
                     :metabase.usage-metadata.candidate-mining/table-ids   #{1}
                     :label                                        label
                     :definition                                   {}
                     :aggregation                                  [:count {}]})
                  (source-items (:distinct-sources evidence) evidence)))]
    (let [raw-candidates (mapcat raw-candidates
                                 [[:signature-b "b" {:distinct-sources 1}]
                                  [:signature-a "a" {:distinct-sources 1}]
                                  [:views "views" {:distinct-sources 1 :total-views 100}]
                                  [:popular "popular" {:distinct-sources 1 :popular? true}]
                                  [:distinct "distinct" {:distinct-sources 2}]
                                  [:official "official" {:distinct-sources 1 :official? true}]
                                  [:verified "verified" {:distinct-sources 1 :verified? true}]])
          table-index   {1 {:id 1, :database-name "db", :schema "schema", :name "table"}}
          limited       (merge-metric-candidates raw-candidates #{} table-index 6)]
      (is (= [:verified :official :distinct :popular :views :signature-a]
             (mapv :label limited)))
      (is (empty? (merge-metric-candidates raw-candidates #{} {} 6))
          "a candidate is rejected if any required physical table is unavailable"))))

(deftest candidate-metrics-return-creation-ready-filtered-and-temporal-definitions-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Paid revenue"
                                            :description "Revenue for the selected product"
                                            :type :question
                                            :dataset_query (orders-temporal-metric-query)
                                            :view_count 0}]
    (let [candidates (insights/candidate-metrics
                      {:query-source (selected-cards-source card-id), :limit 1000})
          candidate  (first candidates)
          definition (:definition candidate)
          validated  (lib/query (lib-be/application-database-metadata-provider (mt/id)) definition)]
      (is (=? {:candidate-count 1
               :can-save? true
               :aggregation-type :sum
               :temporal-unit :month
               :suggested-name "Paid revenue"
               :suggested-description "Revenue for the selected product"
               :required-tables [{:id (mt/id :orders), :published? false}]
               :source-items [{:id card-id}]}
              {:candidate-count (count candidates)
               :can-save? (lib/can-save? validated :metric)
               :aggregation-type (first (:aggregation candidate))
               :temporal-unit (get-in candidate [:temporal-breakout 1 :temporal-unit])
               :suggested-name (:suggested-name candidate)
               :suggested-description (:suggested-description candidate)
               :required-tables (:required-tables candidate)
               :source-items (get-in candidate [:evidence :source-items])}))
      (is (= candidates
             (insights/candidate-metrics
              {:query-source (selected-cards-source card-id), :limit 1000}))
          "the canonical result is deterministic across repeated runs"))))

(deftest candidate-metrics-include-filtered-count-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Paid order count"
                                            :type :question
                                            :dataset_query (orders-filtered-count-metric-query)
                                            :view_count 0}]
    (let [candidate (first (insights/candidate-metrics
                            {:query-source (selected-cards-source card-id), :limit 1000}))]
      (is (= :count (first (:aggregation candidate))))
      (is (seq (get-in candidate [:definition :stages 0 :filters])))
      (is (nil? (:temporal-breakout candidate))))))

(deftest candidate-metrics-aggregate-curation-and-use-best-source-for-naming-test
  (mt/with-temp [:model/Collection {official-collection-id :id} {:authority_level "official"}
                 :model/Card {official-id :id} {:name "Official metric name"
                                                :description "Official metric description"
                                                :type :question
                                                :dataset_query (orders-filtered-metric-query)
                                                :collection_id official-collection-id
                                                :view_count 100}
                 :model/Card {verified-id :id} {:name "Verified metric name"
                                                :description "Verified metric description"
                                                :type :model
                                                :dataset_query (orders-filtered-metric-query)
                                                :view_count 0}]
    (moderation/create-review! {:moderated_item_id   verified-id
                                :moderated_item_type "card"
                                :moderator_id        (mt/user->id :crowberto)
                                :status              "verified"})
    (let [candidate (first (insights/candidate-metrics
                            {:query-source (selected-cards-source official-id verified-id)
                             :min-view-count 10
                             :limit 1000}))]
      (is (= "Verified metric name" (:suggested-name candidate)))
      (is (= "Verified metric description" (:suggested-description candidate)))
      (is (= {:distinct-source-count 2
              :verified-source-count 1
              :official-source-count 1
              :popular-source-count 1
              :total-view-count 100}
             (dissoc (:evidence candidate) :source-items))))))

(deftest candidate-metrics-keep-direct-joins-and-report-all-required-tables-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Joined revenue"
                                            :type :question
                                            :dataset_query (orders-joined-query)
                                            :view_count 0}]
    (let [candidate (first (insights/candidate-metrics
                            {:query-source (selected-cards-source card-id), :limit 1000}))]
      (is (= #{(mt/id :orders) (mt/id :products)}
             (into #{} (map :id) (:required-tables candidate))))
      (is (seq (get-in candidate [:definition :stages 0 :joins])))
      (is (true? (get-in candidate [:evidence :source-items 0 :joined?]))))))

(deftest candidate-metrics-report-implicitly-joined-required-tables-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Implicitly joined revenue"
                                            :type :question
                                            :dataset_query (orders-implicit-join-metric-query)
                                            :view_count 0}]
    (let [candidate (first (insights/candidate-metrics
                            {:query-source (selected-cards-source card-id), :limit 1000}))]
      (is (= #{(mt/id :orders) (mt/id :products)}
             (into #{} (map :id) (:required-tables candidate))))
      (is (true? (get-in candidate [:evidence :source-items 0 :joined?]))))))

(deftest candidate-metrics-keep-direct-expressions-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Adjusted revenue"
                                            :type :question
                                            :dataset_query (orders-expression-metric-query)
                                            :view_count 0}]
    (let [candidate (first (insights/candidate-metrics
                            {:query-source (selected-cards-source card-id), :limit 1000}))]
      (is (some? candidate))
      (is (seq (get-in candidate [:definition :stages 0 :expressions])))
      (is (= [(mt/id :orders)] (mapv :id (:required-tables candidate)))))))

(deftest candidate-metrics-exclude-measure-shaped-queries-test
  (mt/with-temp [:model/Card {sum-id :id} {:name "Plain sum"
                                           :type :question
                                           :dataset_query (orders-measure-query)
                                           :view_count 0}
                 :model/Card {count-id :id} {:name "Plain count"
                                             :type :question
                                             :dataset_query (orders-count-query)
                                             :view_count 0}
                 :model/Card {breakout-id :id} {:name "Plain sum by month"
                                                :type :question
                                                :dataset_query (orders-breakout-only-query)
                                                :view_count 0}]
    (is (empty? (insights/candidate-metrics
                 {:query-source (selected-cards-source sum-id count-id breakout-id), :limit 1000})))))

(deftest candidate-metrics-rewrite-transparent-card-lineage-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {base-model-id :id} {:name "metric base model"
                                                    :type :model
                                                    :dataset_query (lib/with-fields
                                                                     (orders-base-query)
                                                                     [product-id subtotal])
                                                    :view_count 0}
                   :model/Card {outer-card-id :id} {:name "metric projection question"
                                                    :type :question
                                                    :dataset_query (model-source-query base-model-id)
                                                    :view_count 0}
                   :model/Card {card-id :id} {:name "metric from transparent cards"
                                              :type :question
                                              :dataset_query (-> (model-source-query outer-card-id)
                                                                 (lib/filter (lib/= product-id 987654))
                                                                 (lib/aggregate (lib/sum subtotal)))
                                              :view_count 0}]
      (let [candidate (first (insights/candidate-metrics
                              {:query-source (selected-cards-source card-id), :limit 1000}))]
        (is (= (mt/id :orders) (get-in candidate [:definition :stages 0 :source-table])))
        (is (nil? (get-in candidate [:definition :stages 0 :source-card])))
        (is (= [{:id base-model-id, :name "metric base model"}
                {:id outer-card-id, :name "metric projection question"}]
               (get-in candidate [:evidence :source-items 0 :model-lineage])))))))

(deftest candidate-metrics-exclude-opaque-card-lineage-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {model-id :id} {:name "metric opaque model"
                                               :type :model
                                               :dataset_query (lib/filter (orders-base-query)
                                                                          (lib/= product-id 1))
                                               :view_count 0}
                   :model/Card {card-id :id} {:name "metric from opaque model"
                                              :type :question
                                              :dataset_query (-> (model-source-query model-id)
                                                                 (lib/filter (lib/= product-id 2))
                                                                 (lib/aggregate (lib/sum subtotal)))
                                              :view_count 0}]
      (is (empty? (insights/candidate-metrics
                   {:query-source (selected-cards-source card-id), :limit 1000}))))))

(deftest candidate-metrics-protect-against-card-lineage-cycles-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {card-a-id :id} {:name "metric cycle A"
                                                :type :question
                                                :dataset_query (orders-filtered-metric-query)
                                                :view_count 0}
                   :model/Card {card-b-id :id} {:name "metric cycle B"
                                                :type :model
                                                :dataset_query (model-source-query card-a-id)
                                                :view_count 0}]
      (t2/update! :model/Card card-a-id
                  {:dataset_query (-> (model-source-query card-b-id)
                                      (lib/filter (lib/= product-id 1))
                                      (lib/aggregate (lib/sum subtotal)))})
      (is (empty? (insights/candidate-metrics
                   {:query-source (selected-cards-source card-a-id), :limit 1000}))))))

(deftest candidate-metrics-exclude-unsupported-query-shapes-test
  (let [native-query  (lib/native-query (lib-be/application-database-metadata-provider (mt/id)) "select 1")
        pivot-query   (orders-temporal-metric-query)
        breakout-uuid (get-in pivot-query [:stages 0 :breakout 0 1 :lib/uuid])]
    (mt/with-temp [:model/Card {native-id :id} {:name "native metric source"
                                                :type :question
                                                :dataset_query native-query
                                                :view_count 0}
                   :model/Card {multi-stage-id :id} {:name "multi-stage metric source"
                                                     :type :question
                                                     :dataset_query (orders-multi-stage-query)
                                                     :view_count 0}
                   :model/Card {multi-aggregation-id :id} {:name "multi-aggregation metric source"
                                                           :type :question
                                                           :dataset_query (orders-conditional-measure-query)
                                                           :view_count 0}
                   :model/Card {limited-id :id} {:name "limited metric source"
                                                 :type :question
                                                 :dataset_query (lib/limit (orders-filtered-metric-query) 10)
                                                 :view_count 0}
                   :model/Card {paginated-id :id} {:name "paginated metric source"
                                                   :type :question
                                                   :dataset_query (assoc-in (orders-filtered-metric-query)
                                                                            [:stages 0 :page]
                                                                            {:page 1, :items 10})
                                                   :view_count 0}
                   :model/Card {categorical-breakout-id :id} {:name "categorical breakout metric source"
                                                              :type :question
                                                              :dataset_query (orders-categorical-breakout-metric-query)
                                                              :view_count 0}
                   :model/Card {pivot-id :id} {:name "pivot metric source"
                                               :type :question
                                               :dataset_query (assoc-in pivot-query
                                                                        [:stages 0 :pivot]
                                                                        {:rows [breakout-uuid], :columns []})
                                               :view_count 0}
                   :model/Card {malformed-id :id} {:name "malformed metric source"
                                                   :type :question
                                                   :dataset_query {}
                                                   :view_count 0}]
      (is (empty? (insights/candidate-metrics
                   {:query-source (selected-cards-source native-id
                                                         multi-stage-id
                                                         multi-aggregation-id
                                                         limited-id
                                                         paginated-id
                                                         categorical-breakout-id
                                                         pivot-id
                                                         malformed-id)
                    :limit 1000}))))))

(deftest candidate-metrics-deduplicate-existing-full-definitions-test
  (let [candidate-query (orders-filtered-metric-query 2)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate metric source"
                                              :type :question
                                              :dataset_query candidate-query
                                              :view_count 0}
                   :model/Card _existing {:name "existing different metric"
                                          :type :metric
                                          :dataset_query (orders-filtered-metric-query 1)}]
      (testing "a different filter remains a distinct Metric definition"
        (is (= 1 (count (insights/candidate-metrics
                         {:query-source (selected-cards-source card-id), :limit 1000})))))
      (mt/with-temp [:model/Card _same {:name "existing identical metric"
                                        :type :metric
                                        :dataset_query candidate-query}]
        (testing "the complete identical definition is excluded"
          (is (empty? (insights/candidate-metrics
                       {:query-source (selected-cards-source card-id), :limit 1000}))))))))

(deftest candidate-metrics-keep-different-temporal-grains-distinct-test
  (mt/with-temp [:model/Card {card-id :id} {:name "monthly candidate metric"
                                            :type :question
                                            :dataset_query (orders-temporal-metric-query :month)
                                            :view_count 0}
                 :model/Card _existing {:name "existing yearly metric"
                                        :type :metric
                                        :dataset_query (orders-temporal-metric-query :year)}]
    (is (= 1 (count (insights/candidate-metrics
                     {:query-source (selected-cards-source card-id), :limit 1000}))))))

(deftest candidate-measures-return-valid-definition-and-skip-existing-test
  (let [query (orders-measure-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining measure"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (testing "explicit nil options use defaults"
        (let [candidates (candidates-from-card
                          card-id
                          (insights/candidate-measures {:min-view-count nil :limit nil}))
              candidate  (first candidates)]
          (is (=? {:candidate-count 1
                   :aggregation {:type :sum
                                 :base-name "Sum of Subtotal"
                                 :field {:id           (mt/id :orders :subtotal)
                                         :name         "SUBTOTAL"
                                         :display-name "Subtotal"}}
                   :suggested-name "Sum of Subtotal"
                   :suggested-description "Sum of Subtotal on Orders"
                   :definition-keys #{:lib/type :database :stages}}
                  {:candidate-count (count candidates)
                   :aggregation (:aggregation candidate)
                   :suggested-name (:suggested-name candidate)
                   :suggested-description (:suggested-description candidate)
                   :definition-keys (set (keys (:definition candidate)))}))))
      (mt/with-temp [:model/Measure _measure {:name "Existing candidate mining measure"
                                              :creator_id (mt/user->id :crowberto)
                                              :definition (orders-named-measure-query)}]
        (testing "an existing Measure with a different display name suppresses the equivalent candidate"
          (is (empty? (candidates-from-card
                       card-id
                       (insights/candidate-measures {:min-view-count 10 :limit 1000})))))
        (testing "cleanup materialization retains exact matches so raw usage remains visible"
          (is (= 1
                 (count (candidates-from-card
                         card-id
                         (:measures (insights/cleanup-candidates)))))))))))

(deftest candidate-measures-omit-bare-count-test
  (mt/with-temp [:model/Card {card-id :id} {:name          "candidate mining bare count"
                                            :type          :question
                                            :dataset_query (orders-count-query)
                                            :view_count    1000000}]
    (is (empty? (candidates-from-card
                 card-id
                 (insights/candidate-measures {:min-view-count 10 :limit 1000}))))))

(deftest candidate-signatures-ignore-clause-presentation-metadata-test
  (is (= (canonical-signature [:count {:lib/uuid "generic-count"}])
         (canonical-signature [:count {:lib/uuid     "named-count"
                                       :name         "Total PV"
                                       :display-name "Total PV"}])))
  (testing "inferred physical Field metadata does not split one semantic candidate"
    (let [field-id (mt/id :orders :product_id)]
      (is (= (canonical-signature [:field {:base-type :type/Integer} field-id])
             (canonical-signature [:field {:base-type      :type/Integer
                                           :effective-type :type/Integer}
                                   field-id])
             (canonical-signature [:field {:base-type                         :type/Integer
                                           :effective-type                    :type/Integer
                                           :lib/transformation-added-base-type true}
                                   field-id])))))
  (testing "semantic physical Field options remain part of the signature"
    (let [field-id (mt/id :orders :product_id)]
      (doseq [[left right] [[{:temporal-unit :month} {:temporal-unit :year}]
                            [{:join-alias "Products"} {:join-alias "Categories"}]
                            [{:source-field 1} {:source-field 2}]
                            [{:base-type :type/Text}
                             {:base-type :type/Text, :effective-type :type/Date}]
                            [{:binning {:strategy :num-bins, :num-bins 10}}
                             {:binning {:strategy :num-bins, :num-bins 20}}]]]
        (is (not= (canonical-signature [:field left field-id])
                  (canonical-signature [:field right field-id]))))))
  (testing "map-shaped literal values retain semantically meaningful name keys"
    (is (not= (canonical-signature [:= {:lib/uuid "a"} [:field {:lib/uuid "b"} 1] {:name "A"}])
              (canonical-signature [:= {:lib/uuid "c"} [:field {:lib/uuid "d"} 1] {:name "B"}])))))

(deftest qualified-card-ids-match-default-candidate-population-test
  (is (= (set (map :id (candidate-source-cards {:min-view-count 10, :view-count-window-days 90})))
         (set (insights/qualified-card-ids 10 90)))))

(deftest qualified-card-ids-bounds-recent-view-log-scan-test
  (let [scanned-card-ids (atom ::not-called)]
    (with-redefs-fn {#'candidate-mining/recent-card-view-counts
                     (fn [card-ids _window-days]
                       (reset! scanned-card-ids card-ids)
                       {})}
      #(insights/qualified-card-ids 10 90))
    (is (set? @scanned-card-ids))))

(deftest ^:parallel candidate-id-queries-are-bounded-test
  (let [batches (atom [])
        ids     (range 450)]
    (is (= (vec ids)
           (mapcat-id-batches (fn [batch]
                                (swap! batches conj batch)
                                batch)
                              ids)))
    (is (= [200 200 50] (mapv count @batches)))))

(deftest recent-card-view-counts-queries-bounded-id-batches-test
  (let [batch-sizes (atom [])]
    (with-redefs-fn {#'t2/select
                     (fn [_model {:keys [where]}]
                       (let [batch (-> where last last)]
                         (swap! batch-sizes conj (count batch))
                         []))}
      #(recent-card-view-counts (set (range 450)) 90))
    (is (= [200 200 50] @batch-sizes))))

(deftest curation-queries-use-bounded-id-batches-test
  (let [ids                (set (range 450))
        moderation-batches (atom [])
        collection-batches (atom [])]
    (with-redefs-fn {#'t2/select-fn-set
                     (fn [_field _model & {:keys [moderated_item_id]}]
                       (let [batch (last moderated_item_id)]
                         (swap! moderation-batches conj (count batch))
                         (set batch)))
                     #'t2/select-pks-set
                     (fn [_model & {:keys [id]}]
                       (let [batch (last id)]
                         (swap! collection-batches conj (count batch))
                         (set batch)))}
      #(do
         (is (= ids (verified-card-ids ids)))
         (is (= ids (official-collection-ids ids)))))
    (is (= [200 200 50] @moderation-batches))
    (is (= [200 200 50] @collection-batches))))

(deftest candidate-batch-inputs-are-shared-test
  (let [source-calls  (atom 0)
        lineage-calls (atom 0)
        cards         [{:id 1, :type :question, :dataset_query {}}]]
    (with-redefs-fn {#'candidate-mining/candidate-source-cards*
                     (fn [_opts]
                       (swap! source-calls inc)
                       cards)
                     #'candidate-mining/candidate-lineage-index
                     (fn [_cards _allowed-types]
                       (swap! lineage-calls inc)
                       {10 {:id 10, :type :model}
                        20 {:id 20, :type :question}})}
      #(insights/with-candidate-batch-cache
         (fn []
           (is (= cards (candidate-source-cards {:min-view-count 10})))
           (is (= cards (candidate-source-cards {:min-view-count 10})))
           (is (= #{10} (set (keys (candidate-model-index cards)))))
           (is (= #{10 20} (set (keys (candidate-lineage-card-index cards))))))))
    (is (= 1 @source-calls))
    (is (= 1 @lineage-calls))))

(deftest candidate-measures-support-remaining-direct-aggregations-test
  (let [query (orders-extended-measures-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining extended measures"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (let [candidates (candidates-from-card
                        card-id
                        (insights/candidate-measures {:min-view-count 10 :limit 1000}))
            by-type    (into {} (map (juxt #(get-in % [:aggregation :type]) identity)) candidates)]
        (is (= #{:count :median :stddev :var :percentile} (set (keys by-type))))
        (is (= (mt/id :orders :subtotal)
               (get-in by-type [:count :aggregation :field :id])))
        (is (= 0.9
               (get-in by-type [:percentile :aggregation :percentile])))
        (is (every? #(= (mt/id :orders) (get-in % [:source :id])) candidates))))))

(deftest candidate-measures-synthesize-curated-categorical-condition-test
  (let [query (orders-conditional-measure-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining conditional measure"
                                              :type :question
                                              :dataset_query query
                                              :view_count 0}]
      (moderation/create-review! {:moderated_item_id   card-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :status              "verified"})
      (let [candidates  (candidates-from-card
                         card-id
                         (insights/candidate-measures {:min-view-count 10 :limit 1000}))
            conditional (filterv #(contains? #{:count-where :distinct-where :sum-where}
                                             (get-in % [:aggregation :type]))
                                 candidates)
            by-type     (into {} (map (juxt #(get-in % [:aggregation :type]) identity)) conditional)]
        (is (=? {:types #{:count-where :distinct-where :sum-where}
                 :contains-bare-count? false
                 :conditions #{{:atom-count 1
                                :field-ids [(mt/id :orders :product_id)]
                                :operator :=
                                :verified-source-count 1}}
                 :names {:count-where "Count where Product ID is 987654"
                         :distinct-where "Distinct values of User ID where Product ID is 987654"
                         :sum-where "Sum of Subtotal where Product ID is 987654"}
                 :sum-description "Sum of Subtotal where Product ID is 987654 on Orders"}
                {:types (set (keys by-type))
                 :contains-bare-count? (boolean
                                        (some #(and (= :count (get-in % [:aggregation :type]))
                                                    (nil? (get-in % [:aggregation :field])))
                                              candidates))
                 :conditions (into #{}
                                   (map (fn [candidate]
                                          {:atom-count (get-in candidate [:aggregation :condition-atom-count])
                                           :field-ids (mapv :id (get-in candidate [:aggregation :condition-fields]))
                                           :operator (first (get-in candidate [:aggregation :condition]))
                                           :verified-source-count (get-in candidate [:evidence :verified-source-count])}))
                                   conditional)
                 :names (update-vals by-type :suggested-name)
                 :sum-description (get-in by-type [:sum-where :suggested-description])}))))))

(deftest candidate-measures-drop-one-off-popular-conditions-test
  (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining one-off condition"
                                            :type :question
                                            :dataset_query (orders-conditional-measure-query)
                                            :view_count 1000000}]
    (let [candidates (candidates-from-card
                      card-id
                      (insights/candidate-measures {:min-view-count 10 :limit 1000}))]
      (is (not-any? #(contains? #{:count-where :distinct-where :sum-where}
                                (get-in % [:aggregation :type]))
                    candidates)))))

(deftest candidate-measures-and-segments-resolve-transparent-model-lineage-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {base-model-id :id} {:name "candidate mining base model"
                                                    :type :model
                                                    :dataset_query (lib/with-fields
                                                                     (orders-base-query)
                                                                     [product-id subtotal])
                                                    :view_count 0}
                   :model/Card {outer-model-id :id} {:name "candidate mining outer model"
                                                     :type :model
                                                     :dataset_query (model-source-query base-model-id)
                                                     :view_count 0}
                   :model/Card {card-id :id} {:name "candidate mining model-backed question"
                                              :type :question
                                              :dataset_query (-> (model-source-query outer-model-id)
                                                                 (lib/filter (lib/= product-id 987654))
                                                                 (lib/aggregate (lib/sum subtotal)))
                                              :view_count 1000000}]
      (let [measure    (->> (insights/candidate-measures {:min-view-count 10 :limit 1000})
                            (candidates-from-card card-id)
                            (filter #(= :sum (get-in % [:aggregation :type])))
                            first)
            segment    (->> (insights/candidate-segments {:min-view-count 10 :limit 1000})
                            (candidates-from-card card-id)
                            first)
            lineage    [{:id base-model-id :name "candidate mining base model"}
                        {:id outer-model-id :name "candidate mining outer model"}]]
        (is (= (mt/id :orders) (get-in measure [:source :id])))
        (is (= lineage (get-in measure [:evidence :source-items 0 :model-lineage])))
        (is (= (mt/id :orders) (get-in segment [:source :id])))
        (is (= lineage (get-in segment [:evidence :source-items 0 :model-lineage])))))))

(deftest candidate-mining-supports-multi-stage-physical-lineage-test
  (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining multi-stage question"
                                            :type :question
                                            :dataset_query (orders-multi-stage-query)
                                            :view_count 1000000}]
    (let [measures (->> (insights/candidate-measures {:min-view-count 10 :limit 1000})
                        (candidates-from-card card-id))
          segments (->> (insights/candidate-segments {:min-view-count 10 :limit 1000})
                        (candidates-from-card card-id))
          measure  (first measures)
          segment  (first segments)
          field-id (fn [clause]
                     (->> clause
                          (tree-seq sequential? seq)
                          (filter #(and (vector? %) (= :field (first %))))
                          first
                          (#(nth % 2))))]
      (is (=? {:measure-count 1
               :segment-count 1
               :measure {:type :sum
                         :field-id (mt/id :orders :subtotal)
                         :stage-numbers [1]}
               :segment {:field-id (mt/id :orders :product_id)
                         :stage-numbers [1]
                         :joined? false}}
              {:measure-count (count measures)
               :segment-count (count segments)
               :measure {:type (get-in measure [:aggregation :type])
                         :field-id (field-id (get-in measure [:definition :stages 0 :aggregation 0]))
                         :stage-numbers (get-in measure [:evidence :source-items 0 :stage-numbers])}
               :segment {:field-id (field-id (:predicate segment))
                         :stage-numbers (get-in segment [:evidence :source-items 0 :stage-numbers])
                         :joined? (get-in segment [:evidence :source-items 0 :joined?])}})))))

(deftest candidate-mining-inspects-stage-zero-before-a-semantic-barrier-test
  (let [query (-> (orders-conditional-measure-query)
                  lib/append-stage)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining stage zero question"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (let [measures (candidates-from-card
                      card-id
                      (insights/candidate-measures {:min-view-count 10 :limit 1000}))
            segments (candidates-from-card
                      card-id
                      (insights/candidate-segments {:min-view-count 10 :limit 1000}))]
        (is (= #{:distinct :sum}
               (into #{} (map #(get-in % [:aggregation :type])) measures)))
        (is (= 1 (count segments)))
        (is (every? #(= [0] (:stage-numbers %))
                    (concat (mapcat #(get-in % [:evidence :source-items]) measures)
                            (get-in (first segments) [:evidence :source-items]))))))))

(deftest candidate-segments-support-single-owner-join-filters-test
  (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining joined question"
                                            :type :question
                                            :dataset_query (orders-joined-query)
                                            :view_count 1000000}]
    (let [segments (candidates-from-card
                    card-id
                    (insights/candidate-segments {:min-view-count 10 :limit 1000}))
          measures (candidates-from-card
                    card-id
                    (insights/candidate-measures {:min-view-count 10 :limit 1000}))
          by-table (group-by #(get-in % [:source :id]) segments)]
      (testing "single-owner filters become Segments on their actual physical owner"
        (is (=? {:segment-count 2
                 :table-ids #{(mt/id :orders) (mt/id :products)}
                 :field-ids-by-table {(mt/id :orders) #{(mt/id :orders :subtotal)}
                                      (mt/id :products) #{(mt/id :products :category)}}
                 :product-join-alias nil
                 :evidence #{{:joined? true, :stage-numbers [0]}}}
                {:segment-count (count segments)
                 :table-ids (set (keys by-table))
                 :field-ids-by-table (update-vals by-table
                                                  #(into #{} (map :id) (:fields (first %))))
                 :product-join-alias (get-in (first (by-table (mt/id :products)))
                                             [:predicate 2 1 :join-alias])
                 :evidence (into #{}
                                 (map (fn [candidate]
                                        {:joined? (get-in candidate [:evidence :source-items 0 :joined?])
                                         :stage-numbers (get-in candidate [:evidence :source-items 0 :stage-numbers])}))
                                 segments)})))
      (testing "aggregations from a joined stage remain excluded"
        (is (empty? measures))))))

(deftest candidate-mining-rejects-semantic-model-transformations-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {model-id :id} {:name "candidate mining filtered model"
                                               :type :model
                                               :dataset_query (lib/filter
                                                               (orders-base-query)
                                                               (lib/= product-id 987654))
                                               :view_count 0}
                   :model/Card {card-id :id} {:name "candidate mining unsafe model question"
                                              :type :question
                                              :dataset_query (lib/aggregate
                                                              (model-source-query model-id)
                                                              (lib/sum subtotal))
                                              :view_count 1000000}]
      (is (empty? (candidates-from-card
                   card-id
                   (insights/candidate-measures {:min-view-count 10 :limit 1000}))))
      (is (empty? (candidates-from-card
                   card-id
                   (insights/candidate-segments {:min-view-count 10 :limit 1000})))))))

(deftest candidate-segments-keep-atoms-when-composite-exists-test
  (let [query (orders-segment-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining segment"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (moderation/create-review! {:moderated_item_id   card-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :status              "verified"})
      (testing "a verified two-atom source produces two atomic candidates and its conjunction"
        (let [candidates (candidates-from-card
                          card-id
                          (insights/candidate-segments {:min-view-count 10 :limit 1000}))
              atomic     (remove :composite? candidates)
              composite  (first (filter :composite? candidates))
              filters    (lib/filters (:definition composite) 0)]
          (is (=? {:candidate-count 3
                   :atomic-count 2
                   :atomic-atom-counts #{1}
                   :composite-atom-count 2
                   :definition-filter-count 2
                   :definition-has-and? false
                   :atomic-names #{"Product ID is 987654"
                                   "Subtotal is greater than 12345"}
                   :composite-name "Product ID is 987654 and Subtotal is greater than 12345"
                   :composite-description "Filtered by Product ID is 987654 and Subtotal is greater than 12345 on Orders"}
                  {:candidate-count (count candidates)
                   :atomic-count (count atomic)
                   :atomic-atom-counts (into #{} (map :atom-count) atomic)
                   :composite-atom-count (:atom-count composite)
                   :definition-filter-count (count filters)
                   :definition-has-and? (boolean (some #(lib/clause-of-type? % :and) filters))
                   :atomic-names (into #{} (map :suggested-name) atomic)
                   :composite-name (:suggested-name composite)
                   :composite-description (:suggested-description composite)}))))
      (mt/with-temp [:model/Segment _segment {:name "Existing candidate mining segment"
                                              :creator_id (mt/user->id :crowberto)
                                              :definition query}]
        (testing "the saved conjunction is excluded without suppressing either atom"
          (let [expected-signature (segment-signature (mt/id :orders) (lib/atomic-filters query 0))
                existing           (existing-segment-signatures #{(mt/id :orders)})
                candidates         (candidates-from-card
                                    card-id
                                    (insights/candidate-segments {:min-view-count 10 :limit 1000}))]
            (is (contains? existing expected-signature)
                (str "Expected " expected-signature " among existing signatures " existing))
            (is (=? {:candidate-count 2, :composite-count 0}
                    {:candidate-count (count candidates)
                     :composite-count (count (filter :composite? candidates))}))))))))

(deftest candidate-suggestions-expand-short-multi-value-filters-test
  (let [mp        (lib-be/application-database-metadata-provider (mt/id))
        products  (lib.metadata/table mp (mt/id :products))
        category  (lib.metadata/field mp (mt/id :products :category))
        predicate (lib/in category "Gadget" "Widget")
        definition (lib/query mp products)
        base-candidate {:source {:name "Products"}
                        :metabase.usage-metadata.candidate-suggestions/metadata-provider mp}]
    (testing "segment names include the selected values"
      (is (=? {:suggested-name "Category is one of Gadget or Widget"
               :suggested-description "Filtered by Category is one of Gadget or Widget on Products"
               :atoms [{:display-name "Category is one of Gadget or Widget"
                        :kind :category}]}
              (-> (assoc base-candidate
                         :definition (lib/filter definition predicate)
                         :predicate predicate)
                  add-segment-suggestions))))
    (testing "conditional measure names include the selected values"
      (let [measure-predicate (lib/in category "Gadget" "Widget")]
        (is (=? {:suggested-name "Count where Category is one of Gadget or Widget"
                 :aggregation {:base-name "Count"
                               :condition-atoms [{:display-name "Category is one of Gadget or Widget"
                                                  :kind :category}]}}
                (-> (assoc base-candidate
                           :definition (lib/aggregate definition (lib/count-where measure-predicate))
                           :aggregation {:type :count-where
                                         :condition measure-predicate})
                    add-measure-suggestions)))))))

(deftest predicate-kind-follows-field-metadata-test
  (are [expected column] (= expected (column-predicate-kind column))
    :boolean  {:base-type :type/Boolean}
    :temporal {:base-type :type/DateTime}
    :category {:base-type :type/Text}
    :category {:base-type :type/Integer, :semantic-type :type/Category}
    :category {:base-type :type/Integer, :semantic-type :type/PK}
    :number   {:base-type :type/Float}
    :other    {:base-type :type/*}))

(deftest candidate-suggestions-are-bounded-and-fall-back-safely-test
  (let [candidate {:definition {}
                   :predicate [:unknown {}]
                   :source {:name "Orders"}}]
    (testing "long names are capped at the app-db name limit without shortening the description"
      (let [long-name (apply str (repeat 300 "x"))]
        (with-redefs [lib/display-name (fn [& _] long-name)
                      lib/describe-top-level-key (fn [& _] long-name)]
          (let [suggested (add-segment-suggestions candidate)]
            (is (= 254 (count (:suggested-name suggested))))
            (is (str/ends-with? (:suggested-name suggested) "..."))
            (is (= (str long-name " on Orders") (:suggested-description suggested)))))))
    (testing "display-name failures do not abort candidate mining"
      (with-redefs [lib/display-name (fn [& _] (throw (ex-info "boom" {})))
                    lib/describe-top-level-key (fn [& _] (throw (ex-info "boom" {})))]
        (is (= {:suggested-name "Segment"
                :suggested-description "Filtered by Segment on Orders"}
               (select-keys (add-segment-suggestions candidate)
                            [:suggested-name :suggested-description])))))
    (testing "Errors and thread interruption are not swallowed"
      (with-redefs [lib/display-name (fn [& _] (throw (AssertionError. "boom")))]
        (is (thrown? AssertionError (add-segment-suggestions candidate))))
      (try
        (with-redefs [lib/display-name (fn [& _] (throw (InterruptedException. "stop")))]
          (let [rethrown?    (try
                               (add-segment-suggestions candidate)
                               false
                               (catch InterruptedException _
                                 true))
                interrupted? (Thread/interrupted)]
            (is rethrown?)
            (is interrupted?)))
        (finally
          (Thread/interrupted))))))

(deftest candidate-segments-mine-recurring-filter-subsets-test
  (let [query-a (orders-three-atom-segment-query 111)
        query-b (orders-three-atom-segment-query 222)]
    (mt/with-temp [:model/Card {card-a-id :id} {:name "candidate mining recurring segment A"
                                                :type :question
                                                :dataset_query query-a
                                                :view_count 1000000}
                   :model/Card {card-b-id :id} {:name "candidate mining recurring segment B"
                                                :type :model
                                                :dataset_query query-b
                                                :view_count 1000000}]
      (let [candidates (candidates-from-card
                        card-a-id
                        (insights/candidate-segments {:min-view-count 1000000 :limit 1000}))
            composites (filterv :composite? candidates)]
        (testing "only the shared two-atom subset survives; one-off subsets from the popular source do not"
          (is (= 1 (count composites)))
          (is (= 2 (:atom-count (first composites))))
          (is (= 2 (get-in (first composites) [:evidence :distinct-source-count])))
          (is (= #{card-a-id card-b-id}
                 (into #{} (map :id) (get-in (first composites) [:evidence :source-items])))))))))

(deftest malformed-existing-candidate-definitions-are-ignored-test
  (testing "a malformed Measure does not abort candidate mining"
    (with-redefs [t2/select (fn [& _]
                              [{:table_id (mt/id :orders)
                                :definition {:not :a-query}}])]
      (is (= #{} (existing-measure-signatures #{(mt/id :orders)})))))
  (testing "a malformed Segment does not abort candidate mining"
    (with-redefs [t2/select (fn [& _]
                              [{:table_id (mt/id :orders)
                                :definition {:not :a-query}}])]
      (is (= #{} (existing-segment-signatures #{(mt/id :orders)}))))))
