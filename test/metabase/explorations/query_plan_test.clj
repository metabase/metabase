(ns metabase.explorations.query-plan-test
  "Tests for the orchestrator's planner-selection logic. Planner-specific
  validators and variant emission live in
  `metabase.explorations.query-plan.llm-test` and
  `metabase.explorations.query-plan.mechanical-test`."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan :as query-plan]
   [metabase.explorations.query-plan.adaptive :as qp.adaptive]
   [metabase.explorations.query-plan.llm :as qp.llm]
   [metabase.explorations.query-plan.mechanical :as qp.mech]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.explorations.settings :as explorations.settings]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- count-metric-query []
  (lib/->legacy-MBQL
   (let [mp (mt/metadata-provider)]
     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
         (lib/aggregate (lib/count))))))

(deftest pick-planner-test
  (testing ":auto + LLM configured → LLM planner"
    (mt/with-temporary-setting-values [explorations-query-planner :auto]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.llm/planner (query-plan/pick-planner!)))
        (is (= :llm (planner/planner-name (query-plan/pick-planner!)))))))
  (testing ":auto + LLM unconfigured → mechanical planner (no skip)"
    (mt/with-temporary-setting-values [explorations-query-planner :auto]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!)))
        (is (= :mechanical (planner/planner-name (query-plan/pick-planner!)))))))
  (testing ":llm + LLM configured → LLM planner"
    (mt/with-temporary-setting-values [explorations-query-planner :llm]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.llm/planner (query-plan/pick-planner!))))))
  (testing ":llm + LLM unconfigured → skip-no-llm"
    (mt/with-temporary-setting-values [explorations-query-planner :llm]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (= {:skip :skip-no-llm} (query-plan/pick-planner!))))))
  (testing ":mechanical always picks mechanical, regardless of LLM availability"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!))))
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!))))))
  (testing ":adaptive always picks adaptive (no LLM dependency)"
    (mt/with-temporary-setting-values [explorations-query-planner :adaptive]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (identical? qp.adaptive/planner (query-plan/pick-planner!)))
        (is (= :adaptive (planner/planner-name (query-plan/pick-planner!))))))))

(deftest planner-protocol-implementations-test
  (testing "Every planner singleton satisfies the QueryPlanner protocol"
    (is (satisfies? planner/QueryPlanner qp.llm/planner))
    (is (satisfies? planner/QueryPlanner qp.mech/planner))
    (is (satisfies? planner/QueryPlanner qp.adaptive/planner)))
  (testing "Each planner names itself"
    (is (= :llm        (planner/planner-name qp.llm/planner)))
    (is (= :mechanical (planner/planner-name qp.mech/planner)))
    (is (= :adaptive   (planner/planner-name qp.adaptive/planner)))))

(deftest planner-setting-default-test
  (testing "explorations-query-planner defaults to :adaptive"
    (is (= :adaptive (explorations.settings/explorations-query-planner)))))

(deftest pick-planner-unknown-value-throws-test
  (testing "an unrecognized value (a new enum entry not wired into the case) throws, rather than
            silently running mechanical — the setting's setter keeps real writes in the enum, and
            generate-query-plan!'s catch keeps this from crashing beyond the one thread"
    (with-redefs [explorations.settings/explorations-query-planner (constantly :bogus)
                  metabot.settings/llm-metabot-configured?         (constantly false)]
      (is (thrown? clojure.lang.ExceptionInfo (query-plan/pick-planner!))))))

(deftest planner-setting-rejects-invalid-value-test
  (testing "setting an invalid planner coerces to the default rather than storing a value that would
            force pick-planner! onto its fallback every run"
    (mt/with-temporary-setting-values [explorations-query-planner :bogus]
      (is (= :adaptive (explorations.settings/explorations-query-planner))))
    (testing "a valid value is stored unchanged"
      (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
        (is (= :mechanical (explorations.settings/explorations-query-planner)))))))

;;; ---------------------------------------------------------------------------
;;; Failure resilience (orchestrator, end-to-end through the DB)
;;; ---------------------------------------------------------------------------

(defn- one-metric-dim-group!
  "Insert a single metric×dimension group on `thread-id` (enough for the mechanical
  matrix to emit items), pairing `metric-card-id` with venues.price as dim d1."
  [thread-id metric-card-id]
  (t2/insert! :model/ExplorationThreadGroup
              {:exploration_thread_id thread-id
               :metrics    [{:card_id metric-card-id
                             :dimension_mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                                                   :target ["field" {} (mt/id :venues :price)]}]}]
               :dimensions [{:dimension_id "d1" :display_name "Price" :effective_type "type/Number"}]
               :position   0}))

