(ns metabase.usage-metadata.insights-test
  (:require
   [clojure.core.memoize :as memoize]
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

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users-personal-collections))

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

(defn- clear-existing-segment-cache! []
  (memoize/memo-clear! @#'insights/existing-segment-facts*-memo))

(defn- clear-existing-metric-signature-cache! []
  (memoize/memo-clear! @#'insights/existing-metric-signatures*-memo))

(deftest suggested-segments-for-owner-happy-path-test
  (cleanup-composite-rows!)
  (clear-existing-segment-cache!)
  (let [fact (composite-fact-for-orders)
        opts (composite-opts (mt/id :orders))]
    (try
      (seed-composite-row! fact 3)
      (let [results (insights/suggested-segments-for-owner opts)]
        (testing "one composite basket surfaces exactly one candidate with its support and source"
          (is (=? [{:itemset-size (:atom-count fact)
                    :support 3
                    :support-ratio 1.0
                    :source {:type :table, :id (mt/id :orders)}}]
                  results)))
        (testing "the candidate's clause is a valid :and MBQL clause"
          (is (lib/clause-of-type? (:clause (first results)) :and))))
      (finally
        (cleanup-composite-rows!)
        (clear-existing-segment-cache!)))))

(deftest suggested-segments-for-owner-skips-saved-segment-match-test
  (cleanup-composite-rows!)
  (clear-existing-segment-cache!)
  (let [fact (composite-fact-for-orders)
        opts (composite-opts (mt/id :orders))]
    (try
      (seed-composite-row! fact 3)
      (testing "precondition: candidate is present without a saved Segment"
        (is (seq (insights/suggested-segments-for-owner opts))))
      (clear-existing-segment-cache!)
      (mt/with-temp [:model/Segment _seg {:table_id   (mt/id :orders)
                                          :definition (composite-orders-query)}]
        (let [results (insights/suggested-segments-for-owner opts)]
          (testing "candidate is filtered out when a saved Segment has the same atom-set"
            (is (= [] results)))))
      (finally
        (cleanup-composite-rows!)
        (clear-existing-segment-cache!)))))

(deftest suggested-segments-for-owner-empty-when-no-rows-test
  (cleanup-composite-rows!)
  (clear-existing-segment-cache!)
  (try
    (is (= [] (insights/suggested-segments-for-owner
               (composite-opts (mt/id :orders)))))
    (finally
      (clear-existing-segment-cache!))))

(deftest existing-segment-facts-are-memoized-and-shared-test
  (testing "existing-segment-predicates and existing-composite-atomsets for the same key
            share one TTL-memoized Segment scan"
    (clear-existing-segment-cache!)
    (try
      (let [segment-selects     (atom 0)
            original-select     (mt/original-fn #'t2/select)
            existing-predicates (var-get #'insights/existing-segment-predicates)
            existing-composites (var-get #'insights/existing-composite-atomsets)
            opts                (composite-opts (mt/id :orders))]
        (mt/with-dynamic-fn-redefs
          [t2/select (fn [& args]
                       (when (and (sequential? (first args))
                                  (= :model/Segment (ffirst args)))
                         (swap! segment-selects inc))
                       (apply original-select args))]
          (is (set? (existing-predicates opts)))
          (is (= 1 @segment-selects) "the first call scans Segments once")
          (is (set? (existing-composites opts)))
          (is (= 1 @segment-selects)
              "the second call, for the same key, reuses the cached scan")))
      (finally
        (clear-existing-segment-cache!)))))

(deftest existing-metric-signatures-cached-test
  (testing "existing-metric-signatures is TTL-memoized — repeated calls hit the DB once"
    (clear-existing-metric-signature-cache!)
    (try
      (let [card-selects           (atom 0)
            original-select        (mt/original-fn #'t2/select)
            existing-signatures    (var-get #'insights/existing-metric-signatures)]
        (mt/with-dynamic-fn-redefs
          [t2/select (fn [& args]
                       (when (and (sequential? (first args))
                                  (= :model/Card (ffirst args)))
                         (swap! card-selects inc))
                       (apply original-select args))]
          (existing-signatures)
          (existing-signatures)
          (is (= 1 @card-selects))))
      (finally
        (clear-existing-metric-signature-cache!)))))

(deftest ^:parallel rebuild-and-clause-test
  (let [rebuild-and-clause (var-get #'insights/rebuild-and-clause)
        fp-a "[\"=\",{},[\"field\",{},1],1]"
        fp-b "[\">\",{},[\"field\",{},2],0]"]
    (testing "builds a properly-shaped :and MBQL clause from atom fingerprints"
      (is (lib/clause-of-type? (rebuild-and-clause [fp-a fp-b]) :and)))
    (testing "returns nil below the minimum itemset size"
      (is (nil? (rebuild-and-clause [])))
      (is (nil? (rebuild-and-clause [fp-a]))))
    (testing "returns nil when decode-predicate drops everything below the floor"
      (is (nil? (rebuild-and-clause [nil nil])))
      (is (nil? (rebuild-and-clause [fp-a nil]))))))
