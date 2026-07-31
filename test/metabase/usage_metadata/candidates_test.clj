(ns metabase.usage-metadata.candidates-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
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
(def ^:private locally-running-run-ids @#'candidates/locally-running-run-ids)
(def ^:private non-closed-segment-candidate-ids
  @#'candidates/non-closed-segment-candidate-ids)
(def ^:private non-closed-measure-candidate-ids
  @#'candidates/non-closed-measure-candidate-ids)
(def ^:private candidate-families @#'candidates/candidate-families)

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

(defn- family-candidate
  [id atoms overrides]
  (merge
   {:id                    id
    :table_id              1
    :candidate_type        :segment
    :modeling_status       :missing
    :signature_hash        (format "%064d" id)
    :signature             (str "[\"candidate-" id "\"]")
    :definition            {}
    :semantic_details      {:atoms (mapv (fn [[signature display-name]]
                                           {:signature signature
                                            :display-name display-name
                                            :kind :category})
                                         atoms)}
    :suggested_name        (str "Candidate " id)
    :verified_source_count 0
    :official_source_count 0
    :distinct_source_count 1
    :complexity            (count atoms)
    :total_view_count      10}
   overrides))

(deftest recommendation-families-use-a-deterministic-primary-subset-parent-test
  (let [parent       (family-candidate 1 [["a-trial" "Trial complete"]
                                          ["c-deployment" "Deployment is cloud"]
                                          ["d-email" "Email is present"]]
                                       {:official_source_count 1
                                        :distinct_source_count 10})
        other-parent (family-candidate 2 [["a-trial" "Trial complete"]
                                          ["b-created" "Created recently"]
                                          ["c-deployment" "Deployment is cloud"]]
                                       {:distinct_source_count 2})
        child        (family-candidate 3 [["a-trial" "Trial complete"]
                                          ["b-created" "Created recently"]
                                          ["c-deployment" "Deployment is cloud"]
                                          ["d-email" "Email is present"]]
                                       {:distinct_source_count 5})
        families     (candidate-families [other-parent child parent])
        child-row    (first (filter #(= 3 (:candidate-id %)) families))
        display-name (:display-name child-row)]
    (testing "the strongest equally-sized subset is the one primary parent"
      (is (= (:signature_hash parent) (:family-key child-row)))
      (is (= 1 (:family-depth child-row))))
    (testing "the parent atoms remain a prefix and the additional atom is appended"
      (is (< (str/index-of display-name "Trial")
             (str/index-of display-name "Deployment")
             (str/index-of display-name "Email")
             (str/index-of display-name "Created"))))
    (testing "the presentation atoms use that same inherited order"
      (is (= ["Trial complete" "Deployment is cloud" "Email is present" "Created recently"]
             (mapv :display-name (get-in child-row [:semantic-details :display-atoms])))))
    (testing "each candidate appears exactly once"
      (is (= [1 3 2] (mapv :candidate-id families))))))

(deftest recommendation-family-priority-comes-from-its-strongest-member-test
  (let [weak-root    (family-candidate 1 [["a" "A"]] {})
        strong-child (family-candidate 2 [["a" "A"] ["b" "B"]]
                                       {:verified_source_count 1
                                        :distinct_source_count 20})
        medium-root  (family-candidate 3 [["c" "C"]]
                                       {:official_source_count 1
                                        :distinct_source_count 10})]
    (is (= [1 2 3]
           (mapv :candidate-id
                 (candidate-families [medium-root weak-root strong-child]))))))

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

(deftest refresh-queue-recovers-run-interrupted-before-worker-start-test
  (mt/with-temp [:model/UsageMetadataCandidateRun interrupted-run {:status            :queued
                                                                   :trigger           :manual
                                                                   :algorithm_version 1
                                                                   :source_config     {}
                                                                   :created_at        (t/minus (t/offset-date-time) (t/minutes 10))}]
    (let [replacement-run (candidates/queue-refresh! :manual (mt/user->id :crowberto))
          interrupted-run (t2/select-one :model/UsageMetadataCandidateRun :id (:id interrupted-run))]
      (try
        (is (= :failed (:status interrupted-run)))
        (is (some? (:finished_at interrupted-run)))
        (is (re-find #"before processing started" (:error interrupted-run)))
        (is (= :queued (:status replacement-run)))
        (is (= (:id replacement-run) (:id (candidates/active-run))))
        (finally
          (t2/delete! :model/UsageMetadataCandidateRun :id (:id replacement-run)))))))

(deftest refresh-queue-recovers-run-interrupted-by-server-restart-test
  (mt/with-temp [:model/UsageMetadataCandidateRun interrupted-run {:status            :running
                                                                   :trigger           :manual
                                                                   :algorithm_version 1
                                                                   :source_config     {}
                                                                   :started_at        (mi/now)}]
    (let [replacement-run (candidates/queue-refresh! :manual (mt/user->id :crowberto))
          interrupted-run (t2/select-one :model/UsageMetadataCandidateRun :id (:id interrupted-run))]
      (try
        (is (= :failed (:status interrupted-run)))
        (is (some? (:finished_at interrupted-run)))
        (is (re-find #"interrupted" (:error interrupted-run)))
        (is (= :queued (:status replacement-run)))
        (is (= (:id replacement-run) (:id (candidates/active-run))))
        (finally
          (t2/delete! :model/UsageMetadataCandidateRun :id (:id replacement-run)))))))

(deftest refresh-queue-does-not-recover-a-locally-running-run-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}
                                                       :started_at        (mi/now)}]
    (swap! locally-running-run-ids conj (:id run))
    (try
      (is (nil? (candidates/queue-refresh! :manual (mt/user->id :crowberto))))
      (is (= :running
             (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id run))))
      (finally
        (swap! locally-running-run-ids disj (:id run))))))

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

(deftest persisted-refresh-uses-recent-view-source-configuration-test
  (let [cleanup-opts (atom nil)]
    (mt/with-dynamic-fn-redefs
      [insights/qualified-card-ids (fn [minimum-view-count window-days]
                                     (is (= 10 minimum-view-count))
                                     (is (= 90 window-days))
                                     [1])
       insights/cleanup-candidates (fn [opts]
                                     (reset! cleanup-opts opts)
                                     {:measures [], :segments []})]
      (let [run (candidates/queue-refresh! :manual (mt/user->id :crowberto))]
        (is (= :succeeded (:status (candidates/run-refresh! run))))
        (is (= {:kind                      "qualified-cards"
                :usage-window-days         90
                :minimum-recent-view-count 10
                :candidate-cutoffs         {:verified {:minimum-total-view-count 10}
                                            :official {:minimum-distinct-source-count 2
                                                       :minimum-total-view-count      10}
                                            :general  {:minimum-distinct-source-count 3
                                                       :minimum-total-view-count      25}}}
               (:source_config (t2/select-one :model/UsageMetadataCandidateRun :id (:id run)))))
        (is (= 10 (:min-view-count @cleanup-opts)))
        (is (= 90 (:view-count-window-days @cleanup-opts)))))))

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

(deftest closed-measure-pruning-uses-exact-provenance-and-base-aggregation-test
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
        condition         (fn [& atoms]
                            (if (next atoms)
                              (apply lib/and atoms)
                              (first atoms)))
        count-definition  (fn [& atoms]
                            (lib/aggregate base-query
                                           (lib/count-where (apply condition atoms))))
        sum-definition    (fn [& atoms]
                            (lib/aggregate base-query
                                           (lib/sum-where quantity (apply condition atoms))))
        table-id          (mt/id :orders)
        candidates        [{:id 1, :table_id table-id, :definition (count-definition atom-a)}
                           {:id 2, :table_id table-id, :definition (count-definition atom-a atom-b)}
                           {:id 3, :table_id table-id, :definition (count-definition atom-a atom-c)}
                           {:id 4, :table_id table-id, :definition (sum-definition atom-a atom-b)}
                           {:id 5, :table_id table-id, :definition (count-definition atom-a atom-b atom-c)}
                           {:id 6, :table_id (mt/id :products), :definition (count-definition atom-a atom-b)}]
        shared-provenance [{:card_id 10, :stage_numbers [0], :joined false}
                           {:card_id 20, :stage_numbers [0], :joined false}]
        different-provenance [{:card_id 10, :stage_numbers [0], :joined false}
                              {:card_id 30, :stage_numbers [0], :joined false}]
        third-provenance [{:card_id 10, :stage_numbers [0], :joined false}
                          {:card_id 40, :stage_numbers [0], :joined false}]
        provenance-index {1 shared-provenance
                          2 shared-provenance
                          3 different-provenance
                          4 shared-provenance
                          5 third-provenance
                          6 shared-provenance}]
    (testing "only a condition subset with identical table, base aggregation, and provenance is pruned"
      (is (= #{1}
             (non-closed-measure-candidate-ids candidates provenance-index))))))

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
