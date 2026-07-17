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
   [metabase.usage-metadata.extract :as usage-metadata.extract]
   [metabase.usage-metadata.insights :as insights]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private mine-itemsets               @#'insights/mine-itemsets)
(def ^:private closed-only                 @#'insights/closed-only)
(def ^:private itemset-support             @#'insights/itemset-support)
(def ^:private any-atom-support            @#'insights/any-atom-support)
(def ^:private rebuild-and-clause          @#'insights/rebuild-and-clause)
(def ^:private relative-support-ok?        @#'insights/relative-support-ok?)
(def ^:private existing-composite-atomsets @#'insights/existing-composite-atomsets)
(def ^:private composite-atomsets-memo     @#'insights/existing-composite-atomsets*-memo)
(def ^:private candidate-source-cards      @#'insights/candidate-source-cards)
(def ^:private existing-measure-signatures @#'insights/existing-measure-signatures)
(def ^:private existing-segment-signatures @#'insights/existing-segment-signatures)
(def ^:private segment-signature           @#'insights/segment-signature)
(def ^:private add-segment-suggestions     @#'insights/add-segment-suggestions)

(deftest ^:parallel itemset-support-counts-containing-baskets-weighted-by-count-test
  (let [baskets [{:atoms #{:a :b :c} :count 3}
                 {:atoms #{:a :b}     :count 2}
                 {:atoms #{:a :c}     :count 1}
                 {:atoms #{:b}        :count 4}]]
    (testing "support = sum of basket counts for baskets containing ALL atoms in the itemset"
      (is (= 5 (itemset-support baskets #{:a :b})))
      (is (= 4 (itemset-support baskets #{:a :c})))
      (is (= 3 (itemset-support baskets #{:a :b :c})))
      (is (= 0 (itemset-support baskets #{:z}))))
    (testing "any-atom-support = sum of basket counts for baskets containing ANY atom in the itemset"
      (is (= 10 (any-atom-support baskets #{:a :b})))
      (is (= 6  (any-atom-support baskets #{:a}))))
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

(deftest existing-segment-predicates-cached-test
  (testing "existing-segment-predicates is TTL-memoized — repeated calls with the same opts hit the DB once"
    (let [segment-selects (atom 0)
          real-select     t2/select
          existing-fn     @#'insights/existing-segment-predicates
          memo-var        @#'insights/existing-segment-predicates*-memo]
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
          existing-fn  @#'insights/existing-metric-signatures
          memo-var     @#'insights/existing-metric-signatures*-memo]
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

(defn- candidates-from-card
  [card-id candidates]
  (filterv (fn [candidate]
             (some #(= card-id (:id %)) (get-in candidate [:evidence :source-items])))
           candidates))

(deftest candidate-source-cards-use-curation-or-popularity-test
  (let [query (orders-base-query)]
    (mt/with-temp [:model/Collection {official-collection-id :id} {:authority_level "official"}
                   :model/Card {plain-id :id} {:name "candidate mining plain"
                                               :type :question
                                               :dataset_query query
                                               :view_count 9}
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
                                                 :view_count 10}]
      (moderation/create-review! {:moderated_item_id   verified-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :status              "verified"})
      (let [cards (candidate-source-cards {:min-view-count 10})
            by-id (into {} (map (juxt :id identity)) cards)]
        (is (not (contains? by-id plain-id)))
        (is (true? (:official-collection? (by-id official-id))))
        (is (= :model (:type (by-id official-id))))
        (is (true? (:verified? (by-id verified-id))))
        (is (true? (:popular? (by-id popular-id))))))))

(deftest candidate-measures-return-valid-definition-and-skip-existing-test
  (let [query (orders-measure-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining measure"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (testing "explicit nil options use defaults"
        (let [candidates (candidates-from-card
                          card-id
                          (insights/candidate-measures {:min-view-count nil :limit nil}))]
          (is (= 1 (count candidates)))
          (is (= {:type :sum
                  :field {:id           (mt/id :orders :subtotal)
                          :name         "SUBTOTAL"
                          :display-name "Subtotal"}}
                 (:aggregation (first candidates))))
          (is (= "Sum of Subtotal" (:suggested-name (first candidates))))
          (is (= "Sum of Subtotal on Orders" (:suggested-description (first candidates))))
          (is (= #{:lib/type :database :stages}
                 (set (keys (:definition (first candidates))))))))
      (mt/with-temp [:model/Measure _measure {:name "Existing candidate mining measure"
                                              :creator_id (mt/user->id :crowberto)
                                              :definition query}]
        (testing "an exact existing Measure suppresses the candidate"
          (is (empty? (candidates-from-card
                       card-id
                       (insights/candidate-measures {:min-view-count 10 :limit 1000})))))))))

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
        (is (= #{:count-where :distinct-where :sum-where}
               (into #{} (map #(get-in % [:aggregation :type])) conditional)))
        (is (every? #(= 1 (get-in % [:aggregation :condition-atom-count])) conditional))
        (is (every? #(= [(mt/id :orders :product_id)]
                        (mapv :id (get-in % [:aggregation :condition-fields])))
                    conditional))
        (is (every? #(lib/clause-of-type?
                      (get-in % [:aggregation :condition])
                      :=)
                    conditional))
        (is (= "Count where Product ID is 987654"
               (get-in by-type [:count-where :suggested-name])))
        (is (= "Distinct values of User ID where Product ID is 987654"
               (get-in by-type [:distinct-where :suggested-name])))
        (is (= "Sum of Subtotal where Product ID is 987654"
               (get-in by-type [:sum-where :suggested-name])))
        (is (= "Sum of Subtotal where Product ID is 987654 on Orders"
               (get-in by-type [:sum-where :suggested-description])))
        (is (every? #(= 1 (get-in % [:evidence :verified-source-count])) conditional))))))

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
    (let [measure  (->> (insights/candidate-measures {:min-view-count 10 :limit 1000})
                        (candidates-from-card card-id)
                        first)
          segment  (->> (insights/candidate-segments {:min-view-count 10 :limit 1000})
                        (candidates-from-card card-id)
                        first)
          field-id (fn [clause]
                     (->> clause
                          (tree-seq sequential? seq)
                          (filter #(and (vector? %) (= :field (first %))))
                          first
                          (#(nth % 2))))]
      (is (= :sum (get-in measure [:aggregation :type])))
      (is (= (mt/id :orders :subtotal)
             (field-id (get-in measure [:definition :stages 0 :aggregation 0]))))
      (is (= (mt/id :orders :product_id)
             (field-id (:predicate segment))))
      (is (= [1] (get-in measure [:evidence :source-items 0 :stage-numbers])))
      (is (= [1] (get-in segment [:evidence :source-items 0 :stage-numbers])))
      (is (false? (get-in segment [:evidence :source-items 0 :joined?]))))))

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
        (is (seq measures))
        (is (seq segments))
        (is (every? #(= [0] (:stage-numbers %))
                    (concat (get-in (first measures) [:evidence :source-items])
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
        (is (= 2 (count segments))
            "the cross-table filter is not representable as a table-bound Segment")
        (is (= #{(mt/id :orders) (mt/id :products)} (set (keys by-table))))
        (is (= #{(mt/id :orders :subtotal)}
               (into #{} (map :id) (:fields (first (by-table (mt/id :orders)))))))
        (is (= #{(mt/id :products :category)}
               (into #{} (map :id) (:fields (first (by-table (mt/id :products)))))))
        (is (nil? (get-in (first (by-table (mt/id :products)))
                          [:predicate 2 1 :join-alias])))
        (is (every? #(true? (get-in % [:evidence :source-items 0 :joined?])) segments))
        (is (every? #(= [0] (get-in % [:evidence :source-items 0 :stage-numbers])) segments)))
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
                          (insights/candidate-segments {:min-view-count 10 :limit 1000}))]
          (is (= 3 (count candidates)))
          (is (= 2 (count (remove :composite? candidates))))
          (is (every? #(= 1 (:atom-count %)) (remove :composite? candidates)))
          (is (= [2] (mapv :atom-count (filter :composite? candidates))))
          (is (= #{"Product ID is 987654"
                   "Subtotal is greater than 12345"}
                 (into #{} (map :suggested-name) (remove :composite? candidates))))
          (is (= "Product ID is 987654 and Subtotal is greater than 12345"
                 (:suggested-name (first (filter :composite? candidates)))))
          (is (= "Filtered by Product ID is 987654 and Subtotal is greater than 12345 on Orders"
                 (:suggested-description (first (filter :composite? candidates)))))))
      (mt/with-temp [:model/Segment _segment {:name "Existing candidate mining segment"
                                              :creator_id (mt/user->id :crowberto)
                                              :definition query}]
        (testing "the saved conjunction is excluded without suppressing either atom"
          (let [expected-signature (segment-signature (mt/id :orders) (lib/atomic-filters query 0))
                existing           (existing-segment-signatures)
                candidates         (candidates-from-card
                                    card-id
                                    (insights/candidate-segments {:min-view-count 10 :limit 1000}))]
            (is (contains? existing expected-signature)
                (str "Expected " expected-signature " among existing signatures " existing))
            (is (= 2 (count candidates)))
            (is (every? (complement :composite?) candidates))))))))

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
                            [:suggested-name :suggested-description])))))))

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
      (is (= #{} (existing-measure-signatures)))))
  (testing "a malformed Segment does not abort candidate mining"
    (with-redefs [t2/select (fn [& _]
                              [{:table_id (mt/id :orders)
                                :definition {:not :a-query}}])]
      (is (= #{} (existing-segment-signatures))))))
