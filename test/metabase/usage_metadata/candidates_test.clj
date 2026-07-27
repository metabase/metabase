(ns metabase.usage-metadata.candidates-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidates :as candidates]
   [metabase.usage-metadata.insights :as insights]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private relation-for-measure @#'candidates/relation-for-measure)
(def ^:private relation-for-segment @#'candidates/relation-for-segment)
(def ^:private segment-atoms @#'candidates/segment-atoms)
(def ^:private globally-eligible? @#'candidates/globally-eligible?)
(def ^:private prune-ineligible-candidates! @#'candidates/prune-ineligible-candidates!)
(def ^:private source-provenance-index @#'candidates/source-provenance-index)
(def ^:private non-closed-segment-candidate-ids
  @#'candidates/non-closed-segment-candidate-ids)

(defn- candidate-row
  [run-id table-id]
  {:run_id                 run-id
   :candidate_type         :segment
   :table_id               table-id
   :signature_version      candidates/signature-version
   :signature_hash         (apply str (repeat 64 "a"))
   :signature              "[\"segment\"]"
   :definition             {:lib/type :mbql/query}
   :semantic_details       {:atom-count 1}
   :suggested_name         "Recent orders"
   :suggested_description  "Recent orders on Orders"
   :modeling_status        :missing
   :verified_source_count  1
   :official_source_count  0
   :popular_source_count   1
   :distinct_source_count  1
   :total_view_count       10
   :complexity             1})

(deftest latest-successful-snapshot-and-durable-dismissal-test
  (mt/with-temp [:model/UsageMetadataCandidateRun old-run {:status            :succeeded
                                                           :trigger           :scheduled
                                                           :algorithm_version 1
                                                           :source_config     {}
                                                           :finished_at       (mi/now)}
                 :model/UsageMetadataCandidateRun run     {:status            :succeeded
                                                           :trigger           :manual
                                                           :algorithm_version 1
                                                           :source_config     {}
                                                           :finished_at       (mi/now)}
                 :model/UsageMetadataCandidate candidate (candidate-row (:id run) (mt/id :orders))]
    (is (= (:id run) (:id (candidates/latest-successful-run))))
    (is (candidates/candidate-current? candidate))
    (let [dismissal (candidates/dismiss! candidate (mt/user->id :crowberto) "not useful")]
      (is (= "not useful" (:reason dismissal)))
      (is (= 1 (t2/count :model/UsageMetadataCandidateDismissal
                         :candidate_type :segment
                         :table_id (mt/id :orders)
                         :signature_hash (:signature_hash candidate))))
      (candidates/restore! candidate)
      (is (zero? (t2/count :model/UsageMetadataCandidateDismissal
                           :candidate_type :segment
                           :table_id (mt/id :orders)
                           :signature_hash (:signature_hash candidate)))))
    (is (some? old-run))))

(deftest refresh-queue-is-exclusive-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :queued
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}}]
    (is (nil? (candidates/queue-refresh! :manual (mt/user->id :crowberto))))
    (is (= (:id run) (:id (candidates/active-run))))))

(deftest successful-refresh-retains-run-history-but-prunes-old-snapshot-test
  (mt/with-temp [:model/UsageMetadataCandidateRun old-run {:status            :succeeded
                                                           :trigger           :scheduled
                                                           :algorithm_version 1
                                                           :source_config     {}
                                                           :finished_at       (mi/now)}
                 :model/UsageMetadataCandidate old-candidate (candidate-row (:id old-run) (mt/id :orders))]
    (mt/with-dynamic-fn-redefs [insights/qualified-card-ids (constantly [])
                                insights/cleanup-candidates (constantly {:measures [], :segments []})]
      (let [run (candidates/queue-refresh! :manual (mt/user->id :crowberto))]
        (is (= :succeeded (:status (candidates/run-refresh! run))))
        (is (= (:id run) (:id (candidates/latest-successful-run))))
        (is (t2/exists? :model/UsageMetadataCandidateRun :id (:id old-run)))
        (is (not (t2/exists? :model/UsageMetadataCandidate :id (:id old-candidate))))))))

(deftest fixed-candidate-evidence-cutoffs-test
  (let [base {:candidate_type         :segment
              :semantic_details       {:atom-count 1}
              :complexity             1
              :verified_source_count  0
              :official_source_count  0
              :distinct_source_count  1
              :total_view_count       0}]
    (testing "verified evidence requires at least 10 total views"
      (is (not (globally-eligible? (assoc base
                                          :verified_source_count 1
                                          :total_view_count 9))))
      (is (globally-eligible? (assoc base
                                     :verified_source_count 1
                                     :total_view_count 10))))
    (testing "official evidence requires two distinct sources and 10 total views"
      (is (not (globally-eligible? (assoc base
                                          :official_source_count 1
                                          :distinct_source_count 1
                                          :total_view_count 100))))
      (is (not (globally-eligible? (assoc base
                                          :official_source_count 1
                                          :distinct_source_count 2
                                          :total_view_count 9))))
      (is (globally-eligible? (assoc base
                                     :official_source_count 1
                                     :distinct_source_count 2
                                     :total_view_count 10))))
    (testing "general usage requires three distinct sources and 25 total views"
      (is (not (globally-eligible? (assoc base
                                          :distinct_source_count 2
                                          :total_view_count 1000))))
      (is (not (globally-eligible? (assoc base
                                          :distinct_source_count 3
                                          :total_view_count 24))))
      (is (globally-eligible? (assoc base
                                     :distinct_source_count 3
                                     :total_view_count 25))))
    (testing "evidence cutoffs do not override semantic exclusions"
      (is (not (globally-eligible? (assoc base
                                          :candidate_type :measure
                                          :semantic_details {:type :count, :field nil}
                                          :verified_source_count 1
                                          :distinct_source_count 3
                                          :total_view_count 100)))))))

(deftest persisted-candidates-are-pruned-by-the-fixed-evidence-cutoffs-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                       :trigger           :manual
                                                       :algorithm_version candidates/algorithm-version
                                                       :source_config     {}}
                 :model/UsageMetadataCandidate weak-candidate
                 (assoc (candidate-row (:id run) (mt/id :orders))
                        :verified_source_count 0
                        :official_source_count 1
                        :popular_source_count 0
                        :total_view_count 8)
                 :model/UsageMetadataCandidate strong-candidate
                 (candidate-row (:id run) (mt/id :products))]
    (prune-ineligible-candidates! (:id run))
    (is (not (t2/exists? :model/UsageMetadataCandidate :id (:id weak-candidate))))
    (is (t2/exists? :model/UsageMetadataCandidate :id (:id strong-candidate)))))

