(ns metabase-enterprise.dependencies.findings-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- backfill-all-entity-analyses! []
  (doseq [model [:card :transform :segment]]
    (while (pos? (count (deps.findings/analyze-batch! model 100))))))

(deftest ^:sequential can-analyze-entity-batches-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                     :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}]
        (is (= 2 (count (deps.findings/analyze-batch! :card 2))))
        (is (= #{models.analysis-finding/*current-analysis-finding-version*}
               (t2/select-fn-set :analysis_version
                                 :model/AnalysisFinding
                                 :analyzed_entity_id [:in [card-id other-card-id]]
                                 :analyzed_entity_type :card)))))))

(deftest ^:sequential does-not-repeatedly-analyze-entities-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card _ {:dataset_query (lib/query mp products)}
                     :model/Card _ {:dataset_query (lib/query mp orders)}]
        (is (= 2 (count (deps.findings/analyze-batch! :card 2))))
        (is (= 0 (count (deps.findings/analyze-batch! :card 2))))))))

(deftest ^:sequential re-analyze-entities-when-analysis-version-bumped-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products (lib.metadata/table mp (mt/id :products))
        orders (lib.metadata/table mp (mt/id :orders))]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card _ {:dataset_query (lib/query mp products)}
                     :model/Card _ {:dataset_query (lib/query mp orders)}]
        (is (= 2 (count (deps.findings/analyze-batch! :card 2))))
        (is (= 0 (count (deps.findings/analyze-batch! :card 2))))
        (binding [models.analysis-finding/*current-analysis-finding-version* (inc models.analysis-finding/*current-analysis-finding-version*)]
          (is (= 2 (count (deps.findings/analyze-batch! :card 2)))))))))

(deftest ^:sequential does-analyze-native-entities-test
  (testing "failed analysis result is appropriately stored in the appdb"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query mp "utter nonsense")}]
          (is (= 1 (count (deps.findings/analyze-batch! :card 1))))
          (is (= [models.analysis-finding/*current-analysis-finding-version* false]
                 (t2/select-one-fn (juxt :analysis_version :result)
                                   :model/AnalysisFinding
                                   :analyzed_entity_id card-id
                                   :analyzed_entity_type :card))))))))

(deftest ^:sequential does-report-errors-for-missing-refs-in-fields-test
  (testing "missing (not inactive) field refs in :fields are reported as findings (GHY-3157)"
    (backfill-all-entity-analyses!)
    (let [mp      (mt/metadata-provider)
          orders  (lib.metadata/table mp (mt/id :orders))
          base    (lib/query mp orders)
          cols    (vec (take 5 (lib/returned-columns base orders)))
          bad-col (-> (first cols)
                      lib/ref
                      (assoc 2 "bad_column"))
          query   (lib/with-fields base (conj cols bad-col))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
          (is (= 1 (count (deps.findings/analyze-batch! :card 1))))
          (is (= [models.analysis-finding/*current-analysis-finding-version* false]
                 (t2/select-one-fn (juxt :analysis_version :result)
                                   :model/AnalysisFinding
                                   :analyzed_entity_id card-id
                                   :analyzed_entity_type :card))))))))

;; TODO: (bshepherdson, 2026-02-05) Add a test like does-not-report-errors-in-removable-refs-test-1-stage-fields for
;; join clause :fields as well. See QUE-3081 and QUE-3044.

(deftest ^:parallel reports-missing-field-in-downstream-card-fields-test
  (testing "Q2 based on Q1 with :fields referencing a column Q1 no longer returns should be reported (GHY-3157)"
    (let [mp          meta/metadata-provider
          q1          (lib/query mp (meta/table-metadata :orders))
          q1-cols     (lib/returned-columns q1)
          removed-col (m/find-first #(= (:name %) "ID") q1-cols)
          ;; Card 101 = Q1 with ID removed from result-metadata (simulates Q1 dropping that field)
          mp          (lib.tu/metadata-provider-with-card-from-query
                       mp 101 q1
                       {:result-metadata (vec (remove #(= (:name %) "ID") q1-cols))})
          ;; Q2: query based on card 101, with :fields including the now-missing ID
          q2-base     (lib/query mp {:lib/type :metadata/card :id 101})
          q2-cols     (lib/returned-columns q2-base)
          q2          (lib/with-fields q2-base (conj (vec q2-cols) (lib/ref removed-col)))
          ;; Card 102 = Q2 (provide result-metadata explicitly since q2 has a bad ref)
          mp          (lib.tu/metadata-provider-with-card-from-query
                       mp 102 q2
                       {:result-metadata (vec q2-cols)})
          results     (deps.analysis/check-entity mp :card 102)]
      (is (seq results)
          "Q2 should have findings for the missing ID column from Q1"))))

(defn- stale-map
  "Returns a map of {entity-id stale?} for the given card IDs."
  [card-ids]
  (t2/select-fn->fn :analyzed_entity_id :stale :model/AnalysisFinding
                    :analyzed_entity_type :card
                    :analyzed_entity_id [:in card-ids]))

(defn- finding-stale?
  "Returns the stale value for a specific entity's analysis finding, or nil if no finding exists."
  [entity-type entity-id]
  (t2/select-one-fn :stale :model/AnalysisFinding
                    :analyzed_entity_type entity-type
                    :analyzed_entity_id entity-id))

(deftest ^:sequential analyze-batch-picks-up-missing-analyses-test
  (testing "analyze-batch! picks up entities with no pre-existing AnalysisFinding"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}]
            (testing "card has no analysis finding initially"
              (is (not (t2/exists? :model/AnalysisFinding
                                   :analyzed_entity_type :card
                                   :analyzed_entity_id card-id))))
            (testing "analyze-batch! creates analysis for the card"
              (lib-be/with-metadata-provider-cache
                (is (pos? (count (deps.findings/analyze-batch! :card 10))))))
            (testing "card now has an analysis finding"
              (is (t2/exists? :model/AnalysisFinding
                              :analyzed_entity_type :card
                              :analyzed_entity_id card-id)))))))))

(deftest mark-dependents-stale-test
  (testing "mark-dependents-stale! marks direct dependents as stale"
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (lib-be/with-metadata-provider-cache
          (mt/with-model-cleanup [:model/AnalysisFinding]
            (mt/with-temp [:model/Card {parent-card-id :id} {:dataset_query (lib/query mp products)}
                           :model/Card {child-card-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                           :model/Dependency _ {:from_entity_type :card
                                                :from_entity_id child-card-id
                                                :to_entity_type :card
                                                :to_entity_id parent-card-id}]
              (run! deps.findings/upsert-analysis!
                    (t2/select :model/Card :id [:in [parent-card-id child-card-id]]))
              (is (= {parent-card-id false, child-card-id false}
                     (stale-map [parent-card-id child-card-id]))
                  "neither should be stale before marking")
              (t2/with-transaction [_conn]
                (deps.findings/mark-dependents-stale! :card parent-card-id)
                (is (= {parent-card-id false, child-card-id true}
                       (stale-map [parent-card-id child-card-id]))
                    "parent should NOT be stale, child should be stale")))))))))

(deftest mark-dependents-stale-transitive-test
  (testing "mark-dependents-stale! marks transitive dependents as stale"
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (lib-be/with-metadata-provider-cache
          (mt/with-model-cleanup [:model/AnalysisFinding]
            (mt/with-temp [:model/Card {grandparent-id :id} {:dataset_query (lib/query mp products)}
                           :model/Card {parent-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp grandparent-id))}
                           :model/Card {child-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                           :model/Dependency _ {:from_entity_type :card
                                                :from_entity_id parent-id
                                                :to_entity_type :card
                                                :to_entity_id grandparent-id}
                           :model/Dependency _ {:from_entity_type :card
                                                :from_entity_id child-id
                                                :to_entity_type :card
                                                :to_entity_id parent-id}]
              (run! deps.findings/upsert-analysis!
                    (t2/select :model/Card :id [:in [grandparent-id parent-id child-id]]))
              (t2/with-transaction [_conn]
                (deps.findings/mark-dependents-stale! :card grandparent-id)
                (is (= {grandparent-id false, parent-id true, child-id true}
                       (stale-map [grandparent-id parent-id child-id]))
                    "grandparent should NOT be stale, parent and child should be stale (transitive)")))))))))

(defn- analyzed-at [card-id]
  (t2/select-one-fn :analyzed_at :model/AnalysisFinding
                    :analyzed_entity_type :card :analyzed_entity_id card-id))

(def ^:private past-sentinel
  "A fixed past timestamp used to make re-analysis observable within a single test transaction."
  #t "2000-01-01T00:00:00Z")

(defn- stamp-analyzed-at-to-past!
  "Stamp `card-id`'s `analyzed_at` to `past-sentinel` and return the stored value, so a later
  re-analysis is observable: it overwrites the sentinel, while no re-analysis leaves it unchanged."
  [card-id]
  ;; `mi/now` is Postgres `now()` = transaction-start time, and the whole test runs in one
  ;; rolled-back transaction, so a plain before/after snapshot is identical whether or not the
  ;; entity was re-analyzed. The past sentinel breaks that tie. Read the value back rather than
  ;; comparing to the literal: the appdb round-trips ZonedDateTime -> OffsetDateTime, never `=` to
  ;; the literal even at the same instant.
  (t2/update! :model/AnalysisFinding
              :analyzed_entity_type :card :analyzed_entity_id card-id
              {:analyzed_at past-sentinel})
  (analyzed-at card-id))

(deftest ^:sequential reanalysis-without-output-change-does-not-cascade-test
  (testing "Re-analyzing a stale entity whose output is unchanged clears it but does NOT cascade to its dependents (#75748)"
    ;; Propagation is gated on the entity's output identity changing. Marking p stale when nothing
    ;; about p's output changed must clear p without re-checking c — otherwise an upstream cycle or
    ;; a sync that touched nothing would fan re-analysis through the whole closure (the old bug).
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding]
          (mt/with-temp [:model/Card {gp-id :id :as gp-card} {:dataset_query (lib/query mp products)}
                         :model/Card {p-id :id :as p-card} {:dataset_query (lib/query mp (lib.metadata/card mp gp-id))}
                         :model/Card {c-id :id :as c-card} {:dataset_query (lib/query mp (lib.metadata/card mp p-id))}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id p-id
                                              :to_entity_type :card :to_entity_id gp-id}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id c-id
                                              :to_entity_type :card :to_entity_id p-id}]
            ;; cache only the initial analysis; the job manages its own per-batch caches, and
            ;; wrapping it in an outer cache would serve it stale metadata after the updates below
            (lib-be/with-metadata-provider-cache
              (run! deps.findings/upsert-analysis! [gp-card p-card c-card]))
            ;; stamp c's analyzed_at to a past sentinel so a re-analysis is observable; "no cascade"
            ;; means it stays the sentinel (see stamp-analyzed-at-to-past! for the rationale) (#75748)
            (let [sentinel (stamp-analyzed-at-to-past! c-id)]
              ;; mark p stale without changing anything about p's output
              (models.analysis-finding/mark-stale! :card [p-id])
              (#'task.entity-check/check-entities!)
              (is (= {gp-id false, p-id false, c-id false}
                     (stale-map [gp-id p-id c-id]))
                  "p is re-analyzed and cleared; the loop terminates with nothing stale")
              (is (= sentinel (analyzed-at c-id))
                  "c was NOT re-analyzed — p's output didn't change, so the wave did not cascade"))))))))

(deftest ^:sequential output-change-cascades-through-entity-check-test
  (testing "When an upstream's output changes, the entity-check wave re-checks transitive dependents (#75748)"
    ;; The positive counterpart: a real output change at gp must reach c. We give each card an
    ;; explicit result-metadata (what dependents resolve against) and then drop a column from gp's
    ;; and p's stored metadata — exactly what metadata propagation does after an upstream column is
    ;; removed — and assert the wave reaches c.
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          rmeta [{:name "A" :base_type :type/Integer :display_name "A"}
                 {:name "B" :base_type :type/Integer :display_name "B"}
                 {:name "C" :base_type :type/Integer :display_name "C"}]]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding]
          (mt/with-temp [:model/Card {gp-id :id :as gp-card} {:dataset_query (lib/query mp products) :result_metadata rmeta}
                         :model/Card {p-id :id :as p-card} {:dataset_query (lib/query mp products) :result_metadata rmeta}
                         :model/Card {c-id :id :as c-card} {:dataset_query (lib/query mp products) :result_metadata rmeta}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id p-id
                                              :to_entity_type :card :to_entity_id gp-id}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id c-id
                                              :to_entity_type :card :to_entity_id p-id}]
            (lib-be/with-metadata-provider-cache
              (run! deps.findings/upsert-analysis! [gp-card p-card c-card]))
            ;; stamp c's analyzed_at to a past sentinel so a re-analysis is observable; a real
            ;; cascade overwrites it (see stamp-analyzed-at-to-past! for the rationale) (#75748)
            (let [sentinel (stamp-analyzed-at-to-past! c-id)]
              ;; an upstream column drop, propagated to each level's stored metadata. Done outside
              ;; any provider cache so the job sees the new metadata (it makes fresh per-batch caches).
              (t2/update! :model/Card gp-id {:result_metadata (vec (take 2 rmeta))})
              (t2/update! :model/Card p-id {:result_metadata (vec (take 2 rmeta))})
              (models.analysis-finding/mark-stale! :card [gp-id])
              (#'task.entity-check/check-entities!)
              (is (= {gp-id false, p-id false, c-id false}
                     (stale-map [gp-id p-id c-id]))
                  "the wave drains and the loop terminates")
              (is (not= sentinel (analyzed-at c-id))
                  "c was re-analyzed — gp's output change cascaded gp→p→c"))))))))

(deftest ^:sequential wave-propagation-through-non-analyzable-entity-test
  (testing "Wave propagation skips non-analyzable intermediaries (e.g., tables) and reaches cards beyond them"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          products-id (mt/id :products)]
      (mt/with-premium-features #{:dependencies}
        (lib-be/with-metadata-provider-cache
          (mt/with-model-cleanup [:model/AnalysisFinding]
            ;; Chain: transform → (depends on) table ← (depends on) card
            ;; Table is not analyzable, but card should still be reached by the wave
            (mt/with-temp [:model/Transform {transform-id :id :as transform}
                           {:source {:type :query :query (lib/query mp products)}
                            :name "test_wave_transform"
                            :target {:schema "public" :name "wave_test_table" :type :table}}
                           :model/Card {card-id :id :as card}
                           {:dataset_query (lib/query mp products)}
                           ;; table depends on transform (downstream of transform)
                           :model/Dependency _ {:from_entity_type :table :from_entity_id products-id
                                                :to_entity_type :transform :to_entity_id transform-id}
                           ;; card depends on the same table
                           :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                                :to_entity_type :table :to_entity_id products-id}]
              ;; Analyze the transform and card (tables aren't analyzable)
              (deps.findings/upsert-analysis! transform)
              (deps.findings/upsert-analysis! card)
              (is (false? (finding-stale? :card card-id))
                  "card should start as not stale")
              ;; Mark only immediate dependents of transform stale
              ;; The immediate dependent is the table, which is NOT analyzable
              ;; The card is two hops away: transform → table → card
              (deps.findings/mark-immediate-dependents-stale! :transform transform-id)
              ;; The look-through should have reached the card through the non-analyzable table
              (is (true? (finding-stale? :card card-id))
                  "card should be stale — look-through reached it via non-analyzable table")
              ;; Run entity-check to drain stale entities
              (#'task.entity-check/check-entities!)
              (is (false? (finding-stale? :card card-id))
                  "card should be re-analyzed after entity-check"))))))))

(deftest ^:sequential re-staled-after-being-seen-carries-to-next-run-test
  (testing (str "A node re-staled AFTER it was already analyzed this run is left stale until the NEXT "
                "run — `check-entities!` convergence is eventual, not necessarily within a single run "
                "(#75748). The per-run `seen` set bounds the loop: once an upstream is in `seen`, a "
                "terminal pass that re-analyzes it (and re-stales a downstream) turns up nothing NEW, "
                "so the loop stops with the downstream still stale.")
    ;; Diamond: C depends on A and B. The natural ordering of the within-run re-stale depends on the
    ;; appdb's intra-batch row order, which has no secondary sort key and so is not guaranteed — making
    ;; a fully organic reproduction flaky. We instead pin the LOOP SEMANTIC deterministically: model an
    ;; upstream that is re-staled and re-analyzed in a *terminal* pass (already in `seen`) and re-stales
    ;; an already-analyzed C. Each pass below carries exactly one entity, so there is no ordering
    ;; ambiguity. Concretely:
    ;;   pass 1: A (stale, output moved) → marks C stale
    ;;   pass 2: C analyzed and cleared; we then re-stale A (already seen) and move A's stored metadata
    ;;           again so A's next analysis changes output
    ;;   pass 3: batch = {A} (already in `seen`) → A re-analyzed, output moves → re-stales C; the loop
    ;;           turns up nothing NEW and STOPS, leaving C stale → carried to the next run.
    (backfill-all-entity-analyses!)
    (let [mp       (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          rmeta3   [{:name "A" :base_type :type/Integer :display_name "A"}
                    {:name "B" :base_type :type/Integer :display_name "B"}
                    {:name "C" :base_type :type/Integer :display_name "C"}]
          rmeta2   (vec (take 2 rmeta3))
          rmeta1   (vec (take 1 rmeta3))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding]
          (mt/with-temp [:model/Card {a-id :id :as a-card} {:dataset_query (lib/query mp products) :result_metadata rmeta3}
                         :model/Card {b-id :id :as b-card} {:dataset_query (lib/query mp products) :result_metadata rmeta3}
                         :model/Card {c-id :id :as c-card} {:dataset_query (lib/query mp products) :result_metadata rmeta3}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id c-id
                                              :to_entity_type :card :to_entity_id a-id}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id c-id
                                              :to_entity_type :card :to_entity_id b-id}]
            (lib-be/with-metadata-provider-cache
              (run! deps.findings/upsert-analysis! [a-card b-card c-card]))
            ;; A's first output change, propagated to its stored metadata; only A is marked stale.
            (t2/update! :model/Card a-id {:result_metadata rmeta2})
            (models.analysis-finding/mark-stale! :card [a-id])
            (let [orig    (mt/original-fn #'task.entity-check/process-one-batch!)
                  bumped? (atom false)]
              ;; After the pass that analyzes (and clears) C, re-stale A — which is already in the run's
              ;; `seen` set — and move A's stored metadata again so its terminal-pass re-analysis changes
              ;; output and re-stales C. This is the within-run re-stale-after-seen the loop must defer.
              (mt/with-dynamic-fn-redefs [task.entity-check/process-one-batch!
                                          (fn []
                                            (let [processed (orig)]
                                              (when (and (not @bumped?) (contains? processed [:card c-id]))
                                                (reset! bumped? true)
                                                (t2/update! :model/Card a-id {:result_metadata rmeta1})
                                                (models.analysis-finding/mark-stale! :card [a-id]))
                                              processed))]
                (#'task.entity-check/check-entities!)))
            (is (= {a-id false, b-id false, c-id true}
                   (stale-map [a-id b-id c-id]))
                "C was re-staled by an already-seen upstream in a terminal pass, so it is LEFT stale after run 1")
            ;; the next run has a fresh `seen` set and drains C
            (#'task.entity-check/check-entities!)
            (is (= {a-id false, b-id false, c-id false}
                   (stale-map [a-id b-id c-id]))
                "the next run clears C — convergence is eventual across runs")))))))