(deftest adaptive-failure-falls-back-to-mechanical-test
  (testing "when an adaptive/LLM planner fails, the orchestrator falls back to the mechanical
            matrix (which runs no live queries) instead of terminal-failing the exploration"
    (let [failing-adaptive (reify planner/QueryPlanner
                             (planner-name [_] :adaptive)
                             (plan!        [_ _] {:outcome :failed :final-errors ["boom"]}))]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (one-metric-dim-group! (:id t) (:id metric))
        (with-redefs [query-plan/pick-planner! (constantly failing-adaptive)]
          (is (= :ok (query-plan/generate-query-plan! (:id t)))
              "fell back to mechanical and succeeded"))
        (is (pos? (t2/count :model/ExplorationQuery :exploration_thread_id (:id t)))
            "mechanical matrix rows were materialized")))))

(deftest emitted-but-unmaterializable-plan-is-failed-not-ok-test
  (testing "an :ok plan whose items all fail to materialize is treated as a failure, not a silent
            empty 'success' (which would leave the thread completed with zero charts)"
    (let [bogus-planner (reify planner/QueryPlanner
                          ;; :mechanical so this exercises the zero-rows path itself, not the fallback.
                          (planner-name [_] :mechanical)
                          (plan!        [_ _] {:outcome :ok
                                               :plan [{:group_id 999999 :metric_id 999999
                                                       :dimension_id "nope" :variant "__nonexistent__"}]}))]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (one-metric-dim-group! (:id t) (:id metric))
        (with-redefs [query-plan/pick-planner! (constantly bogus-planner)]
          (is (= :failed (query-plan/generate-query-plan! (:id t)))
              "0 materialized rows → :failed, not :ok"))
        (is (zero? (t2/count :model/ExplorationQuery :exploration_thread_id (:id t)))
            "no rows inserted")
        (is (some? (t2/select-one-fn :completed_at :model/ExplorationThread :id (:id t)))
            "thread terminally stamped so the completion machinery doesn't deadlock")))))

;;; ---------------------------------------------------------------------------
;;; Materialization stamps group_id (mechanical planner, end-to-end through the DB)
;;; ---------------------------------------------------------------------------

(deftest materialize-stamps-group-id-test
  (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}
                      {:dimension_id "d2" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :name)]}]
            mk-group (fn [dim-id disp etype]
                       (first (t2/insert-returning-instances!
                               :model/ExplorationThreadGroup
                               {:exploration_thread_id (:id t)
                                :metrics               [{:card_id cid :dimension_mappings mappings}]
                                :dimensions            [{:dimension_id dim-id :display_name disp
                                                         :effective_type etype}]
                                :position              0})))
            g1       (mk-group "d1" "Price" "type/Number")
            g2       (mk-group "d2" "Name" "type/Text")]
        (is (= :ok (query-plan/generate-query-plan! (:id t))))
        (let [rows     (t2/select [:model/ExplorationQuery :group_id :card_id :dimension_id]
                                  :exploration_thread_id (:id t))
              by-group (group-by :group_id rows)]
          (testing "every materialized row carries a group_id"
            (is (every? :group_id rows))
            (is (= #{(:id g1) (:id g2)} (set (keys by-group)))))
          (testing "each group's rows only reference that group's (metric, dim) pair"
            (is (every? #(= "d1" (:dimension_id %)) (by-group (:id g1))))
            (is (every? #(= "d2" (:dimension_id %)) (by-group (:id g2))))
            (is (every? #(= cid (:card_id %)) rows))))))))

(deftest duplicate-pair-across-groups-materializes-once-per-group-test
  (testing "the same (metric, dim) in two groups produces rows under each group"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [cid      (:id metric)
              mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                         :target ["field" {} (mt/id :venues :price)]}]
              dims     [{:dimension_id "d1" :display_name "Price" :effective_type "type/Number"}]
              mk       (fn [] (first (t2/insert-returning-instances!
                                      :model/ExplorationThreadGroup
                                      {:exploration_thread_id (:id t)
                                       :metrics    [{:card_id cid :dimension_mappings mappings}]
                                       :dimensions dims :position 0})))
              g1       (mk)
              g2       (mk)]
          (is (= :ok (query-plan/generate-query-plan! (:id t))))
          (let [by-group (group-by :group_id (t2/select [:model/ExplorationQuery :group_id :dimension_id]
                                                        :exploration_thread_id (:id t)))]
            (is (= #{(:id g1) (:id g2)} (set (keys by-group))) "rows under both groups")
            (is (pos? (count (by-group (:id g1)))))
            (is (pos? (count (by-group (:id g2)))))))))))
