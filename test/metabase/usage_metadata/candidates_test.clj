(ns metabase.usage-metadata.candidates-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.mq.test-util :as mq.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidate-builders :as candidate-builders]
   [metabase.usage-metadata.candidate-definitions :as candidate-definitions]
   [metabase.usage-metadata.candidate-family :as candidate-family]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]
   [metabase.usage-metadata.candidate-repository :as candidate-repository]
   [metabase.usage-metadata.candidate-snapshot :as candidate-snapshot]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private relation-for-measure candidate-definitions/relation-for-measure)
(def ^:private relation-for-segment candidate-definitions/relation-for-segment)
(def ^:private segment-atoms candidate-definitions/segment-atoms)
(def ^:private globally-eligible? candidate-snapshot/globally-eligible?)
(def ^:private prune-ineligible-candidates! candidate-snapshot/prune-ineligible-candidates!)
(def ^:private source-provenance-index candidate-snapshot/source-provenance-index)
(def ^:private locally-running-run-ids candidate-refresh/locally-running-run-ids)
(def ^:private candidate-refresh-lock-timeout? candidate-refresh/candidate-refresh-lock-timeout?)
(def ^:private non-closed-segment-candidate-ids
  candidate-snapshot/non-closed-segment-candidate-ids)
(def ^:private non-closed-measure-candidate-ids
  candidate-snapshot/non-closed-measure-candidate-ids)
(def ^:private candidate-family-parent-index candidate-family/candidate-family-parent-index)
(def ^:private candidate-families candidate-family/candidate-families)
(def ^:private prune-old-candidate-snapshots! candidate-snapshot/prune-old-candidate-snapshots!)
(def ^:private reconcile-candidates! candidate-snapshot/reconcile-candidates!)
(def ^:private persist-observations! @#'candidate-snapshot/persist-observations!)

(defn- candidate-row
  [run-id table-id]
  {:run_id                 run-id
   :candidate_type         :segment
   :table_id               table-id
   :signature_version      candidate-snapshot/signature-version
   :signature_hash         (apply str (repeat 64 "a"))
   :signature              "[\"segment\"]"
   :definition             {:lib/type :mbql/query}
   :semantic_details       {:atom-count 1}
   :suggested_name         "Recent orders"
   :display_name           "Recent orders"
   :suggested_description  "Recent orders on Orders"
   :sort_position          0
   :modeling_status        :missing
   :verified_source_count  1
   :official_source_count  0
   :popular_source_count   1
   :distinct_source_count  1
   :recent_view_count       10
   :complexity             1})

(defn- queued-run!
  []
  (t2/insert-returning-instance! :model/UsageMetadataCandidateRun
                                 {:status            :queued
                                  :trigger           :manual
                                  :algorithm_version candidate-refresh/algorithm-version
                                  :source_config     candidate-snapshot/source-config}))

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
    :recent_view_count      10}
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
    (testing "the strongest equally-sized subset controls the inherited atom order"
      (is (< (str/index-of display-name "Trial")
             (str/index-of display-name "Deployment")
             (str/index-of display-name "Email")
             (str/index-of display-name "Created"))))
    (testing "the presentation atoms use that same inherited order"
      (is (= ["Trial complete" "Deployment is cloud" "Email is present" "Created recently"]
             (mapv :display-name (get-in child-row [:semantic-details :display-atoms])))))
    (testing "each candidate appears exactly once"
      (is (= [1 3 2] (mapv :candidate-id families)))
      (is (= [0 1 2] (mapv :sort-position families))))))

(deftest ^:parallel candidate-family-parent-index-prefers-the-largest-subset-test
  (let [small-parent   (family-candidate 1 [["a" "A"]]
                                         {:verified_source_count 1})
        largest-parent (family-candidate 2 [["a" "A"] ["b" "B"]] {})
        child          (family-candidate 3 [["a" "A"] ["b" "B"] ["c" "C"]] {})
        unrelated      (mapv #(family-candidate (+ 10 %) [[(str "unrelated-" %) "Unrelated"]] {})
                             (range 100))
        parent-index   (candidate-family-parent-index
                        (into [small-parent largest-parent child] unrelated))]
    (is (= {2 1, 3 2}
           (select-keys parent-index [2 3])))))

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

(defn- measure-family-candidate
  [id definition base-name atoms overrides]
  (merge
   {:id                    id
    :table_id              (mt/id :orders)
    :candidate_type        :measure
    :modeling_status       :missing
    :signature_hash        (format "%064d" id)
    :signature             (str "[\"measure-candidate-" id "\"]")
    :definition            definition
    :semantic_details      {:base-name base-name
                            :condition-atoms (mapv (fn [[signature display-name]]
                                                     {:signature signature
                                                      :display-name display-name
                                                      :kind :category})
                                                   atoms)}
    :suggested_name        (str "Measure candidate " id)
    :verified_source_count 0
    :official_source_count 0
    :distinct_source_count 1
    :complexity            (count atoms)
    :recent_view_count      10}
   overrides))

