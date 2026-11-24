(ns metabase.usage-metadata.insights-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
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

(deftest existing-segment-predicates-follow-new-segment-test
  (testing "a Segment saved right before the call is among the existing predicates"
    (let [existing-fn @#'insights/existing-segment-predicates
          mp          (lib-be/application-database-metadata-provider (mt/id))
          query       (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                          (lib/filter (lib/= (lib.metadata/field mp (mt/id :orders :tax)) 1234567)))
          before      (existing-fn {})]
      (mt/with-temp [:model/Segment _ {:table_id (mt/id :orders) :definition query}]
        (is (seq (remove before (existing-fn {}))))))))

(deftest existing-metric-signatures-follow-new-metric-test
  (testing "a metric Card saved right before the call is among the existing signatures"
    (let [existing-fn @#'insights/existing-metric-signatures
          mp          (lib-be/application-database-metadata-provider (mt/id))
          query       (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                          (lib/aggregate (lib/max (lib.metadata/field mp (mt/id :orders :tax)))))
          before      (existing-fn)]
      (mt/with-temp [:model/Card _ {:type :metric :dataset_query query}]
        (is (seq (remove before (existing-fn))))))))

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
        (cleanup-composite-rows!)))))

(deftest suggested-segments-for-owner-skips-saved-segment-match-test
  (cleanup-composite-rows!)
  (let [fact (composite-fact-for-orders)
        opts (composite-opts (mt/id :orders))]
    (try
      (seed-composite-row! fact 3)
      (testing "precondition: candidate is present without a saved Segment"
        (is (seq (insights/suggested-segments-for-owner opts))))
      (mt/with-temp [:model/Segment _seg {:definition (composite-orders-query)}]
        (let [results (insights/suggested-segments-for-owner opts)]
          (testing "candidate is filtered out when a saved Segment has the same atom-set"
            (is (not-any? (fn [{:keys [source itemset-size]}]
                            (and (= :table (:type source))
                                 (= (mt/id :orders) (:id source))
                                 (= (:atom-count fact) itemset-size)))
                          results)))))
      (finally
        (cleanup-composite-rows!)))))

(deftest suggested-segments-for-owner-statement-count-test
  (testing "suggestions for several sources read the saved Segments once"
    (let [table-ids (mapv mt/id [:orders :venues :checkins :users :products :people])
          fact      (composite-fact-for-orders)
          opts      {:bucket-start composite-test-bucket-date
                     :bucket-end   composite-test-bucket-date}
          counted   (fn [n]
                      (cleanup-composite-rows!)
                      (doseq [table-id (take n table-ids)]
                        (seed-composite-row! (assoc fact :source-id table-id) 3))
                      (t2/with-call-count [call-count]
                        (is (seq (insights/suggested-segments-for-owner opts)))
                        (call-count)))]
      (try
        (counted 1)
        (is (= (counted 2) (counted 6)))
        (finally
          (cleanup-composite-rows!))))))

(deftest suggested-segments-for-owner-empty-when-no-rows-test
  (cleanup-composite-rows!)
  (try
    (is (= [] (insights/suggested-segments-for-owner
               (composite-opts (mt/id :orders)))))
    (finally)))