(deftest closed-segment-pruning-uses-exact-provenance-test
  (let [metadata-provider (lib-be/application-database-metadata-provider (mt/id))
        base-query        (lib/query metadata-provider
                                     (lib.metadata/table metadata-provider (mt/id :orders)))
        subtotal          (lib.metadata/field metadata-provider (mt/id :orders :subtotal))
        user-id           (lib.metadata/field metadata-provider (mt/id :orders :user_id))
        product-id        (lib.metadata/field metadata-provider (mt/id :orders :product_id))
        quantity          (lib.metadata/field metadata-provider (mt/id :orders :quantity))
        atom-a            (lib/> subtotal 10)
        atom-b            (lib/= user-id 1)
        atom-c            (lib/= product-id 2)
        atom-d            (lib/> quantity 3)
        definition        (fn [& atoms]
                            (lib/filter base-query
                                        (if (next atoms)
                                          (apply lib/and atoms)
                                          (first atoms))))
        table-id          (mt/id :orders)
        candidates        [{:id 1, :table_id table-id, :definition (definition atom-a atom-b)}
                           {:id 2, :table_id table-id, :definition (definition atom-a atom-b atom-c)}
                           {:id 3, :table_id table-id, :definition (definition atom-a atom-b atom-d)}
                           {:id 4, :table_id table-id, :definition (definition atom-a)}
                           {:id 5, :table_id (mt/id :products), :definition (definition atom-a)}
                           {:id 6, :table_id table-id, :definition (definition atom-a atom-c)}]
        shared-provenance [{:card_id 10, :stage_numbers [0], :joined false}
                           {:card_id 20, :stage_numbers [0], :joined false}]
        different-provenance [{:card_id 10, :stage_numbers [0], :joined false}
                              {:card_id 30, :stage_numbers [0], :joined false}]
        different-stage-provenance [{:card_id 10, :stage_numbers [1], :joined false}
                                    {:card_id 20, :stage_numbers [0], :joined false}]
        provenance-index {1 shared-provenance
                          2 shared-provenance
                          3 shared-provenance
                          4 different-provenance
                          5 shared-provenance
                          6 different-stage-provenance}]
    (testing "only a proper subset with identical full provenance on the same table is pruned"
      (is (= #{1}
             (non-closed-segment-candidate-ids candidates provenance-index))))))