(deftest measure-families-group-by-shared-aggregation-base-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        orders     (lib.metadata/table mp (mt/id :orders))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))
        definition (lib/aggregate (lib/query mp orders) (lib/sum subtotal))
        parent     (measure-family-candidate 1 definition "Revenue"
                                             [["a-trial" "Trial complete"]] {})
        child      (measure-family-candidate 2 definition "Revenue"
                                             [["a-trial" "Trial complete"]
                                              ["b-created" "Created recently"]]
                                             {})
        families   (candidate-families [child parent])
        child-row  (first (filter #(= 2 (:candidate-id %)) families))]
    (testing "measures sharing the same aggregation base are grouped into one family, parent first"
      (is (= [1 2] (mapv :candidate-id families))))
    (testing "the measure branch of family-display-name combines the base name and inherited conditions"
      (is (= "Revenue where Trial complete and Created recently"
             (:display-name child-row))))))

(deftest latest-successful-snapshot-and-durable-dismissal-test
  (mt/with-temp [:model/UsageMetadataCandidateRun _old-run {:status            :succeeded
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
    (is (= (:id run) (:id (candidate-refresh/latest-successful-run))))
    (is (candidate-refresh/candidate-current? candidate))
    (let [dismissal (candidate-repository/dismiss! candidate (mt/user->id :crowberto))]
      (is (= (mt/user->id :crowberto) (:dismissed_by dismissal)))
      (is (= 1 (t2/count :model/UsageMetadataCandidateDismissal
                         :candidate_type :segment
                         :table_id (mt/id :orders)
                         :signature_hash (:signature_hash candidate))))
      (candidate-repository/restore! candidate)
      (is (zero? (t2/count :model/UsageMetadataCandidateDismissal
                           :candidate_type :segment
                           :table_id (mt/id :orders)
                           :signature_hash (:signature_hash candidate)))))))

(deftest candidate-repository-pages-encapsulate-persisted-schema-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}
                                                       :finished_at       (mi/now)}
                 :model/UsageMetadataCandidate first-candidate
                 (assoc (candidate-row (:id run) (mt/id :orders))
                        :suggested_name "Alpha orders"
                        :display_name "Alpha orders")
                 :model/UsageMetadataCandidate second-candidate
                 (assoc (candidate-row (:id run) (mt/id :orders))
                        :candidate_type :measure
                        :signature_hash (apply str (repeat 64 "b"))
                        :signature "[\"measure\"]"
                        :suggested_name "Zulu orders"
                        :display_name "Zulu orders"
                        :sort_position 1)]
    (candidate-repository/dismiss! first-candidate (mt/user->id :crowberto))
    (try
      (testing "candidate filtering, ordering, hydration, and dismissal state"
        (is (=? {:total 2
                 :rows [{:id (:id second-candidate)
                         :candidate_type :measure
                         :modeling_status :missing
                         :dismissed? false}]}
                (candidate-repository/candidate-page
                 (:id run) {} {:limit 1, :offset 1})))
        (is (=? {:total 1
                 :rows [{:id (:id first-candidate), :dismissed? true}]}
                (candidate-repository/candidate-page
                 (:id run)
                 {:queue :discarded, :search "alpha"}
                 {:limit 10, :offset 0}))))
      (testing "table aggregation and response dependencies"
        (is (=? {:total 1
                 :rows [{:candidate-count 2
                         :table {:id (mt/id :orders)
                                 :database {:id (mt/id)}}}]}
                (candidate-repository/table-page
                 (:id run) {} {:limit 10, :offset 0}))))
      (finally
        (candidate-repository/restore! first-candidate)))))

(deftest candidate-page-drops-a-row-deleted-mid-page-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}
                                                       :finished_at       (mi/now)}
                 :model/UsageMetadataCandidate candidate (candidate-row (:id run) (mt/id :orders))]
    (let [original-select-pk->fn (mt/original-fn #'t2/select-pk->fn)]
      (mt/with-dynamic-fn-redefs
        [t2/select-pk->fn (fn [f model & args]
                            (dissoc (apply original-select-pk->fn f model args) (:id candidate)))]
        (testing "a row that disappears between the id query and the row query is dropped, not returned as a null id"
          (is (=? {:total 1, :rows []}
                  (candidate-repository/candidate-page (:id run) {} {:limit 10, :offset 0}))))))))

(deftest candidate-repository-detail-hydrates-related-records-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}
                                                       :finished_at       (mi/now)}
                 :model/UsageMetadataCandidate candidate (candidate-row (:id run) (mt/id :orders))]
    (t2/insert! :model/UsageMetadataCandidateSource
                {:candidate_id      (:id candidate)
                 :card_id           123456
                 :card_name         "Orders question"
                 :card_type         :question
                 :verified          true
                 :official          false
                 :popular           true
                 :recent_view_count 12
                 :joined            false
                 :stage_numbers     [0]
                 :model_lineage     []})
    (t2/insert! :model/UsageMetadataCandidateMatch
                {:candidate_id (:id candidate)
                 :relation     :exact
                 :entity_id    654321
                 :entity_name  "Recent orders"})
    (is (=? {:candidate {:id (:id candidate)}
             :table {:id (mt/id :orders), :database {:id (mt/id)}}
             :dismissed? false
             :sources [{:card_id 123456, :card_type :question, :stage_numbers [0]}]
             :matches [{:relation :exact, :entity_id 654321}]}
            (candidate-repository/candidate-detail candidate)))))

