(ns metabase-enterprise.dependencies.task.entity-check-test
  "Regression tests for the dependency entity-check job's termination behavior (#75748).

  The entity-check job must terminate on a cyclic dependency graph (e.g. a card that references
  itself, or two cards that reference each other) and on an entity that can never clear its stale
  flag. Termination rests on two properties:
  1. Staleness propagates only when an entity's output actually changes, so a cycle member that
     reproduces its output on re-analysis stops the wave.
  2. No entity is analyzed more than once per run — a structural bound that holds regardless of
     propagation."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.lib-be.core :as lib-be]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- stale?
  [card-id]
  (t2/select-one-fn :stale :model/AnalysisFinding
                    :analyzed_entity_type :card :analyzed_entity_id card-id))

(defn- analyze-once!
  "Run a single `analyze-and-propagate!` for a card, as the entity-check loop does per entity."
  [card]
  (lib-be/with-metadata-provider-cache
    (#'deps.findings/analyze-and-propagate! (t2/instance :model/Card card))))

(deftest unchanged-reanalysis-does-not-repropagate-test
  (testing "Re-analyzing an entity whose result is unchanged must not re-mark its dependents stale (#75748)."
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingError]
        (mt/with-temp [:model/Card card {:dataset_query (mt/native-query {:query "SELECT 1 AS x"})
                                         :database_id   (mt/id)}
                       ;; self-edge: the card is its own direct dependent
                       :model/Dependency _ {:from_entity_type :card :from_entity_id (:id card)
                                            :to_entity_type   :card :to_entity_id   (:id card)}]
          (let [cid (:id card)]
            ;; first analysis: a brand-new finding is a change, so it propagates (marks self stale)
            (analyze-once! card)
            (is (true? (stale? cid))
                "first analysis of a self-dependent card propagates and re-marks it stale")
            ;; second analysis: identical result, so propagation must stop here
            (analyze-once! card)
            (is (false? (stale? cid))
                "second analysis produces the same result, so the card must not be re-marked stale")))))))

(deftest entity-check-terminates-on-cycle-test
  (testing "check-entities! terminates on a cyclic dependency graph instead of spinning forever (#75748)."
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingError]
        (mt/with-temp [:model/Card a {:dataset_query (mt/native-query {:query "SELECT 1 AS a"})
                                      :database_id   (mt/id)}
                       :model/Card b {:dataset_query (mt/native-query {:query "SELECT 2 AS b"})
                                      :database_id   (mt/id)}
                       ;; mutual cycle: a depends on b, b depends on a
                       :model/Dependency _ {:from_entity_type :card :from_entity_id (:id a)
                                            :to_entity_type   :card :to_entity_id   (:id b)}
                       :model/Dependency _ {:from_entity_type :card :from_entity_id (:id b)
                                            :to_entity_type   :card :to_entity_id   (:id a)}]
          (let [aid (:id a), bid (:id b)]
            (testing "the job returns (does not hang) on a cycle"
              ;; with-timeout so a regression fails fast instead of hanging CI forever; the fix
              ;; drains this cycle in ~two passes (milliseconds).
              (is (nil? (u/with-timeout 30000
                          (mt/with-premium-features #{:dependencies}
                            (#'task.entity-check/check-entities!))))))
            (testing "both cycle members end up analyzed and not perpetually stale"
              (is (false? (stale? aid)))
              (is (false? (stale? bid))))))))))

(deftest unanalyzable-entity-records-terminal-error-test
  (testing "A stale entity whose database can't be resolved records a terminal error finding instead of spinning (#75748)."
    ;; No cycle and no dependents — this is the cycle-free non-termination mode: an entity that is
    ;; stale but whose analysis used to silently no-op (instance-db-id -> nil) and so could never
    ;; clear its stale flag. The fix records a terminal error, clearing the flag.
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingError]
        (mt/with-temp [:model/Card card {:dataset_query (mt/native-query {:query "SELECT 1"})
                                         :database_id   (mt/id)}]
          (let [cid (:id card)]
            ;; give it a clean finding, mark it stale, then make its database unresolvable
            (deps.analysis-finding/upsert-analysis! :card cid true [] "seed")
            (deps.analysis-finding/mark-stale! :card [cid])
            (with-redefs-fn {#'deps.findings/instance-db-id (constantly nil)}
              (fn []
                (lib-be/with-metadata-provider-cache
                  (#'deps.findings/analyze-and-propagate! (t2/instance :model/Card card)))))
            (is (false? (stale? cid))
                "the stale flag is cleared, so the entity stops being re-selected forever")
            (is (seq (deps.analysis-finding-error/errors-for-entity :card cid))
                "an error finding is recorded explaining why the entity couldn't be analyzed")))))))