(deftest source-provenance-index-groups-and-normalizes-sources-test
  (let [metadata-provider (lib-be/application-database-metadata-provider (mt/id))
        base-query        (lib/query metadata-provider
                                     (lib.metadata/table metadata-provider (mt/id :orders)))
        definition        (lib/filter base-query
                                      (lib/> (lib.metadata/field metadata-provider
                                                                 (mt/id :orders :subtotal))
                                             10))]
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                         :trigger           :manual
                                                         :algorithm_version candidates/algorithm-version
                                                         :source_config     {}}
                   :model/UsageMetadataCandidate candidate
                   (assoc (candidate-row (:id run) (mt/id :orders))
                          :definition definition)
                   :model/Card card {:name "Candidate source"
                                     :type :question}
                   :model/UsageMetadataCandidateSource _
                   {:candidate_id  (:id candidate)
                    :card_id       (:id card)
                    :card_name     (:name card)
                    :card_type     :question
                    :verified      true
                    :official      false
                    :popular       true
                    :view_count    12
                    :joined        false
                    :stage_numbers [0 1]
                    :model_lineage []}]
      (is (= 1 (count (segment-atoms
                       (:definition (t2/select-one :model/UsageMetadataCandidate :id (:id candidate)))))))
      (is (= {(:id candidate)
              [{:card_id       (:id card)
                :card_name     "Candidate source"
                :card_type     :question
                :verified      true
                :official      false
                :popular       true
                :view_count    12
                :joined        false
                :stage_numbers [0 1]
                :model_lineage []}]}
             (source-provenance-index [(:id candidate)]))))))

(deftest semantic-eligibility-normalizes-persisted-type-test
  (is (not (globally-eligible? {:candidate_type         :measure
                                :semantic_details       {:type "count", :field nil}
                                :complexity             0
                                :verified_source_count  1
                                :official_source_count  1
                                :distinct_source_count  3
                                :total_view_count       100}))))

(deftest structural-library-relations-test
  (let [metadata-provider (lib-be/application-database-metadata-provider (mt/id))
        base-query        (lib/query metadata-provider
                                     (lib.metadata/table metadata-provider (mt/id :orders)))
        subtotal          (lib.metadata/field metadata-provider (mt/id :orders :subtotal))
        user-id           (lib.metadata/field metadata-provider (mt/id :orders :user_id))
        product-id        (lib.metadata/field metadata-provider (mt/id :orders :product_id))
        condition         (lib/> subtotal 10)
        measure   {:signature "candidate"
                   :definition (lib/aggregate base-query (lib/sum-where subtotal condition))}
        segment-a (lib/= user-id 1)
        segment-b condition
        segment   {:signature "candidate"
                   :definition (lib/filter base-query (lib/and segment-a segment-b))}]
    (testing "conditional and unfiltered Measures sharing an operation and field are structurally related"
      (is (= :same-base
             (relation-for-measure measure
                                   {:signature "existing"
                                    :definition (lib/aggregate base-query (lib/sum subtotal))}))))
    (testing "Segment relationships report how the existing definition relates to the candidate"
      (is (= :subset
             (relation-for-segment segment
                                   {:signature "existing"
                                    :definition (lib/filter base-query segment-a)})))
      (is (= :overlap
             (relation-for-segment segment
                                   {:signature "existing"
                                    :definition (lib/filter base-query
                                                            (lib/and segment-a
                                                                     (lib/= product-id 1)))}))))
    (testing "matching semantic signatures are exact"
      (is (= :exact (relation-for-measure measure (assoc measure :signature "candidate"))))
      (is (= :exact (relation-for-segment segment (assoc segment :signature "candidate")))))))