(deftest candidate-query-definitions-are-serialized-at-the-model-boundary-test
  (let [metadata-provider (lib-be/application-database-metadata-provider (mt/id))
        table             (lib.metadata/table metadata-provider (mt/id :orders))
        query             (lib/query metadata-provider table)]
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate candidate
                   (assoc (candidate-row (:id run) (mt/id :orders)) :definition query)]
      (let [persisted-definition (:definition (t2/select-one :model/UsageMetadataCandidate :id (:id candidate)))]
        (is (not (contains? persisted-definition :lib/metadata)))
        (is (= (lib/prepare-for-serialization query)
               (lib/prepare-for-serialization persisted-definition)))))))

(deftest candidate-reconciliation-round-trips-mined-signatures-test
  (let [metadata-provider (lib-be/application-database-metadata-provider (mt/id))
        table             (lib.metadata/table metadata-provider (mt/id :orders))
        subtotal          (lib.metadata/field metadata-provider (mt/id :orders :subtotal))
        query             (lib/aggregate (lib/query metadata-provider table) (lib/sum subtotal))]
    (mt/with-temp [:model/Card {card-id :id} {:name "Mined revenue"
                                              :type :question
                                              :dataset_query query
                                              :view_count 100}]
      (let [mined (-> (candidate-builders/cleanup-candidates
                       {:card-ids #{card-id}
                        :include-ineligible? true})
                      :measures
                      first)]
        (mt/with-temp [:model/Measure measure {:name "Revenue"
                                               :creator_id (mt/user->id :crowberto)
                                               :definition (:definition mined)}
                       :model/UsageMetadataCandidateRun published-run {:status :running
                                                                       :trigger :manual
                                                                       :algorithm_version 1
                                                                       :source_config {}}
                       :model/UsageMetadataCandidate published-candidate
                       (merge (candidate-row (:id published-run) (mt/id :orders))
                              {:candidate_type :measure
                               :signature (:signature mined)
                               :definition (:definition mined)
                               :semantic_details (:aggregation mined)})
                       :model/UsageMetadataCandidateRun unpublished-run {:status :running
                                                                         :trigger :manual
                                                                         :algorithm_version 1
                                                                         :source_config {}}
                       :model/UsageMetadataCandidate unpublished-candidate
                       (merge (candidate-row (:id unpublished-run) (mt/id :orders))
                              {:candidate_type :measure
                               :signature (:signature mined)
                               :definition (:definition mined)
                               :semantic_details (:aggregation mined)})]
          (testing "a mined definition and its saved Library entity have the same exact signature"
            (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true}
              (reconcile-candidates! (:id published-run)))
            (is (= :modeled
                   (t2/select-one-fn :modeling_status :model/UsageMetadataCandidate
                                     :id (:id published-candidate))))
            (is (= {:relation        :exact
                    :entity_id       (:id measure)
                    :entity_name     "Revenue"}
                   (t2/select-one [:model/UsageMetadataCandidateMatch
                                   :relation :entity_id :entity_name]
                                  :candidate_id (:id published-candidate)))))
          (testing "entities on an unpublished table are not treated as Library matches"
            (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published false}
              (reconcile-candidates! (:id unpublished-run)))
            (is (= :missing
                   (t2/select-one-fn :modeling_status :model/UsageMetadataCandidate
                                     :id (:id unpublished-candidate))))
            (is (zero? (t2/count :model/UsageMetadataCandidateMatch
                                 :candidate_id (:id unpublished-candidate))))))))))

(deftest snapshot-reconciliation-reuses-prepared-library-entities-test
  (let [metadata-provider (lib-be/application-database-metadata-provider (mt/id))
        table-id          (mt/id :orders)
        table             (lib.metadata/table metadata-provider table-id)
        subtotal          (lib.metadata/field metadata-provider (mt/id :orders :subtotal))
        base-query        (lib/query metadata-provider table)
        measure-definition (lib/aggregate base-query (lib/sum subtotal))
        conditional-definition (lib/aggregate base-query
                                              (lib/sum-where subtotal (lib/> subtotal 10)))
        exact-signature   (candidate-definitions/existing-signature
                           :measure table-id measure-definition)
        original-aggregation-clause (mt/original-fn #'candidate-definitions/aggregation-clause)
        original-existing-entity-index (mt/original-fn #'candidate-repository/existing-entity-index)
        original-insert!   (mt/original-fn #'t2/insert!)
        normalization-count (atom 0)
        index-load-count   (atom 0)
        match-insert-count (atom 0)]
    (mt/with-temp-vals-in-db :model/Table table-id {:is_published true}
      (mt/with-temp [:model/Measure _ {:name "Revenue"
                                       :creator_id (mt/user->id :crowberto)
                                       :definition measure-definition}
                     :model/UsageMetadataCandidateRun run {:status :running
                                                           :trigger :manual
                                                           :algorithm_version 1
                                                           :source_config {}}
                     :model/UsageMetadataCandidate exact-candidate
                     (merge (candidate-row (:id run) table-id)
                            {:candidate_type :measure
                             :signature exact-signature
                             :definition measure-definition
                             :semantic_details {:type :sum}})
                     :model/UsageMetadataCandidate related-candidate
                     (merge (candidate-row (:id run) table-id)
                            {:candidate_type :measure
                             :signature_hash (apply str (repeat 64 "b"))
                             :signature "conditional-revenue"
                             :definition conditional-definition
                             :semantic_details {:type :sum-where}})]
        (mt/with-dynamic-fn-redefs
          [candidate-definitions/aggregation-clause
           (fn [definition]
             (swap! normalization-count inc)
             (original-aggregation-clause definition))
           candidate-repository/existing-entity-index
           (fn [candidate-keys]
             (swap! index-load-count inc)
             (original-existing-entity-index candidate-keys))
           t2/insert!
           (fn [model & rows]
             (when (= model :model/UsageMetadataCandidateMatch)
               (swap! match-insert-count inc))
             (apply original-insert! model rows))]
          (reconcile-candidates! (:id run)))
        (testing "Library entities are indexed once and each definition is normalized once"
          (is (= {:index-loads 1, :normalizations 3}
                 {:index-loads @index-load-count, :normalizations @normalization-count})))
        (testing "match rows are inserted as one batch"
          (is (= 1 @match-insert-count)))
        (testing "all reconciliation results and matches are persisted"
          (is (= {(:id exact-candidate)   :modeled
                  (:id related-candidate) :partially-modeled}
                 (t2/select-fn->fn :id :modeling_status :model/UsageMetadataCandidate
                                   :id [:in [(:id exact-candidate) (:id related-candidate)]])))
          (is (= #{[(:id exact-candidate) :exact]
                   [(:id related-candidate) :same-base]}
                 (into #{}
                       (map (juxt :candidate_id :relation))
                       (t2/select [:model/UsageMetadataCandidateMatch :candidate_id :relation]
                                  :candidate_id [:in [(:id exact-candidate) (:id related-candidate)]])))))))))

(deftest old-candidate-snapshots-are-deleted-in-batches-test
  (let [pages   (atom [#{1 2} #{3} #{}])
        deleted (atom [])]
    (mt/with-dynamic-fn-redefs
      [t2/select-pks-set (fn [_model query]
                           (is (= [:not= :run_id 9] (:where query)))
                           (is (= 200 (:limit query)))
                           (let [page (first @pages)]
                             (swap! pages subvec 1)
                             page))
       t2/delete!         (fn [_model _id ids]
                            (swap! deleted conj ids))]
      (prune-old-candidate-snapshots! 9))
    (is (= [[:in #{1 2}] [:in #{3}]] @deleted))))

(deftest old-candidate-snapshots-prune-stops-after-batch-bound-test
  (let [max-batches   @#'candidate-snapshot/max-prune-batches-per-run
        pages-served  (atom 0)
        deleted-count (atom 0)]
    (mt/with-dynamic-fn-redefs
      [t2/select-pks-set (fn [_model _query]
                           (swap! pages-served inc)
                           #{1})
       t2/delete!         (fn [_model _id _ids]
                            (swap! deleted-count inc))]
      (prune-old-candidate-snapshots! 9))
    (testing "an inexhaustible backlog stops after max-prune-batches-per-run, not indefinitely"
      (is (= max-batches @pages-served))
      (is (= max-batches @deleted-count)))))

(deftest refresh-queue-is-exclusive-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :queued
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}}]
    (let [published (atom [])]
      (mt/with-dynamic-fn-redefs [candidate-refresh/publish-refresh! #(swap! published conj %)]
        (is (= (:id run)
               (:id (candidate-refresh/queue-refresh! :manual (mt/user->id :crowberto))))))
      (is (= [(:id run)] (mapv :id @published)))
      (is (= (:id run) (:id (candidate-refresh/active-run)))))))

(deftest candidate-refresh-lock-timeout-detection-test
  (testing "cluster-lock reports keyword locks as namespace/name strings"
    (is (true? (candidate-refresh-lock-timeout?
                (ex-info "Timed out"
                         {:lock-names ["metabase.usage-metadata.candidate-refresh/candidate-refresh"]})))))
  (testing "an unrelated lock timeout must still be rethrown"
    (is (false? (candidate-refresh-lock-timeout?
                 (ex-info "Timed out"
                          {:lock-names ["metabase.usage-metadata.candidate-refresh/another-lock"]}))))))

(deftest candidate-refresh-lock-timeout-keeps-running-run-active-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}
                                                       :started_at        (mi/now)}]
    (mt/with-dynamic-fn-redefs
      [cluster-lock/do-with-cluster-lock
       (fn [_opts _thunk]
         (throw (ex-info "Timed out"
                         {:lock-names ["metabase.usage-metadata.candidate-refresh/candidate-refresh"]})))]
      (is (= (:id run) (:id (@#'candidate-refresh/recover-interrupted-run! run)))))
    (is (= :running
           (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id run))))))

(deftest refresh-queue-redispatches-existing-queued-run-test
  (mt/with-temp [:model/UsageMetadataCandidateRun interrupted-run {:status            :queued
                                                                   :trigger           :manual
                                                                   :algorithm_version 1
                                                                   :source_config     {}
                                                                   :created_at        (t/minus (t/offset-date-time) (t/minutes 10))}]
    (let [published (atom [])]
      (mt/with-dynamic-fn-redefs [candidate-refresh/publish-refresh! #(swap! published conj %)]
        (is (= (:id interrupted-run)
               (:id (candidate-refresh/queue-refresh! :manual (mt/user->id :crowberto))))))
      (is (= [(:id interrupted-run)] (mapv :id @published)))
      (is (= :queued
             (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id interrupted-run)))))))

(deftest refresh-queue-recovers-run-interrupted-by-server-restart-test
  (mt/with-temp [:model/UsageMetadataCandidateRun interrupted-run {:status            :running
                                                                   :trigger           :manual
                                                                   :algorithm_version 1
                                                                   :source_config     {}
                                                                   :started_at        (mi/now)}]
    (let [published (atom [])]
      (mt/with-dynamic-fn-redefs [candidate-refresh/publish-refresh! #(swap! published conj %)]
        (let [replacement-run (candidate-refresh/queue-refresh! :manual (mt/user->id :crowberto))
              interrupted-run (t2/select-one :model/UsageMetadataCandidateRun :id (:id interrupted-run))]
          (try
            (is (=? {:status :failed, :error #".*interrupted.*"} interrupted-run))
            (is (some? (:finished_at interrupted-run)))
            (is (= :queued (:status replacement-run)))
            (is (= [(:id replacement-run)] (mapv :id @published)))
            (is (= (:id replacement-run) (:id (candidate-refresh/active-run))))
            (finally
              (t2/delete! :model/UsageMetadataCandidateRun :id (:id replacement-run)))))))))

(deftest recovered-running-message-dispatches-clean-replacement-test
  (mt/with-temp [:model/UsageMetadataCandidateRun interrupted-run {:status            :running
                                                                   :trigger           :scheduled
                                                                   :algorithm_version 1
                                                                   :source_config     {}
                                                                   :started_at        (mi/now)}]
    (let [published (atom [])]
      (mt/with-dynamic-fn-redefs [candidate-refresh/publish-refresh! #(swap! published conj %)]
        (let [replacement-run (candidate-refresh/run-refresh! interrupted-run)]
          (try
            (is (= :failed
                   (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id interrupted-run))))
            (is (= :queued (:status replacement-run)))
            (is (= [(:id replacement-run)] (mapv :id @published)))
            (finally
              (t2/delete! :model/UsageMetadataCandidateRun :id (:id replacement-run)))))))))

(deftest refresh-queue-does-not-recover-a-locally-running-run-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}
                                                       :started_at        (mi/now)}]
    (swap! locally-running-run-ids conj (:id run))
    (try
      (is (nil? (candidate-refresh/queue-refresh! :manual (mt/user->id :crowberto))))
      (is (= :running
             (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id run))))
      (finally
        (swap! locally-running-run-ids disj (:id run))))))

(deftest refresh-run-creation-rolls-back-when-dispatch-fails-test
  (let [run-count (t2/count :model/UsageMetadataCandidateRun)]
    (mt/with-dynamic-fn-redefs
      [candidate-refresh/publish-refresh! (fn [_run]
                                            (throw (ex-info "Injected dispatch failure" {})))]
      (is (thrown-with-msg? Exception #"Injected dispatch failure"
                            (candidate-refresh/queue-refresh! :manual (mt/user->id :crowberto)))))
    (is (= run-count (t2/count :model/UsageMetadataCandidateRun)))))

(deftest duplicate-refresh-delivery-materializes-once-test
  (let [materialization-count (atom 0)
        status-at-materialize  (atom nil)
        run-id                (atom nil)]
    (mq.tu/with-test-mq [ctx {:duplicate-delivery? true}]
      ;; MQ workers do not inherit the test thread's dynamic bindings.
      (with-redefs [candidate-snapshot/materialize!
                    (fn [{:keys [id] :as run}]
                      (swap! materialization-count inc)
                      (reset! status-at-materialize
                              (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id id))
                      (t2/update! :model/UsageMetadataCandidateRun
                                  {:id id, :status :running}
                                  {:status :succeeded, :finished_at (mi/now)})
                      (assoc run :status :succeeded))]
        (let [run (candidate-refresh/queue-refresh! :manual (mt/user->id :crowberto))]
          (reset! run-id (:id run))
          (is (mq.tu/eventually! ctx
                                 #(= :succeeded
                                     (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id run)))
                                 5000))
          (mq.tu/flush! ctx)
          (is (= 1 @materialization-count))
          (is (= :running @status-at-materialize)))))
    (when @run-id
      (t2/delete! :model/UsageMetadataCandidateRun :id @run-id))))

(deftest late-refresh-failure-does-not-overwrite-success-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}
                                                       :finished_at       (mi/now)}]
    (candidate-refresh/fail-run! run (ex-info "Late failure" {}))
    (is (= :succeeded
           (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id run))))))

(deftest successful-refresh-retains-run-history-but-prunes-old-snapshot-test
  (mt/with-temp [:model/UsageMetadataCandidateRun old-run {:status            :succeeded
                                                           :trigger           :scheduled
                                                           :algorithm_version 1
                                                           :source_config     {}
                                                           :finished_at       (mi/now)}
                 :model/UsageMetadataCandidate old-candidate (candidate-row (:id old-run) (mt/id :orders))]
    (mt/with-dynamic-fn-redefs [candidate-mining/qualified-card-ids (constantly [])
                                candidate-builders/candidate-analysis-inputs (constantly {})]
      (let [run (queued-run!)]
        (is (= :succeeded (:status (candidate-refresh/run-refresh! run))))
        (is (= (:id run) (:id (candidate-refresh/latest-successful-run))))
        (is (t2/exists? :model/UsageMetadataCandidateRun :id (:id old-run)))
        (is (not (t2/exists? :model/UsageMetadataCandidate :id (:id old-candidate))))))))

(deftest failed-snapshot-pruning-rolls-back-promotion-and-retirement-test
  (mt/with-temp [:model/UsageMetadataCandidateRun old-run {:status            :succeeded
                                                           :trigger           :scheduled
                                                           :algorithm_version 1
                                                           :source_config     {}
                                                           :finished_at       (mi/now)}
                 :model/UsageMetadataCandidate old-candidate (candidate-row (:id old-run) (mt/id :orders))]
    (mt/with-dynamic-fn-redefs
      [candidate-mining/qualified-card-ids (constantly [])
       candidate-snapshot/prune-old-snapshots!
       (fn [_current-run-id]
         (t2/delete! :model/UsageMetadataCandidate :id (:id old-candidate))
         (throw (ex-info "Injected snapshot pruning failure" {})))]
      (let [run (queued-run!)]
        (is (thrown-with-msg? Exception
                              #"Injected snapshot pruning failure"
                              (candidate-refresh/run-refresh! run)))
        (is (= :failed
               (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id run))))
        (is (= (:id old-run) (:id (candidate-refresh/latest-successful-run))))
        (is (t2/exists? :model/UsageMetadataCandidate :id (:id old-candidate)))))))

(deftest abnormal-refresh-termination-marks-run-failed-and-rethrows-original-test
  (let [failure (AssertionError. "Injected assertion failure")
        run     (queued-run!)]
    (mt/with-dynamic-fn-redefs [candidate-snapshot/materialize! (fn [_run]
                                                                  (t2/update! :model/UsageMetadataCandidateRun
                                                                              (:id run)
                                                                              {:status :running
                                                                               :started_at (mi/now)})
                                                                  (throw failure))]
      (is (identical? failure
                      (try
                        (candidate-refresh/run-refresh! run)
                        (catch AssertionError error
                          error))))
      (is (= :failed
             (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id run))))
      (is (re-find #"Injected assertion failure"
                   (t2/select-one-fn :error :model/UsageMetadataCandidateRun :id (:id run))))
      (is (not (contains? @locally-running-run-ids (:id run)))))))

(deftest interrupted-refresh-marks-run-failed-and-restores-interrupt-flag-test
  (let [failure (InterruptedException. "Injected interrupt")
        run     (queued-run!)]
    (try
      (mt/with-dynamic-fn-redefs [candidate-snapshot/materialize! (fn [_run]
                                                                    (t2/update! :model/UsageMetadataCandidateRun
                                                                                (:id run)
                                                                                {:status :running
                                                                                 :started_at (mi/now)})
                                                                    (throw failure))]
        (let [{:keys [error interrupted?]}
              (try
                (candidate-refresh/run-refresh! run)
                (catch InterruptedException error
                  ;; Read and clear the flag before test reporting or database work can observe it.
                  {:error error, :interrupted? (Thread/interrupted)}))]
          (is (identical? failure error))
          (is (true? interrupted?)))
        (is (= :failed
               (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id (:id run)))))
      (finally
        (Thread/interrupted)))))

(deftest persisted-refresh-uses-recent-view-source-configuration-test
  (let [batch-opts (atom nil)]
    (mt/with-dynamic-fn-redefs
      [candidate-mining/qualified-card-ids (fn [minimum-view-count window-days]
                                             (is (= 10 minimum-view-count))
                                             (is (= 90 window-days))
                                             [1])
       candidate-builders/candidate-analysis-inputs (constantly {:analysis :inputs})
       candidate-builders/candidate-batch-observations
       (fn [analysis-inputs opts]
         (is (= {:analysis :inputs} analysis-inputs))
         (reset! batch-opts opts)
         {:cleanup {:measures [], :segments []}
          :table-report {:candidates [], :unsupported-source-items []}
          :metrics []})]
      (let [run (queued-run!)]
        (is (= :succeeded (:status (candidate-refresh/run-refresh! run))))
        (is (= {:kind                      "qualified-cards"
                :usage-window-days         90
                :minimum-recent-view-count 10
                :candidate-cutoffs         {:verified {:minimum-total-view-count 10}
                                            :official {:minimum-distinct-source-count 2
                                                       :minimum-total-view-count      10}
                                            :general  {:minimum-distinct-source-count 3
                                                       :minimum-total-view-count      25}}}
               (:source_config (t2/select-one :model/UsageMetadataCandidateRun :id (:id run)))))
        (is (=? {:card-ids #{1}
                 :min-view-count 10
                 :view-count-window-days 90
                 :include-ineligible? true}
                @batch-opts))))))

(deftest persisted-refresh-materializes-table-and-metric-recommendations-test
  (let [table-id          (mt/id :orders)
        metadata-provider (lib-be/application-database-metadata-provider (mt/id))
        table             (lib.metadata/table metadata-provider table-id)
        subtotal          (lib.metadata/field metadata-provider (mt/id :orders :subtotal))
        definition        (-> (lib/query metadata-provider table)
                              (lib/filter (lib/> subtotal 10))
                              (lib/aggregate (lib/count)))]
    (mt/with-temp [:model/Card card {:name "Important orders question"
                                     :type :question}]
      (let [source-item {:id (:id card)
                         :name (:name card)
                         :type :question
                         :verified? true
                         :official-collection? false
                         :popular? true
                         :view-count 20}]
        (mt/with-dynamic-fn-redefs
          [candidate-mining/qualified-card-ids (constantly [(:id card)])
           candidate-builders/candidate-analysis-inputs (constantly {})
           candidate-builders/candidate-batch-observations
           (fn [_analysis-inputs _opts]
             {:cleanup {:measures [], :segments []}
              :table-report
              {:candidates
               [{:table {:id table-id
                         :database-id (mt/id)
                         :database-name "Test Database"
                         :schema "PUBLIC"
                         :name "ORDERS"
                         :display-name "Orders"
                         :description nil
                         :data-layer nil
                         :data-authority nil
                         :view-count 0}
                 :evidence {:source-items [(assoc source-item
                                                  :dependency-paths
                                                  [{:direct? true, :models []}])]
                            :distinct-source-count 1
                            :verified-source-count 1
                            :official-source-count 0
                            :popular-source-count 1
                            :total-view-count 20}}]
               :unsupported-source-items []}
              :metrics
              [{:definition definition
                :suggested-name "Large order count"
                :suggested-description "Count large orders"
                :aggregation (first (lib/aggregations definition 0))
                :required-tables [{:id table-id, :published? false}]
                :evidence {:source-items [(assoc source-item
                                                 :stage-numbers [0]
                                                 :joined? false)]
                           :distinct-source-count 1
                           :verified-source-count 1
                           :official-source-count 0
                           :popular-source-count 1
                           :total-view-count 20}}]})]
          (let [run     (queued-run!)
                result  (candidate-refresh/run-refresh! run)
                rows    (t2/select :model/UsageMetadataCandidate :run_id (:id run))
                by-type (u/index-by :candidate_type rows)]
            (is (= :succeeded (:status result)))
            (is (= {:table-count 1}
                   (:summary result)))
            (is (=? {:suggested_name "Publish Orders"
                     :semantic_details {:source-dependencies [{:card-id (:id card)
                                                               :dependency-paths [{:direct? true, :models []}]}]}}
                    (by-type :table)))
            (is (= (dissoc (lib/normalize definition) :lib/metadata)
                   (:definition (by-type :metric))))))))))

(deftest persisted-observations-merge-evidence-in-batches-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}}
                 :model/Card first-card {:name "First source", :type :question}
                 :model/Card second-card {:name "Second source", :type :question}]
    (let [observation (fn [card views]
                        {:candidate-type :segment
                         :source {:id (mt/id :orders)}
                         :signature "[\"batched-segment\"]"
                         :definition {:table-id (mt/id :orders)}
                         :predicate [:field (mt/id :orders :subtotal) nil]
                         :fields [{:id (mt/id :orders :subtotal)
                                   :name "SUBTOTAL"
                                   :display-name "Subtotal"}]
                         :atoms [{:signature "subtotal", :display-name "Subtotal", :kind :number}]
                         :composite? false
                         :atom-count 1
                         :suggested-name "Subtotal filter"
                         :suggested-description "Filter Orders by Subtotal"
                         :evidence {:source-items [{:id (:id card)
                                                    :name (:name card)
                                                    :type :question
                                                    :verified? false
                                                    :official-collection? false
                                                    :popular? true
                                                    :view-count views
                                                    :stage-numbers [0]
                                                    :joined? false}]
                                    :distinct-source-count 1
                                    :verified-source-count 0
                                    :official-source-count 0
                                    :popular-source-count 1
                                    :total-view-count views}})]
      (persist-observations! (:id run) [(observation first-card 10)])
      (persist-observations! (:id run) [(observation second-card 20)])
      (let [candidate (t2/select-one :model/UsageMetadataCandidate :run_id (:id run))]
        (is (=? {:distinct_source_count 2
                 :popular_source_count 2
                 :recent_view_count 30}
                candidate))
        (is (= #{(:id first-card) (:id second-card)}
               (t2/select-fn-set :card_id :model/UsageMetadataCandidateSource
                                 :candidate_id (:id candidate))))))))

(defn- segment-observation
  [{:keys [card signature views]}]
  {:candidate-type :segment
   :source {:id (mt/id :orders)}
   :signature signature
   :definition {:table-id (mt/id :orders)}
   :predicate [:field (mt/id :orders :subtotal) nil]
   :fields [{:id (mt/id :orders :subtotal)
             :name "SUBTOTAL"
             :display-name "Subtotal"}]
   :atoms [{:signature "subtotal", :display-name "Subtotal", :kind :number}]
   :composite? false
   :atom-count 1
   :suggested-name "Subtotal filter"
   :suggested-description "Filter Orders by Subtotal"
   :evidence {:source-items [{:id (:id card)
                              :name (:name card)
                              :type :question
                              :verified? false
                              :official-collection? false
                              :popular? true
                              :view-count views
                              :stage-numbers [0]
                              :joined? false}]
              :distinct-source-count 1
              :verified-source-count 0
              :official-source-count 0
              :popular-source-count 1
              :total-view-count views}})

(deftest persist-observations-rejects-duplicate-batch-entries-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}}
                 :model/Card card {:name "Duplicate source", :type :question}]
    (let [observation (segment-observation {:card card, :signature "[\"duplicate-segment\"]", :views 10})]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"duplicate observations"
                            (persist-observations! (:id run) [observation observation]))))))

(deftest persist-observations-rejects-signature-hash-collision-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                       :trigger           :manual
                                                       :algorithm_version 1
                                                       :source_config     {}}
                 :model/Card card {:name "Collision source", :type :question}]
    (let [collision-hash (apply str (repeat 64 "9"))]
      (mt/with-dynamic-fn-redefs [candidate-snapshot/sha256 (constantly collision-hash)]
        (persist-observations! (:id run)
                               [(segment-observation {:card card, :signature "[\"existing-signature\"]", :views 10})])
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"signature hash collision"
                              (persist-observations!
                               (:id run)
                               [(segment-observation {:card card, :signature "[\"different-signature\"]", :views 10})])))))))

(deftest fixed-candidate-evidence-cutoffs-test
  (let [base {:candidate_type         :segment
              :semantic_details       {:atom-count 1}
              :complexity             1
              :verified_source_count  0
              :official_source_count  0
              :distinct_source_count  1
              :recent_view_count       0}]
    (testing "verified evidence requires at least 10 total views"
      (is (not (globally-eligible? (assoc base
                                          :verified_source_count 1
                                          :recent_view_count 9))))
      (is (globally-eligible? (assoc base
                                     :verified_source_count 1
                                     :recent_view_count 10))))
    (testing "official evidence requires two distinct sources and 10 total views"
      (is (not (globally-eligible? (assoc base
                                          :official_source_count 1
                                          :distinct_source_count 1
                                          :recent_view_count 100))))
      (is (not (globally-eligible? (assoc base
                                          :official_source_count 1
                                          :distinct_source_count 2
                                          :recent_view_count 9))))
      (is (globally-eligible? (assoc base
                                     :official_source_count 1
                                     :distinct_source_count 2
                                     :recent_view_count 10))))
    (testing "general usage requires three distinct sources and 25 total views"
      (is (not (globally-eligible? (assoc base
                                          :distinct_source_count 2
                                          :recent_view_count 1000))))
      (is (not (globally-eligible? (assoc base
                                          :distinct_source_count 3
                                          :recent_view_count 24))))
      (is (globally-eligible? (assoc base
                                     :distinct_source_count 3
                                     :recent_view_count 25))))
    (testing "evidence cutoffs do not override semantic exclusions"
      (is (not (globally-eligible? (assoc base
                                          :candidate_type :measure
                                          :semantic_details {:type :count, :field nil}
                                          :verified_source_count 1
                                          :distinct_source_count 3
                                          :recent_view_count 100)))))))

(deftest persisted-candidates-are-pruned-by-the-fixed-evidence-cutoffs-test
  (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :running
                                                       :trigger           :manual
                                                       :algorithm_version candidate-refresh/algorithm-version
                                                       :source_config     {}}
                 :model/UsageMetadataCandidate weak-candidate
                 (assoc (candidate-row (:id run) (mt/id :orders))
                        :verified_source_count 0
                        :official_source_count 1
                        :popular_source_count 0
                        :recent_view_count 8)
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
                                                         :algorithm_version candidate-refresh/algorithm-version
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
                    :recent_view_count 12
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
                :recent_view_count 12
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
                                :recent_view_count       100}))))

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
      (is (= :exact (relation-for-segment segment (assoc segment :signature "candidate")))))
    (testing "Measures with no resolvable aggregation base are not conflated with each other"
      (is (nil? (relation-for-measure {:signature "candidate-y", :definition base-query}
                                      {:signature "existing-y", :definition base-query}))))))

(deftest completed-snapshot-survives-source-and-match-deletion-test
  (let [metadata-provider (mt/metadata-provider)
        table             (lib.metadata/table metadata-provider (mt/id :orders))
        subtotal          (lib.metadata/field metadata-provider (mt/id :orders :subtotal))
        definition        (lib/aggregate (lib/query metadata-provider table) (lib/sum subtotal))]
    (mt/with-temp [:model/Card source-card {:name "Revenue by region"}
                   :model/Measure measure {:name        "Revenue"
                                           :description "Recognized revenue"
                                           :creator_id  (mt/user->id :crowberto)
                                           :definition  definition}
                   :model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}}
                   :model/UsageMetadataCandidate candidate
                   (merge (candidate-row (:id run) (mt/id :orders))
                          {:candidate_type  :measure
                           :modeling_status :modeled})]
      (t2/insert! :model/UsageMetadataCandidateSource
                  {:candidate_id  (:id candidate)
                   :card_id       (:id source-card)
                   :card_name     (:name source-card)
                   :card_type     :question
                   :verified      true
                   :official      false
                   :popular       true
                   :recent_view_count 42
                   :joined        false
                   :stage_numbers [0]
                   :model_lineage nil})
      (t2/insert! :model/UsageMetadataCandidateMatch
                  {:candidate_id       (:id candidate)
                   :relation           :exact
                   :entity_id          (:id measure)
                   :entity_name        (:name measure)
                   :entity_description (:description measure)})
      (t2/delete! :model/Card :id (:id source-card))
      (t2/delete! :model/Measure :id (:id measure))
      (is (= {:card_id (:id source-card), :card_name "Revenue by region", :recent_view_count 42}
             (t2/select-one [:model/UsageMetadataCandidateSource :card_id :card_name :recent_view_count]
                            :candidate_id (:id candidate))))
      (is (= {:relation           :exact
              :entity_id          (:id measure)
              :entity_name        "Revenue"
              :entity_description "Recognized revenue"}
             (t2/select-one [:model/UsageMetadataCandidateMatch
                             :relation :entity_id :entity_name :entity_description]
                            :candidate_id (:id candidate))))
      (is (= :modeled
             (t2/select-one-fn :modeling_status :model/UsageMetadataCandidate :id (:id candidate)))))))
